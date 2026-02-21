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


prediction_model = _load(os.path.join(MODELS_DIR, "prediction_model.joblib"))
current_birth_2_model = _load(os.path.join(MODELS_DIR, "current_birth_2.joblib"))
current_2_5_model = _load(os.path.join(MODELS_DIR, "current_2_5.joblib"))

print("All AI models loaded successfully.")

