"""
AI package

Production structure:
- backend/ai/model_loader.py
- backend/ai/predictor.py
"""

from .model_loader import prediction_model, current_birth_2_model, current_2_5_model
from .predictor import predict_current_risk, predict_future_risk, compute_z_scores

__all__ = [
    "prediction_model",
    "current_birth_2_model",
    "current_2_5_model",
    "predict_current_risk",
    "predict_future_risk",
    "compute_z_scores",
]
