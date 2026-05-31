import os
import joblib

# Production model loader
# Loads all AI models from backend/models/ using a clean, fixed structure.

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")


def _load(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Model file not found: {path}. "
            f"Expected it under {MODELS_DIR}. "
            f"Please ensure the model files are present and correctly named."
        )
    return joblib.load(path)


CURRENT_MODEL_DIR = os.path.join(MODELS_DIR, "current_model")
PREDICTION_MODEL_DIR = os.path.join(MODELS_DIR, "prediction_model")

current_risk_model = _load(os.path.join(CURRENT_MODEL_DIR, "current_risk_model.joblib"))
current_label_encoder = _load(os.path.join(CURRENT_MODEL_DIR, "label_encoder.joblib"))

prediction_model = _load(os.path.join(PREDICTION_MODEL_DIR, "future_prediction_model.joblib"))
future_prediction_label_encoder = _load(
    os.path.join(PREDICTION_MODEL_DIR, "future_prediction_label_encoder.joblib")
)

print("All AI models loaded successfully.")
