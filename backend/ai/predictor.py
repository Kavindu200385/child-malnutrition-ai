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

    # Weight-for-height (approx; uses height table M/S as proxy like previous code)
    expected = M
    wfh = (float(weight_kg) - expected) / (expected * S)

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

        # Clamp Z-scores to valid clinical range to avoid outlier values corrupting predictions
        z_wfa = max(-6.0, min(6.0, z_wfa))
        z_hfa = max(-6.0, min(6.0, z_hfa))
        z_wfh = max(-6.0, min(6.0, z_wfh))

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

