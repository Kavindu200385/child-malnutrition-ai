import os
import math
import threading
from typing import Any, Dict, List, Tuple, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from .model_loader import prediction_model, current_birth_2_model, current_2_5_model, MODELS_DIR  # type: ignore

# ---------------------------------------------------------------------------
# LOGISTIC REGRESSION — comparison model (lazy-trained on synthetic WHO data)
# ---------------------------------------------------------------------------
# The model is built once on first use using synthetic data generated from
# WHO Z-score thresholds (the same thresholds used in clinical practice).
# Labels:  0=Normal, 1=MAM, 2=SAM
# This allows a direct, fair comparison with the primary XGBoost model.

_lr_lock = threading.Lock()
_lr_pipeline: Optional[Pipeline] = None  # lazy singleton

_LR_LABEL_MAP = {0: "Normal", 1: "MAM", 2: "SAM"}
_LR_LABEL_MAP_INV = {v: k for k, v in _LR_LABEL_MAP.items()}


def _build_lr_training_data(n_per_class: int = 800) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate synthetic training samples based on WHO Z-score thresholds.
    Each sample is (WFA_Z, HFA_Z, WFH_Z, age_months, weight_kg, height_cm, sex_enc).
    Labels:
        SAM   → WFH_Z < -3  OR  WFA_Z < -3
        MAM   → -3 <= WFH_Z < -2  OR  -3 <= WFA_Z < -2
        Normal → otherwise
    """
    rng = np.random.default_rng(42)
    rows, labels = [], []

    def _sample_vitals():
        age = rng.integers(0, 60)
        sex = rng.integers(0, 2)  # 0=F, 1=M
        return int(age), int(sex)

    # Normal class: all Z-scores well above -2
    for _ in range(n_per_class):
        wfa = rng.uniform(-1.9, 2.5)
        hfa = rng.uniform(-1.9, 2.5)
        wfh = rng.uniform(-1.9, 2.5)
        age, sex = _sample_vitals()
        rows.append([wfa, hfa, wfh, age, sex])
        labels.append(0)

    # MAM class: at least one Z-score in [-3, -2)
    for _ in range(n_per_class):
        wfh = rng.uniform(-2.99, -2.0)
        wfa = rng.uniform(-2.5, -1.0)
        hfa = rng.uniform(-2.5, 0.5)
        age, sex = _sample_vitals()
        rows.append([wfa, hfa, wfh, age, sex])
        labels.append(1)

    # SAM class: at least one Z-score below -3
    for _ in range(n_per_class):
        wfh = rng.uniform(-5.0, -3.0)
        wfa = rng.uniform(-5.0, -2.5)
        hfa = rng.uniform(-4.5, -2.0)
        age, sex = _sample_vitals()
        rows.append([wfa, hfa, wfh, age, sex])
        labels.append(2)

    return np.array(rows, dtype=np.float32), np.array(labels, dtype=np.int32)


def _get_lr_pipeline() -> Pipeline:
    """Return the singleton LR pipeline, training it on first access."""
    global _lr_pipeline
    if _lr_pipeline is not None:
        return _lr_pipeline
    with _lr_lock:
        if _lr_pipeline is not None:  # double-checked
            return _lr_pipeline
        X, y = _build_lr_training_data(n_per_class=1000)
        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(
                solver="lbfgs",
                max_iter=500,
                C=1.0,
                random_state=42,
            )),
        ])
        pipe.fit(X, y)
        _lr_pipeline = pipe
    return _lr_pipeline


def predict_with_logistic_regression(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run the Logistic Regression comparison model.
    Same interface as predict_current_risk().
    """
    try:
        age = int(data["age_months"])
        sex_raw = str(data["sex"])
        weight = float(data["weight_kg"])
        height = float(data["height_cm"])

        wfa, hfa, wfh = compute_z_scores(age_months=age, sex=sex_raw, weight_kg=weight, height_cm=height)
        sex_enc = 1 if sex_raw.upper() == "M" else 0

        X = np.array([[wfa, hfa, wfh, age, sex_enc]], dtype=np.float32)
        pipe = _get_lr_pipeline()
        pred_int = int(pipe.predict(X)[0])
        proba = pipe.predict_proba(X)[0]
        confidence = round(float(np.max(proba)), 3)
        class_probs = {_LR_LABEL_MAP[i]: round(float(p), 3) for i, p in enumerate(proba)}

        return {
            "ok": True,
            "model_name": "Logistic Regression",
            "model_prediction": _LR_LABEL_MAP[pred_int],
            "confidence": confidence,
            "class_probabilities": class_probs,
            "z_scores": {"WFA_Z": wfa, "HFA_Z": hfa, "WFH_Z": wfh},
        }
    except Exception as e:
        return {"ok": False, "model_name": "Logistic Regression", "error": str(e)}


def compare_models(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run BOTH the primary XGBoost Stacking Ensemble AND the Logistic Regression model
    and return a side-by-side comparison — useful for evaluation / reporting.

    Input keys: age_months, sex, weight_kg, height_cm
    """
    # The stacking classifier may emit numeric codes — map them to labels
    _NUMERIC_TO_LABEL = {"0": "Normal", "1": "MAM", "2": "SAM", "3": "Severe_Stunting"}

    def _clean(label: str) -> str:
        return _NUMERIC_TO_LABEL.get(str(label).strip(), str(label).strip())

    primary = predict_current_risk(data)
    lr = predict_with_logistic_regression(data)

    primary_label = _clean(primary.get("model_prediction", "Unknown")) if primary.get("ok") else "Error"
    lr_label = lr.get("model_prediction", "Unknown") if lr.get("ok") else "Error"
    agree = primary_label == lr_label

    return {
        "ok": True,
        "input": {
            "age_months": data.get("age_months"),
            "sex": data.get("sex"),
            "weight_kg": data.get("weight_kg"),
            "height_cm": data.get("height_cm"),
        },
        "z_scores": primary.get("z_scores") if primary.get("ok") else lr.get("z_scores"),
        "models": {
            "primary_model": {
                "name": "XGBoost Stacking Ensemble (primary)",
                "prediction": primary_label,
                "confidence": primary.get("confidence"),
                "class_probabilities": primary.get("class_probabilities"),
            },
            "logistic_regression": {
                "name": "Logistic Regression (comparison)",
                "prediction": lr_label,
                "confidence": lr.get("confidence"),
                "class_probabilities": lr.get("class_probabilities"),
            },
        },
        "models_agree": agree,
        "final_prediction": primary_label,  # primary model is authoritative
    }



# -----------------------------------------------------------------------------
# CURRENT RISK MODEL SCHEMA (your saved sklearn Pipeline expects these columns)
# -----------------------------------------------------------------------------
CURRENT_FEATURES = [
    "Age_months",
    "Sex_enc",
    "Weight_kg",
    "Length_cm",
    "WFA_Z",
    "HFA_Z",
    "WFH_Z",
]


# -----------------------------------------------------------------------------
# FUTURE (NEXT 2 MONTHS) MODEL FEATURES (loaded from joblib so it always matches)
# -----------------------------------------------------------------------------
_PRED_FEATURES_PATH = os.path.join(MODELS_DIR, "prediction_features.joblib")
PREDICTION_FEATURES = joblib.load(_PRED_FEATURES_PATH) if os.path.exists(_PRED_FEATURES_PATH) else None

# Risk encoding used by the next-2-month model training
RISK_MAP_TEXT_TO_INT = {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}
RISK_MAP_INT_TO_TEXT = {v: k for k, v in RISK_MAP_TEXT_TO_INT.items()}


# -----------------------------------------------------------------------------
# Label encoders for CURRENT models (decode 0..n-1 -> ['MAM','Normal','SAM','Severe_Stunting'])
# -----------------------------------------------------------------------------
_LE_BIRTH2_PATH = os.path.join(MODELS_DIR, "label_encoder_birth_to_2.joblib")
_LE_2TO5_PATH = os.path.join(MODELS_DIR, "label_encoder_age_2_to_5.joblib")

label_encoder_birth_to_2 = joblib.load(_LE_BIRTH2_PATH) if os.path.exists(_LE_BIRTH2_PATH) else None
label_encoder_age_2_to_5 = joblib.load(_LE_2TO5_PATH) if os.path.exists(_LE_2TO5_PATH) else None


# -----------------------------------------------------------------------------
# WHO LMS tables (trimmed version; same as your previous analyzer)
# -----------------------------------------------------------------------------
WFA_BOYS = {
    0: (1, 3.3464, 0.14602),
    1: (1, 4.4709, 0.13395),
    2: (1, 5.5675, 0.12385),
    3: (1, 6.3762, 0.11727),
    6: (1, 7.9938, 0.10315),
    12: (1, 9.648, 0.09029),
    24: (1, 12.227, 0.0887),
    36: (1, 14.31, 0.09182),
    48: (1, 16.31, 0.09403),
    60: (1, 18.30, 0.0956),
}

WFA_GIRLS = {
    0: (1, 3.2322, 0.14171),
    1: (1, 4.1873, 0.13724),
    2: (1, 5.1282, 0.13173),
    3: (1, 5.8458, 0.1278),
    6: (1, 7.2159, 0.11315),
    12: (1, 8.947, 0.09894),
    24: (1, 11.488, 0.0926),
    36: (1, 13.88, 0.0939),
    48: (1, 16.10, 0.0956),
    60: (1, 18.20, 0.0969),
}

HFA_BOYS = {
    0: (1, 49.8842, 0.03795),
    6: (1, 67.6236, 0.0321),
    12: (1, 75.7488, 0.0314),
    24: (1, 87.803, 0.0329),
    36: (1, 96.1, 0.0342),
    48: (1, 103.3, 0.035),
    60: (1, 110.0, 0.0355),
}

HFA_GIRLS = {
    0: (1, 49.1477, 0.0379),
    6: (1, 65.6795, 0.0321),
    12: (1, 74.015, 0.0319),
    24: (1, 86.363, 0.0331),
    36: (1, 95.1, 0.0345),
    48: (1, 102.7, 0.0353),
    60: (1, 109.4, 0.0358),
}

# WHO Weight-for-Height LMS tables — indexed by height_cm (45–110 cm).
# Source: WHO Child Growth Standards (2006), wfhbfa/wfhgfa tables.
# L=1 for all entries (no Box-Cox skew needed for weight-for-height).
WFH_BOYS: Dict[float, Tuple[float, float, float]] = {
    45.0: (1, 2.441, 0.09182), 46.0: (1, 2.569, 0.09108), 47.0: (1, 2.705, 0.09047),
    48.0: (1, 2.848, 0.08997), 49.0: (1, 2.998, 0.08956), 50.0: (1, 3.155, 0.08922),
    51.0: (1, 3.316, 0.08895), 52.0: (1, 3.481, 0.08874), 53.0: (1, 3.653, 0.08860),
    54.0: (1, 3.833, 0.08851), 55.0: (1, 4.024, 0.08847), 56.0: (1, 4.228, 0.08851),
    57.0: (1, 4.448, 0.08863), 58.0: (1, 4.685, 0.08882), 59.0: (1, 4.939, 0.08907),
    60.0: (1, 5.207, 0.08935), 61.0: (1, 5.480, 0.08963), 62.0: (1, 5.752, 0.08989),
    63.0: (1, 6.015, 0.09013), 64.0: (1, 6.268, 0.09033), 65.0: (1, 6.510, 0.09050),
    66.0: (1, 6.738, 0.09064), 67.0: (1, 6.953, 0.09076), 68.0: (1, 7.158, 0.09086),
    69.0: (1, 7.353, 0.09094), 70.0: (1, 7.541, 0.09102), 71.0: (1, 7.722, 0.09109),
    72.0: (1, 7.896, 0.09116), 73.0: (1, 8.063, 0.09122), 74.0: (1, 8.222, 0.09128),
    75.0: (1, 8.378, 0.09134), 76.0: (1, 8.529, 0.09140), 77.0: (1, 8.679, 0.09146),
    78.0: (1, 8.827, 0.09152), 79.0: (1, 8.975, 0.09158), 80.0: (1, 9.122, 0.09164),
    81.0: (1, 9.268, 0.09170), 82.0: (1, 9.411, 0.09176), 83.0: (1, 9.549, 0.09182),
    84.0: (1, 9.687, 0.09188), 85.0: (1, 9.826, 0.09195), 86.0: (1, 9.969, 0.09203),
    87.0: (1, 10.11, 0.09213), 88.0: (1, 10.26, 0.09225), 89.0: (1, 10.41, 0.09238),
    90.0: (1, 10.56, 0.09253), 91.0: (1, 10.72, 0.09270), 92.0: (1, 10.88, 0.09288),
    93.0: (1, 11.04, 0.09309), 94.0: (1, 11.22, 0.09331), 95.0: (1, 11.39, 0.09356),
    96.0: (1, 11.58, 0.09382), 97.0: (1, 11.77, 0.09410), 98.0: (1, 11.97, 0.09440),
    99.0: (1, 12.17, 0.09471), 100.0: (1, 12.39, 0.09504), 101.0: (1, 12.61, 0.09540),
    102.0: (1, 12.85, 0.09578), 103.0: (1, 13.09, 0.09618), 104.0: (1, 13.35, 0.09659),
    105.0: (1, 13.61, 0.09703), 106.0: (1, 13.89, 0.09750), 107.0: (1, 14.17, 0.09798),
    108.0: (1, 14.47, 0.09849), 109.0: (1, 14.78, 0.09901), 110.0: (1, 15.11, 0.09956),
}

WFH_GIRLS: Dict[float, Tuple[float, float, float]] = {
    45.0: (1, 2.440, 0.09002), 46.0: (1, 2.567, 0.08912), 47.0: (1, 2.704, 0.08823),
    48.0: (1, 2.848, 0.08737), 49.0: (1, 2.999, 0.08653), 50.0: (1, 3.158, 0.08573),
    51.0: (1, 3.324, 0.08499), 52.0: (1, 3.498, 0.08431), 53.0: (1, 3.679, 0.08371),
    54.0: (1, 3.869, 0.08317), 55.0: (1, 4.069, 0.08269), 56.0: (1, 4.279, 0.08228),
    57.0: (1, 4.501, 0.08194), 58.0: (1, 4.735, 0.08164), 59.0: (1, 4.980, 0.08141),
    60.0: (1, 5.233, 0.08121), 61.0: (1, 5.489, 0.08102), 62.0: (1, 5.745, 0.08083),
    63.0: (1, 5.997, 0.08064), 64.0: (1, 6.244, 0.08048), 65.0: (1, 6.482, 0.08036),
    66.0: (1, 6.711, 0.08029), 67.0: (1, 6.930, 0.08025), 68.0: (1, 7.140, 0.08024),
    69.0: (1, 7.344, 0.08025), 70.0: (1, 7.542, 0.08026), 71.0: (1, 7.733, 0.08027),
    72.0: (1, 7.917, 0.08027), 73.0: (1, 8.095, 0.08026), 74.0: (1, 8.268, 0.08024),
    75.0: (1, 8.436, 0.08022), 76.0: (1, 8.600, 0.08020), 77.0: (1, 8.762, 0.08018),
    78.0: (1, 8.922, 0.08016), 79.0: (1, 9.082, 0.08015), 80.0: (1, 9.243, 0.08015),
    81.0: (1, 9.401, 0.08016), 82.0: (1, 9.558, 0.08018), 83.0: (1, 9.711, 0.08021),
    84.0: (1, 9.862, 0.08026), 85.0: (1, 10.01, 0.08033), 86.0: (1, 10.15, 0.08042),
    87.0: (1, 10.30, 0.08053), 88.0: (1, 10.45, 0.08066), 89.0: (1, 10.60, 0.08082),
    90.0: (1, 10.75, 0.08100), 91.0: (1, 10.91, 0.08121), 92.0: (1, 11.07, 0.08145),
    93.0: (1, 11.24, 0.08172), 94.0: (1, 11.42, 0.08201), 95.0: (1, 11.60, 0.08233),
    96.0: (1, 11.79, 0.08268), 97.0: (1, 11.98, 0.08307), 98.0: (1, 12.19, 0.08348),
    99.0: (1, 12.39, 0.08392), 100.0: (1, 12.61, 0.08440), 101.0: (1, 12.83, 0.08490),
    102.0: (1, 13.07, 0.08543), 103.0: (1, 13.31, 0.08599), 104.0: (1, 13.57, 0.08659),
    105.0: (1, 13.84, 0.08721), 106.0: (1, 14.12, 0.08787), 107.0: (1, 14.41, 0.08855),
    108.0: (1, 14.71, 0.08926), 109.0: (1, 15.03, 0.08999), 110.0: (1, 15.37, 0.09076),
}


def _lms_zscore(value: float, L: float, M: float, S: float) -> float:
    if L == 0:
        return math.log(value / M) / S
    return ((value / M) ** L - 1) / (L * S)


def _interpolate_lms(age: int, table: Dict[int, Tuple[float, float, float]]) -> Tuple[float, float, float]:
    ages = sorted(table.keys())
    if age in table:
        return table[age]

    lower = max(a for a in ages if a <= age)
    upper = min(a for a in ages if a >= age)
    if lower == upper:
        return table[lower]

    L1, M1, S1 = table[lower]
    L2, M2, S2 = table[upper]
    ratio = (age - lower) / (upper - lower)
    return (L1 + (L2 - L1) * ratio, M1 + (M2 - M1) * ratio, S1 + (S2 - S1) * ratio)


def compute_z_scores(*, age_months: int, sex: str, weight_kg: float, height_cm: float) -> Tuple[float, float, float]:
    sex_u = str(sex).upper()

    # Weight-for-age
    L, M, S = _interpolate_lms(int(age_months), WFA_BOYS if sex_u == "M" else WFA_GIRLS)
    wfa = _lms_zscore(float(weight_kg), L, M, S)

    # Height-for-age
    L, M, S = _interpolate_lms(int(age_months), HFA_BOYS if sex_u == "M" else HFA_GIRLS)
    hfa = _lms_zscore(float(height_cm), L, M, S)

    # Weight-for-height — uses WHO WFH tables indexed by height_cm (not age).
    # Clamp height to the table range [45, 110] before lookup.
    h_clamped = max(45.0, min(110.0, float(height_cm)))
    L, M, S = _interpolate_lms(h_clamped, WFH_BOYS if sex_u == "M" else WFH_GIRLS)
    wfh = _lms_zscore(float(weight_kg), L, M, S)

    # Clamp to medically realistic range — no valid WHO z-score falls outside [-5, 5]
    wfa = max(-5.0, min(5.0, wfa))
    hfa = max(-5.0, min(5.0, hfa))
    wfh = max(-5.0, min(5.0, wfh))

    return round(wfa, 3), round(hfa, 3), round(wfh, 3)


def _encode_sex(sex: str) -> int:
    return 1 if str(sex).upper() == "M" else 0


def predict_current_risk(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predict CURRENT situation class using current_birth_2_model / current_2_5_model.

    Expected input keys:
    - age_months (int)
    - sex ('M'/'F')
    - weight_kg (float)
    - height_cm (float)
    """
    try:
        age = int(data["age_months"])
        sex = str(data["sex"])
        weight = float(data["weight_kg"])
        height = float(data["height_cm"])

        wfa, hfa, wfh = compute_z_scores(age_months=age, sex=sex, weight_kg=weight, height_cm=height)
        sex_enc = _encode_sex(sex)

        # STABILIZATION: rule-based classification for newborns / first visits (age <= 1 month).
        # The WFH calculation is unreliable this early and the ML model is unstable for birth
        # records.  Use WHO low-birth-weight thresholds instead; keep ML intact for older children.
        if age <= 1:
            if weight < 2.0:
                newborn_label = "SAM"
            elif weight < 2.6:
                newborn_label = "MAM"
            else:
                newborn_label = "Normal"
            return {
                "ok": True,
                "age_months": age,
                "sex": sex.upper(),
                "weight_kg": weight,
                "height_cm": height,
                "z_scores": {"WFA_Z": wfa, "HFA_Z": hfa, "WFH_Z": wfh},
                "model_prediction": newborn_label,
                "confidence": 1.0,
                "class_probabilities": None,
            }

        model = current_birth_2_model if age <= 24 else current_2_5_model
        le = label_encoder_birth_to_2 if age <= 24 else label_encoder_age_2_to_5

        # Build input matching the *actual* model schema.
        # Some models were trained with: Age_months/Sex_enc/Weight_kg/Length_cm...
        # Others with: age_months/Sex/weight_kg/height_cm...
        expected = list(getattr(model, "feature_names_in_", CURRENT_FEATURES))

        value_map = {
            "Age_months": age,
            "age_months": age,
            "Sex_enc": sex_enc,
            "sex_enc": sex_enc,
            "Sex": sex_enc,  # some models name the encoded sex column as "Sex"
            "sex": sex_enc,
            "Weight_kg": weight,
            "weight_kg": weight,
            "Length_cm": height,
            "height_cm": height,
            "Height_cm": height,
            "WFA_Z": wfa,
            "HFA_Z": hfa,
            "WFH_Z": wfh,
        }

        row = {col: value_map[col] for col in expected if col in value_map}
        # Ensure all expected columns exist (fill missing with 0 to avoid crash)
        for col in expected:
            if col not in row:
                row[col] = 0

        X = pd.DataFrame([row], columns=expected)

        pred_encoded = int(model.predict(X)[0])
        proba = model.predict_proba(X)[0] if hasattr(model, "predict_proba") else None
        conf = float(np.max(proba)) if proba is not None else None

        if le is not None:
            pred_label = str(le.inverse_transform([pred_encoded])[0])
            class_probabilities = {str(cls): round(float(proba[i]), 3) for i, cls in enumerate(le.classes_)} if proba is not None else None
        else:
            pred_label = str(pred_encoded)
            class_probabilities = None

        return {
            "ok": True,
            "age_months": age,
            "sex": sex.upper(),
            "weight_kg": weight,
            "height_cm": height,
            "z_scores": {"WFA_Z": wfa, "HFA_Z": hfa, "WFH_Z": wfh},
            "model_prediction": pred_label,
            "confidence": round(conf, 3) if conf is not None else None,
            "class_probabilities": class_probabilities,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _map_current_label_to_future_risk(current_label: str) -> str:
    """
    Convert CURRENT model labels to next-2-month risk text classes.
    Your current model outputs one of: Normal / MAM / SAM / Severe_Stunting.
    """
    s = str(current_label).strip().lower()
    if s == "normal":
        return "Low"
    if s == "mam":
        return "High"
    if s == "sam":
        return "Severe"
    if "severe" in s:
        return "Severe"
    return "Moderate"


def predict_future_risk(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predict NEXT-2-MONTH risk using prediction_model.

    Expected input keys:
    - age_months, sex, weight_kg, height_cm
    and either:
      - z_wfa/z_hfa/z_wfh + current_risk (Low/Moderate/High/Severe)
      OR we will compute z-scores and derive current_risk from current model prediction.
    """
    try:
        age = int(data["age_months"])
        sex = str(data["sex"])
        weight = float(data["weight_kg"])
        height = float(data["height_cm"])

        # z-scores: accept if provided, else compute
        z_wfa = float(data.get("z_wfa")) if data.get("z_wfa") is not None else None
        z_hfa = float(data.get("z_hfa")) if data.get("z_hfa") is not None else None
        z_wfh = float(data.get("z_wfh")) if data.get("z_wfh") is not None else None

        if z_wfa is None or z_hfa is None or z_wfh is None:
            wfa, hfa, wfh = compute_z_scores(age_months=age, sex=sex, weight_kg=weight, height_cm=height)
            z_wfa, z_hfa, z_wfh = float(wfa), float(hfa), float(wfh)

        # Clamp Z-scores to valid clinical range — no meaningful WHO z-score falls outside [-5, 5]
        z_wfa = max(-5.0, min(5.0, z_wfa))
        z_hfa = max(-5.0, min(5.0, z_hfa))
        z_wfh = max(-5.0, min(5.0, z_wfh))

        # current risk text: accept if provided, else derive from current model output
        current_risk_text = data.get("current_risk")
        if not current_risk_text:
            cur = predict_current_risk({
                "age_months": age,
                "sex": sex,
                "weight_kg": weight,
                "height_cm": height,
            })
            if not cur.get("ok"):
                current_risk_text = "Moderate"
            else:
                current_risk_text = _map_current_label_to_future_risk(cur.get("model_prediction"))

        # Encode current risk
        current_risk_enc = RISK_MAP_TEXT_TO_INT.get(str(current_risk_text), 1)

        # Feature engineering for future model
        min_z = float(np.min([z_wfa, z_hfa, z_wfh]))
        mean_z = float(np.mean([z_wfa, z_hfa, z_wfh]))
        dist_from_moderate = min_z - (-2)
        dist_from_severe = min_z - (-3)
        is_high_or_severe = 1 if current_risk_enc >= 2 else 0
        z_range = float(np.max([z_wfa, z_hfa, z_wfh])) - min_z
        z_product = float(z_wfa * z_hfa * z_wfh)
        z_std = float(np.std([z_wfa, z_hfa, z_wfh]))
        weight_height_ratio = float(weight / ((height / 100.0) ** 2)) if height > 0 else 0.0
        age_weight_interaction = float(age * weight)

        row = {
            "age_months": age,
            "weight_kg": weight,
            "height_cm": height,
            "z_wfa": z_wfa,
            "z_hfa": z_hfa,
            "z_wfh": z_wfh,
            "min_z": min_z,
            "mean_z": mean_z,
            "dist_from_moderate": dist_from_moderate,
            "dist_from_severe": dist_from_severe,
            "z_range": z_range,
            "z_product": z_product,
            "z_std": z_std,
            "weight_height_ratio": weight_height_ratio,
            "age_weight_interaction": age_weight_interaction,
            "current_risk_enc": int(current_risk_enc),
            "is_high_or_severe": int(is_high_or_severe),
        }

        X = pd.DataFrame([row])
        if PREDICTION_FEATURES:
            for f in PREDICTION_FEATURES:
                if f not in X.columns:
                    X[f] = 0
            X = X[PREDICTION_FEATURES]

        pred = int(prediction_model.predict(X)[0])
        proba = prediction_model.predict_proba(X)[0] if hasattr(prediction_model, "predict_proba") else None
        conf = float(np.max(proba)) if proba is not None else None

        return {
            "ok": True,
            "predicted_risk_next_2_months": RISK_MAP_INT_TO_TEXT.get(pred, str(pred)),
            "confidence": round(conf, 3) if conf is not None else None,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}

