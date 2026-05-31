"""
AI package

Production structure:
- backend/ai/model_loader.py
- backend/ai/predictor.py
"""

from .model_loader import current_label_encoder, current_risk_model, future_prediction_label_encoder, prediction_model
from .predictor import predict_current_risk, predict_future_risk, compute_z_scores

__all__ = [
    "current_risk_model",
    "current_label_encoder",
    "prediction_model",
    "future_prediction_label_encoder",
    "predict_current_risk",
    "predict_future_risk",
    "compute_z_scores",
]
