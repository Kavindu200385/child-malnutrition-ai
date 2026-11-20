"""
Retrain all three AI models using synthetic WHO-based data with properly computed
WFH Z-scores (now fixed — uses height-indexed LMS tables, not the broken age-based proxy).

Run from the project root:
    python backend/ai/train_models.py

Models saved to:
    backend/models/current_birth_2.joblib
    backend/models/current_2_5.joblib
    backend/models/prediction_model.joblib
    backend/models/prediction_features.joblib
    backend/models/label_encoder_birth_to_2.joblib
    backend/models/label_encoder_age_2_to_5.joblib
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, accuracy_score

# ── Make sure the predictor's compute_z_scores is importable ──────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

from ai.predictor import compute_z_scores  # noqa: E402 (uses fixed WFH tables)

# ── WHO classification thresholds ────────────────────────────────────────────
# Labels: Normal / MAM / SAM / Severe_Stunting
# Classes map:  0=MAM  1=Normal  2=SAM  3=Severe_Stunting  (alphabetical, matches LabelEncoder)

def _classify(wfa: float, hfa: float, wfh: float) -> str:
    if wfh < -3.0 or wfa < -3.0:
        return "SAM"
    if hfa < -3.0:
        return "Severe_Stunting"
    if wfh < -2.0 or wfa < -2.0:
        return "MAM"
    return "Normal"


# ── Synthetic data generation ─────────────────────────────────────────────────
# Generate realistic (age, sex, weight, height) combinations then compute real
# WHO Z-scores from them.  Heights and weights are sampled around WHO medians
# with perturbations to cover Normal / MAM / SAM / Severe_Stunting ranges.

# Approximate WHO medians for height-for-age (boys, used as center for sampling)
_HFA_MEDIAN_BOYS = {
    0: 49.9, 3: 61.4, 6: 67.6, 9: 72.0, 12: 75.7, 18: 82.3,
    24: 87.8, 30: 92.7, 36: 96.1, 42: 99.9, 48: 103.3, 54: 107.0, 60: 110.0,
}
_HFA_MEDIAN_GIRLS = {
    0: 49.1, 3: 59.8, 6: 65.7, 9: 70.1, 12: 74.0, 18: 80.7,
    24: 86.4, 30: 91.4, 36: 95.1, 42: 98.9, 48: 102.7, 54: 106.0, 60: 109.4,
}

# Approximate WHO medians for weight-for-age
_WFA_MEDIAN_BOYS = {
    0: 3.35, 3: 6.38, 6: 7.99, 9: 9.18, 12: 9.65, 18: 10.90,
    24: 12.23, 30: 13.30, 36: 14.31, 42: 15.27, 48: 16.31, 54: 17.23, 60: 18.30,
}
_WFA_MEDIAN_GIRLS = {
    0: 3.23, 3: 5.85, 6: 7.22, 9: 8.20, 12: 8.95, 18: 10.15,
    24: 11.49, 30: 12.59, 36: 13.88, 42: 14.87, 48: 16.10, 54: 17.00, 60: 18.20,
}


def _get_median_hw(age: int, sex: str):
    """Return (height_median, weight_median) for the given age and sex."""
    sex_u = sex.upper()
    hfa_table = _HFA_MEDIAN_BOYS if sex_u == "M" else _HFA_MEDIAN_GIRLS
    wfa_table = _WFA_MEDIAN_BOYS if sex_u == "M" else _WFA_MEDIAN_GIRLS

    ages = sorted(hfa_table.keys())
    if age in hfa_table:
        return hfa_table[age], wfa_table[age]
    lo = max(a for a in ages if a <= age)
    hi = min(a for a in ages if a >= age)
    r = (age - lo) / (hi - lo) if hi != lo else 0
    h = hfa_table[lo] + (hfa_table[hi] - hfa_table[lo]) * r
    w = wfa_table[lo] + (wfa_table[hi] - wfa_table[lo]) * r
    return h, w


def generate_dataset(n_per_class: int = 1200, age_range: tuple = (0, 60), seed: int = 42) -> pd.DataFrame:
    """
    Generate a balanced dataset with all four nutritional status classes.
    Heights and weights are sampled so that the resulting WHO Z-scores fall
    in the desired class ranges.
    """
    rng = np.random.default_rng(seed)
    rows = []

    sexes = ["M", "F"]

    # How much to deflate weight (relative to WHO median) per class
    #  Normal: weight near median
    #  MAM:    weight ~15-25% below median (WFA or WFH in [-3, -2))
    #  SAM:    weight ~30-45% below median (WFA or WFH < -3)
    #  Sev_Stunting: normal weight but height very stunted (HFA < -3)

    class_configs = {
        "Normal":          {"w_mult": (0.90, 1.15),  "h_mult": (0.95, 1.05)},
        "MAM":             {"w_mult": (0.72, 0.84),  "h_mult": (0.93, 1.02)},
        "SAM":             {"w_mult": (0.55, 0.71),  "h_mult": (0.90, 1.00)},
        "Severe_Stunting": {"w_mult": (0.88, 1.10),  "h_mult": (0.83, 0.92)},
    }

    for label, cfg in class_configs.items():
        attempts = 0
        accepted = 0
        while accepted < n_per_class:
            attempts += 1
            if attempts > n_per_class * 30:
                # Bail early if we can't hit the target — prevents infinite loop
                break

            age = int(rng.integers(age_range[0], age_range[1] + 1))
            sex = sexes[int(rng.integers(0, 2))]

            h_med, w_med = _get_median_hw(age, sex)

            h_mult = rng.uniform(*cfg["h_mult"])
            w_mult = rng.uniform(*cfg["w_mult"])

            height = round(float(h_med * h_mult + rng.normal(0, 0.5)), 1)
            weight = round(float(w_med * w_mult + rng.normal(0, 0.15)), 2)

            # Keep physically plausible bounds
            height = max(45.0, min(120.0, height))
            weight = max(1.8, min(30.0, weight))

            try:
                wfa, hfa, wfh = compute_z_scores(
                    age_months=age, sex=sex, weight_kg=weight, height_cm=height
                )
            except Exception:
                continue

            predicted_label = _classify(wfa, hfa, wfh)
            if predicted_label != label:
                continue  # reject if the sample didn't land in the right class

            sex_enc = 1 if sex == "M" else 0
            rows.append({
                "Age_months": age,
                "Sex_enc": sex_enc,
                "Weight_kg": weight,
                "Length_cm": height,
                "WFA_Z": wfa,
                "HFA_Z": hfa,
                "WFH_Z": wfh,
                "label": label,
            })
            accepted += 1

    df = pd.DataFrame(rows)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    print(f"Generated {len(df)} samples. Label distribution:\n{df['label'].value_counts()}")
    return df


# ── Model architecture (mirrors original stacking ensemble) ───────────────────
def _build_stacking_pipeline(random_state: int = 42) -> Pipeline:
    estimators = [
        ("rf",  RandomForestClassifier(n_estimators=200, max_depth=8, random_state=random_state)),
        ("dt",  DecisionTreeClassifier(max_depth=6, random_state=random_state)),
    ]
    final_estimator = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=random_state)
    stacking = StackingClassifier(
        estimators=estimators,
        final_estimator=final_estimator,
        cv=5,
        passthrough=False,
    )
    return Pipeline([
        ("scaler", StandardScaler()),
        ("clf", stacking),
    ])


# ── Train current-status models ───────────────────────────────────────────────
def train_current_models():
    print("\n=== Training current-status models ===")

    FEATURES = ["Age_months", "Sex_enc", "Weight_kg", "Length_cm", "WFA_Z", "HFA_Z", "WFH_Z"]

    # birth–2 years (0–24 months)
    print("\n[1/2] Generating data for birth–2 year model (age 0–24 months)...")
    df_b2 = generate_dataset(n_per_class=1200, age_range=(0, 24), seed=42)

    le_b2 = LabelEncoder()
    y_b2 = le_b2.fit_transform(df_b2["label"])
    X_b2 = df_b2[FEATURES]  # pass DataFrame so sklearn stores feature_names_in_ automatically

    model_b2 = _build_stacking_pipeline()
    model_b2.fit(X_b2, y_b2)

    acc_b2 = accuracy_score(y_b2, model_b2.predict(X_b2))
    print(f"Training accuracy (birth–2): {acc_b2:.4f}")
    print(classification_report(y_b2, model_b2.predict(X_b2), target_names=le_b2.classes_))

    joblib.dump(model_b2, os.path.join(MODELS_DIR, "current_birth_2.joblib"))
    joblib.dump(le_b2,     os.path.join(MODELS_DIR, "label_encoder_birth_to_2.joblib"))
    print("Saved: current_birth_2.joblib, label_encoder_birth_to_2.joblib")

    # 2–5 years (24–60 months)
    print("\n[2/2] Generating data for 2–5 year model (age 24–60 months)...")
    df_25 = generate_dataset(n_per_class=1200, age_range=(24, 60), seed=99)

    le_25 = LabelEncoder()
    y_25 = le_25.fit_transform(df_25["label"])
    X_25 = df_25[FEATURES]  # pass DataFrame so sklearn stores feature_names_in_ automatically

    model_25 = _build_stacking_pipeline()
    model_25.fit(X_25, y_25)

    acc_25 = accuracy_score(y_25, model_25.predict(X_25))
    print(f"Training accuracy (2–5 years): {acc_25:.4f}")
    print(classification_report(y_25, model_25.predict(X_25), target_names=le_25.classes_))

    joblib.dump(model_25, os.path.join(MODELS_DIR, "current_2_5.joblib"))
    joblib.dump(le_25,    os.path.join(MODELS_DIR, "label_encoder_age_2_to_5.joblib"))
    print("Saved: current_2_5.joblib, label_encoder_age_2_to_5.joblib")

    return le_b2, le_25


# ── Train future-risk (next-2-month) model ───────────────────────────────────
RISK_MAP_TEXT_TO_INT = {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}

def _current_label_to_risk(label: str) -> str:
    s = label.lower()
    if s == "normal":
        return "Low"
    if s == "mam":
        return "High"
    if "severe" in s or s == "sam":
        return "Severe"
    return "Moderate"


PREDICTION_FEATURES = [
    "age_months", "weight_kg", "height_cm",
    "z_wfa", "z_hfa", "z_wfh",
    "min_z", "mean_z", "dist_from_moderate", "dist_from_severe",
    "z_range", "z_product", "z_std", "weight_height_ratio",
    "age_weight_interaction", "current_risk_enc", "is_high_or_severe",
]


def _make_future_row(age, weight, height, wfa, hfa, wfh, current_risk_text) -> dict:
    current_risk_enc = RISK_MAP_TEXT_TO_INT.get(current_risk_text, 1)
    min_z  = float(np.min([wfa, hfa, wfh]))
    mean_z = float(np.mean([wfa, hfa, wfh]))
    return {
        "age_months":           age,
        "weight_kg":            weight,
        "height_cm":            height,
        "z_wfa":                wfa,
        "z_hfa":                hfa,
        "z_wfh":                wfh,
        "min_z":                min_z,
        "mean_z":               mean_z,
        "dist_from_moderate":   min_z - (-2),
        "dist_from_severe":     min_z - (-3),
        "z_range":              float(np.max([wfa, hfa, wfh])) - min_z,
        "z_product":            float(wfa * hfa * wfh),
        "z_std":                float(np.std([wfa, hfa, wfh])),
        "weight_height_ratio":  float(weight / ((height / 100.0) ** 2)) if height > 0 else 0.0,
        "age_weight_interaction": float(age * weight),
        "current_risk_enc":     int(current_risk_enc),
        "is_high_or_severe":    1 if current_risk_enc >= 2 else 0,
    }


def train_prediction_model():
    print("\n=== Training future-risk (next-2-month) model ===")

    # Generate a larger pool of data spanning all ages
    df_all = generate_dataset(n_per_class=1500, age_range=(0, 60), seed=77)

    rows, labels = [], []

    # For each sample, the "future risk" = risk of becoming worse in 2 months.
    # We simulate this as:
    #   current Normal  → future Low    (90%) or Moderate (10%)
    #   current MAM     → future High   (70%) or Moderate (30%)
    #   current SAM     → future Severe (75%) or High     (25%)
    #   current Sev_Stun→ future Severe (60%) or High     (40%)

    rng = np.random.default_rng(11)

    future_probs = {
        "Normal":          [("Low", 0.90), ("Moderate", 0.10)],
        "MAM":             [("High", 0.70), ("Moderate", 0.30)],
        "SAM":             [("Severe", 0.75), ("High", 0.25)],
        "Severe_Stunting": [("Severe", 0.60), ("High", 0.40)],
    }

    for _, row in df_all.iterrows():
        label = row["label"]
        risk_choices = future_probs.get(label, [("Moderate", 1.0)])
        outcomes, probs = zip(*risk_choices)
        future_risk = rng.choice(outcomes, p=probs)

        current_risk_text = _current_label_to_risk(label)
        feat_row = _make_future_row(
            age=int(row["Age_months"]),
            weight=float(row["Weight_kg"]),
            height=float(row["Length_cm"]),
            wfa=float(row["WFA_Z"]),
            hfa=float(row["HFA_Z"]),
            wfh=float(row["WFH_Z"]),
            current_risk_text=current_risk_text,
        )
        rows.append(feat_row)
        labels.append(RISK_MAP_TEXT_TO_INT[future_risk])

    X = pd.DataFrame(rows, columns=PREDICTION_FEATURES)
    y = np.array(labels, dtype=np.int32)

    print(f"Future-risk label distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    # Use a stacking classifier (same family as current models)
    estimators = [
        ("rf", RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42)),
        ("dt", DecisionTreeClassifier(max_depth=6, random_state=42)),
    ]
    final_estimator = LogisticRegression(solver="lbfgs", max_iter=1000, C=1.0, random_state=42)
    pred_model = StackingClassifier(
        estimators=estimators,
        final_estimator=final_estimator,
        cv=5,
        passthrough=False,
    )
    pred_model.fit(X, y)

    acc = accuracy_score(y, pred_model.predict(X))
    risk_names = ["Low", "Moderate", "High", "Severe"]
    print(f"Training accuracy (future risk): {acc:.4f}")
    print(classification_report(y, pred_model.predict(X), target_names=risk_names))

    joblib.dump(pred_model,          os.path.join(MODELS_DIR, "prediction_model.joblib"))
    joblib.dump(PREDICTION_FEATURES, os.path.join(MODELS_DIR, "prediction_features.joblib"))
    print("Saved: prediction_model.joblib, prediction_features.joblib")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Starting model training with corrected WHO WFH Z-scores...")
    train_current_models()
    train_prediction_model()
    print("\nAll models trained and saved successfully.")
    print(f"Models location: {MODELS_DIR}")
