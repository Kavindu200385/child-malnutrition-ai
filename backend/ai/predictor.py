import math
import threading
from datetime import datetime
from typing import Any, Dict, Tuple, Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from .model_loader import (
    current_label_encoder,
    current_risk_model,
    future_prediction_label_encoder,
    prediction_model,
)  # type: ignore

# ---------------------------------------------------------------------------
# LOGISTIC REGRESSION — comparison model (lazy-trained on synthetic WHO data)
# ---------------------------------------------------------------------------
# The model is built once on first use using synthetic data generated from
# WHO Z-score thresholds (the same thresholds used in clinical practice).
# Labels:  0=Normal, 1=MAM, 2=SAM
# This allows a direct, fair comparison with the primary current-risk model.

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
    Run BOTH the primary current-risk model AND the Logistic Regression model
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
                "name": "Current Risk Random Forest (primary)",
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
# MODEL SCHEMAS
# -----------------------------------------------------------------------------
CURRENT_FEATURES = ["age_months", "Sex", "weight_kg", "height_cm"]
PREDICTION_FEATURES = [str(col) for col in getattr(prediction_model, "feature_names_in_", [
    "age_months",
    "Sex",
    "weight_kg",
    "height_cm",
    "prev_weight",
    "prev_height",
    "weight_change",
    "height_change",
])]

FUTURE_PREDICTION_HISTORY_WARNING = (
    "Future prediction requires at least one previous measurement or birth baseline."
)


def _as_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day"):
        return datetime(value.year, value.month, value.day)
    return datetime.utcnow()


def _child_age_months(child: Any, reference_date: datetime) -> Optional[int]:
    dob = getattr(child, "dob", None)
    if not dob:
        return None
    return max(0, int((reference_date.date() - dob).days // 30))


def _child_sex(child: Any) -> str:
    gender = str(getattr(child, "gender", "") or "").strip().lower()
    return "M" if gender in ("m", "male") else "F"


def _candidate_from_measurement(measurement: Any) -> Optional[Dict[str, Any]]:
    if not measurement:
        return None
    if measurement.weight_kg is None or measurement.height_cm is None:
        return None
    return {
        "source": "previous_measurement",
        "date": measurement.measurement_date,
        "prev_weight": float(measurement.weight_kg),
        "prev_height": float(measurement.height_cm),
    }


def _candidate_from_visit(visit: Any) -> Optional[Dict[str, Any]]:
    if not visit:
        return None
    if visit.weight_kg is None or visit.height_cm is None:
        return None
    return {
        "source": "previous_visit",
        "date": visit.visit_date,
        "prev_weight": float(visit.weight_kg),
        "prev_height": float(visit.height_cm),
    }


def build_future_prediction_payload(
    *,
    child: Any,
    weight_kg: float,
    height_cm: float,
    measurement_date: Any = None,
    history_source: str = "measurements",
    exclude_measurement_id: Optional[int] = None,
    exclude_visit_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build the exact future-model input from child history.

    Fallback order:
    1. latest previous clinic measurement/visit before the current measurement
    2. birth weight/height from the child profile
    3. no prediction, with FUTURE_PREDICTION_HISTORY_WARNING
    """
    try:
        from backend.models_hierarchical import Measurement, Visit
    except Exception as exc:
        return {"ok": False, "warning": str(exc), "payload": None}

    current_dt = _as_datetime(measurement_date)
    age_months = _child_age_months(child, current_dt)
    if age_months is None:
        return {"ok": False, "warning": "Future prediction requires child date of birth.", "payload": None}

    child_id = getattr(child, "id", None)
    candidates = []

    if child_id is not None and history_source in ("measurements", "both"):
        q = Measurement.query.filter(Measurement.child_id == child_id)
        q = q.filter(Measurement.measurement_date < current_dt)
        if exclude_measurement_id is not None:
            q = q.filter(Measurement.id != exclude_measurement_id)
        prev_measurement = q.order_by(Measurement.measurement_date.desc(), Measurement.id.desc()).first()
        candidate = _candidate_from_measurement(prev_measurement)
        if candidate:
            candidates.append(candidate)

    if child_id is not None and history_source in ("visits", "both"):
        q = Visit.query.filter(Visit.child_id_fk == child_id)
        q = q.filter(Visit.visit_date < current_dt)
        if exclude_visit_id is not None:
            q = q.filter(Visit.id != exclude_visit_id)
        prev_visit = q.order_by(Visit.visit_date.desc(), Visit.id.desc()).first()
        candidate = _candidate_from_visit(prev_visit)
        if candidate:
            candidates.append(candidate)

    if candidates:
        baseline = max(candidates, key=lambda item: item["date"] or datetime.min)
    elif getattr(child, "birth_weight_kg", None) is not None and getattr(child, "birth_height_cm", None) is not None:
        baseline = {
            "source": "birth_baseline",
            "date": getattr(child, "dob", None),
            "prev_weight": float(child.birth_weight_kg),
            "prev_height": float(child.birth_height_cm),
        }
    else:
        return {"ok": False, "warning": FUTURE_PREDICTION_HISTORY_WARNING, "payload": None}

    current_weight = float(weight_kg)
    current_height = float(height_cm)
    prev_weight = float(baseline["prev_weight"])
    prev_height = float(baseline["prev_height"])

    payload = {
        "age_months": age_months,
        "sex": _child_sex(child),
        "weight_kg": current_weight,
        "height_cm": current_height,
        "prev_weight": prev_weight,
        "prev_height": prev_height,
        "weight_change": current_weight - prev_weight,
        "height_change": current_height - prev_height,
    }
    return {"ok": True, "warning": None, "payload": payload, "history_source": baseline["source"]}


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
    Predict CURRENT situation class using the retrained current risk model.

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

        expected = list(getattr(current_risk_model, "feature_names_in_", CURRENT_FEATURES))

        value_map = {
            "age_months": age,
            "Sex": sex_enc,  # some models name the encoded sex column as "Sex"
            "sex": sex_enc,
            "weight_kg": weight,
            "height_cm": height,
        }

        missing = [col for col in expected if col not in value_map]
        if missing:
            return {"ok": False, "error": f"Unsupported current model feature(s): {', '.join(missing)}"}

        row = {col: value_map[col] for col in expected}
        X = pd.DataFrame([row], columns=expected)

        pred_encoded = int(current_risk_model.predict(X)[0])
        proba = current_risk_model.predict_proba(X)[0] if hasattr(current_risk_model, "predict_proba") else None
        conf = float(np.max(proba)) if proba is not None else None

        pred_label = str(current_label_encoder.inverse_transform([pred_encoded])[0])
        class_probabilities = (
            {str(cls): round(float(proba[i]), 3) for i, cls in enumerate(current_label_encoder.classes_)}
            if proba is not None else None
        )

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
    - prev_weight, prev_height, weight_change, height_change
    """
    try:
        age = int(data["age_months"])
        sex = str(data["sex"])
        weight = float(data["weight_kg"])
        height = float(data["height_cm"])

        prev_weight = data.get("prev_weight", data.get("previous_weight_kg", weight))
        prev_height = data.get("prev_height", data.get("previous_height_cm", height))
        prev_weight = float(weight if prev_weight is None else prev_weight)
        prev_height = float(height if prev_height is None else prev_height)

        weight_change = data.get("weight_change")
        height_change = data.get("height_change")
        weight_change = float(weight - prev_weight if weight_change is None else weight_change)
        height_change = float(height - prev_height if height_change is None else height_change)

        row = {
            "age_months": age,
            "Sex": _encode_sex(sex),
            "weight_kg": weight,
            "height_cm": height,
            "prev_weight": prev_weight,
            "prev_height": prev_height,
            "weight_change": weight_change,
            "height_change": height_change,
        }

        missing = [col for col in PREDICTION_FEATURES if col not in row]
        if missing:
            return {"ok": False, "error": f"Unsupported future model feature(s): {', '.join(missing)}"}

        X = pd.DataFrame([{col: row[col] for col in PREDICTION_FEATURES}], columns=PREDICTION_FEATURES)

        pred = int(prediction_model.predict(X)[0])
        proba = prediction_model.predict_proba(X)[0] if hasattr(prediction_model, "predict_proba") else None
        conf = float(np.max(proba)) if proba is not None else None
        pred_label = str(future_prediction_label_encoder.inverse_transform([pred])[0])

        return {
            "ok": True,
            "predicted_risk_next_2_months": pred_label,
            "confidence": round(conf, 3) if conf is not None else None,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
