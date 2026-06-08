"""
Unit tests for backend/ai/model_loader.py

Validates that model files load correctly and expose the expected interface.
"""
import pytest
import numpy as np


class TestModelLoader:
    """Verify model objects loaded from disk have correct shapes and interfaces."""

    def test_current_risk_model_loaded(self):
        from backend.ai.model_loader import current_risk_model
        assert current_risk_model is not None

    def test_current_risk_model_has_predict(self):
        from backend.ai.model_loader import current_risk_model
        assert hasattr(current_risk_model, "predict")
        assert callable(current_risk_model.predict)

    def test_current_risk_model_has_predict_proba(self):
        from backend.ai.model_loader import current_risk_model
        assert hasattr(current_risk_model, "predict_proba")

    def test_current_label_encoder_classes(self):
        from backend.ai.model_loader import current_label_encoder
        expected = {"MAM", "Normal", "SAM", "Severe_Stunting", "Underweight"}
        actual = set(current_label_encoder.classes_)
        assert actual == expected

    def test_prediction_model_loaded(self):
        from backend.ai.model_loader import prediction_model
        assert prediction_model is not None

    def test_prediction_model_has_feature_names(self):
        from backend.ai.model_loader import prediction_model
        expected = {"age_months", "Sex", "weight_kg", "height_cm",
                    "prev_weight", "prev_height", "weight_change", "height_change"}
        actual = set(prediction_model.feature_names_in_)
        assert actual == expected

    def test_future_label_encoder_classes(self):
        from backend.ai.model_loader import future_prediction_label_encoder
        expected = {"High", "Low", "Moderate", "No_Risk", "Severe"}
        actual = set(future_prediction_label_encoder.classes_)
        assert actual == expected

    def test_current_risk_model_produces_integer_predictions(self):
        """End-to-end: model accepts a 4-feature DataFrame and returns integers."""
        import pandas as pd
        from backend.ai.model_loader import current_risk_model
        X = pd.DataFrame([{"age_months": 24, "Sex": 1, "weight_kg": 12.0, "height_cm": 87.0}])
        pred = current_risk_model.predict(X)
        assert len(pred) == 1
        assert pred[0] in range(5)

    def test_prediction_model_produces_integer_predictions(self):
        """End-to-end: future model accepts an 8-feature DataFrame and returns integers."""
        import pandas as pd
        from backend.ai.model_loader import prediction_model
        X = pd.DataFrame([{
            "age_months": 24, "Sex": 1,
            "weight_kg": 12.0, "height_cm": 87.0,
            "prev_weight": 11.5, "prev_height": 85.0,
            "weight_change": 0.5, "height_change": 2.0,
        }])
        pred = prediction_model.predict(X)
        assert len(pred) == 1
        assert pred[0] in range(5)
