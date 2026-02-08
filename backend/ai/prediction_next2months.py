import os
import joblib
import numpy as np
import pandas as pd


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")

PRED_MODEL_PATH = os.path.join(MODELS_DIR, "prediction_model.joblib")
FEATURES_PATH = os.path.join(MODELS_DIR, "prediction_features.joblib")
RISK_MAP_PATH = os.path.join(MODELS_DIR, "risk_mapping.joblib")


class PredictionNext2Months:
    def __init__(self):
        if not os.path.exists(PRED_MODEL_PATH):
            raise FileNotFoundError(f"Prediction model not found: {PRED_MODEL_PATH}")
        self.model = joblib.load(PRED_MODEL_PATH)
        self.features = joblib.load(FEATURES_PATH) if os.path.exists(FEATURES_PATH) else None
        self.risk_map = joblib.load(RISK_MAP_PATH) if os.path.exists(RISK_MAP_PATH) else None

        # Fallback map
        self.reverse_map = {0: "Low", 1: "Moderate", 2: "High", 3: "Severe"}

    def predict(self, *, age_months: int, weight_kg: float, height_cm: float, z_wfa: float, z_hfa: float, z_wfh: float, current_risk: str):
        # Encode current risk for the model (same mapping used during training)
        risk_map = self.risk_map or {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}
        current_risk_enc = risk_map.get(current_risk)
        if current_risk_enc is None:
            # Allow backend caller to pass already-encoded strings like LOW/HIGH etc.
            # Default to Moderate if unknown.
            current_risk_enc = 1

        min_z = float(np.min([z_wfa, z_hfa, z_wfh]))
        mean_z = float(np.mean([z_wfa, z_hfa, z_wfh]))

        row = {
            "age_months": age_months,
            "weight_kg": weight_kg,
            "height_cm": height_cm,
            "z_wfa": z_wfa,
            "z_hfa": z_hfa,
            "z_wfh": z_wfh,
            "min_z": min_z,
            "mean_z": mean_z,
            "current_risk_enc": int(current_risk_enc),
        }
        X = pd.DataFrame([row])
        if self.features:
            X = X[self.features]

        pred = int(self.model.predict(X)[0])
        proba = self.model.predict_proba(X)[0] if hasattr(self.model, "predict_proba") else None

        label = self.reverse_map.get(pred, str(pred))
        confidence = float(proba[pred]) if proba is not None and pred < len(proba) else None
        return label, confidence


_singleton = None


def get_next2months_predictor() -> PredictionNext2Months:
    global _singleton
    if _singleton is None:
        _singleton = PredictionNext2Months()
    return _singleton

