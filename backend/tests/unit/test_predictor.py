"""
Unit tests for backend/ai/predictor.py

Tests WHO Z-score computation, newborn bypass logic, current-risk and
future-risk predictions, build_future_prediction_payload fallback chain,
and the compare_models endpoint.
"""
import math
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import MagicMock

from backend.ai.predictor import (
    compute_z_scores,
    predict_current_risk,
    predict_future_risk,
    build_future_prediction_payload,
    compare_models,
)

VALID_LABELS_CURRENT = {"MAM", "Normal", "SAM", "Severe_Stunting", "Underweight"}
VALID_LABELS_FUTURE = {"Low", "Moderate", "High", "Severe", "No_Risk"}


# ---------------------------------------------------------------------------
# compute_z_scores
# ---------------------------------------------------------------------------

class TestComputeZScores:
    """
    WHO LMS Z-score formula: Z = ((value/M)^L - 1) / (L*S)
    At the reference median, Z should be ≈ 0.
    """

    def test_wfa_z_near_zero_at_median_boy_12m(self):
        """Boy aged 12m at median weight (9.648 kg) → WFA_Z ≈ 0."""
        wfa, _, _ = compute_z_scores(age_months=12, sex="M", weight_kg=9.648, height_cm=75.0)
        assert abs(wfa) < 0.05

    def test_wfa_z_near_zero_at_median_girl_6m(self):
        """Girl aged 6m at median weight (7.216 kg) → WFA_Z ≈ 0."""
        wfa, _, _ = compute_z_scores(age_months=6, sex="F", weight_kg=7.216, height_cm=65.0)
        assert abs(wfa) < 0.1

    def test_low_weight_gives_negative_wfa(self):
        """Very low weight child should have WFA_Z < -3."""
        wfa, _, _ = compute_z_scores(age_months=24, sex="M", weight_kg=6.0, height_cm=85.0)
        assert wfa < -3.0

    def test_z_scores_clamped_to_minus_5(self):
        """Extreme underweight → WFA_Z clamped to -5.0."""
        wfa, _, _ = compute_z_scores(age_months=24, sex="M", weight_kg=1.0, height_cm=60.0)
        assert wfa == -5.0

    def test_z_scores_clamped_to_plus_5(self):
        """Extreme overweight → WFA_Z clamped to +5.0."""
        wfa, _, _ = compute_z_scores(age_months=12, sex="M", weight_kg=30.0, height_cm=80.0)
        assert wfa == 5.0

    def test_height_below_45cm_clamped(self):
        """Height < 45 cm is clamped to 45 cm for WFH lookup (should not raise)."""
        wfa, hfa, wfh = compute_z_scores(age_months=0, sex="M", weight_kg=2.0, height_cm=40.0)
        assert isinstance(wfh, float)

    def test_height_above_110cm_clamped(self):
        """Height > 110 cm is clamped to 110 cm for WFH lookup (should not raise)."""
        wfa, hfa, wfh = compute_z_scores(age_months=60, sex="F", weight_kg=20.0, height_cm=120.0)
        assert isinstance(wfh, float)

    def test_sex_case_insensitive(self):
        """'f', 'F', 'female' should all produce female-curve Z-scores."""
        z_upper = compute_z_scores(age_months=12, sex="F", weight_kg=9.0, height_cm=74.0)
        z_lower = compute_z_scores(age_months=12, sex="f", weight_kg=9.0, height_cm=74.0)
        assert z_upper == z_lower

    def test_returns_three_floats(self):
        wfa, hfa, wfh = compute_z_scores(age_months=24, sex="M", weight_kg=12.0, height_cm=87.0)
        for z in (wfa, hfa, wfh):
            assert isinstance(z, float)
            assert -5.0 <= z <= 5.0


# ---------------------------------------------------------------------------
# predict_current_risk — newborn bypass
# ---------------------------------------------------------------------------

class TestPredictCurrentRiskNewborn:
    """Ages ≤ 1 month use weight-based rule, bypassing the ML model."""

    def test_very_low_birth_weight_is_sam(self):
        r = predict_current_risk({"age_months": 0, "sex": "M", "weight_kg": 1.8, "height_cm": 48.0})
        assert r["ok"] is True
        assert r["model_prediction"] == "SAM"
        assert r["confidence"] == 1.0
        assert r["low_confidence"] is False

    def test_low_birth_weight_is_mam(self):
        r = predict_current_risk({"age_months": 1, "sex": "F", "weight_kg": 2.3, "height_cm": 50.0})
        assert r["ok"] is True
        assert r["model_prediction"] == "MAM"
        assert r["confidence"] == 1.0

    def test_normal_birth_weight_is_normal(self):
        r = predict_current_risk({"age_months": 1, "sex": "M", "weight_kg": 3.0, "height_cm": 52.0})
        assert r["ok"] is True
        assert r["model_prediction"] == "Normal"

    def test_newborn_response_has_z_scores(self):
        r = predict_current_risk({"age_months": 0, "sex": "F", "weight_kg": 2.5, "height_cm": 49.0})
        assert "z_scores" in r
        assert "WFA_Z" in r["z_scores"]


# ---------------------------------------------------------------------------
# predict_current_risk — ML model path
# ---------------------------------------------------------------------------

class TestPredictCurrentRiskML:
    """Age > 1 month uses the Random Forest model."""

    def test_returns_ok_true_for_valid_input(self):
        r = predict_current_risk({"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert r["ok"] is True

    def test_prediction_is_valid_label(self):
        r = predict_current_risk({"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert r["model_prediction"] in VALID_LABELS_CURRENT

    def test_confidence_between_0_and_1(self):
        r = predict_current_risk({"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert 0.0 <= r["confidence"] <= 1.0

    def test_low_confidence_flag_present(self):
        r = predict_current_risk({"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert "low_confidence" in r
        expected = r["confidence"] < 0.60
        assert r["low_confidence"] is expected

    def test_class_probabilities_present(self):
        r = predict_current_risk({"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert r["class_probabilities"] is not None
        assert sum(r["class_probabilities"].values()) == pytest.approx(1.0, abs=0.01)

    def test_missing_age_months_returns_error(self):
        r = predict_current_risk({"sex": "M", "weight_kg": 10.0, "height_cm": 80.0})
        assert r["ok"] is False
        assert "error" in r

    def test_invalid_weight_type_returns_error(self):
        r = predict_current_risk({"age_months": 12, "sex": "M", "weight_kg": "heavy", "height_cm": 72.0})
        assert r["ok"] is False

    def test_response_includes_z_scores(self):
        r = predict_current_risk({"age_months": 12, "sex": "F", "weight_kg": 8.5, "height_cm": 72.0})
        assert r["ok"] is True
        assert all(k in r["z_scores"] for k in ("WFA_Z", "HFA_Z", "WFH_Z"))

    def test_severely_underweight_child(self):
        """48-month-old boy at 7 kg is severely underweight."""
        r = predict_current_risk({"age_months": 48, "sex": "M", "weight_kg": 7.0, "height_cm": 90.0})
        assert r["ok"] is True
        assert r["z_scores"]["WFA_Z"] < -3.0


# ---------------------------------------------------------------------------
# predict_future_risk
# ---------------------------------------------------------------------------

class TestPredictFutureRisk:
    def _valid_input(self):
        return {
            "age_months": 24, "sex": "M",
            "weight_kg": 12.0, "height_cm": 87.0,
            "prev_weight": 11.5, "prev_height": 85.0,
            "weight_change": 0.5, "height_change": 2.0,
        }

    def test_returns_ok_true_for_valid_input(self):
        r = predict_future_risk(self._valid_input())
        assert r["ok"] is True

    def test_prediction_is_valid_label(self):
        r = predict_future_risk(self._valid_input())
        assert r["predicted_risk_next_2_months"] in VALID_LABELS_FUTURE

    def test_confidence_between_0_and_1(self):
        r = predict_future_risk(self._valid_input())
        assert 0.0 <= r["confidence"] <= 1.0

    def test_low_confidence_flag_present(self):
        r = predict_future_risk(self._valid_input())
        assert "low_confidence" in r
        assert r["low_confidence"] is (r["confidence"] < 0.60)

    def test_defaults_prev_weight_to_current_if_missing(self):
        data = {"age_months": 24, "sex": "F", "weight_kg": 11.0, "height_cm": 86.0}
        r = predict_future_risk(data)
        assert r["ok"] is True

    def test_missing_age_months_returns_error(self):
        r = predict_future_risk({"sex": "M", "weight_kg": 12.0, "height_cm": 87.0})
        assert r["ok"] is False


# ---------------------------------------------------------------------------
# build_future_prediction_payload
# ---------------------------------------------------------------------------

class TestBuildFuturePredictionPayload:
    """
    Tests the 3-level fallback chain:
    previous_measurement → previous_visit → birth_baseline → warning
    """

    def _make_child(self, db, birth_weight=None, birth_height=None, phm_area_id=None):
        """Create child using the existing db fixture session (no nested app context)."""
        from backend.models_hierarchical import Child, EscalationStatus, RiskLevel
        import uuid as _uuid
        child = Child(
            child_unique_id=f"PRED-{_uuid.uuid4().hex[:8]}",
            name="Pred Child",
            gender="male",
            dob=date(2022, 1, 1),
            birth_weight_kg=birth_weight,
            birth_height_cm=birth_height,
            escalation_status=EscalationStatus.NONE.value,
            current_risk_level=RiskLevel.NORMAL.value,
            phm_area_id=phm_area_id,
            status="ACTIVE",
        )
        db.session.add(child)
        db.session.flush()
        return child

    def test_falls_back_to_birth_baseline(self, db, phm_area):
        """No measurement history → uses birth weight/height."""
        child = self._make_child(db, birth_weight=3.2, birth_height=50.0, phm_area_id=phm_area.id)
        result = build_future_prediction_payload(
            child=child,
            weight_kg=10.0,
            height_cm=80.0,
            measurement_date=datetime.now(),
        )
        assert result["ok"] is True
        assert result["history_source"] == "birth_baseline"
        assert result["payload"]["prev_weight"] == 3.2

    def test_returns_warning_when_no_history(self, db, phm_area):
        """No history and no birth data → ok=False with warning."""
        child = self._make_child(db, birth_weight=None, birth_height=None, phm_area_id=phm_area.id)
        result = build_future_prediction_payload(
            child=child,
            weight_kg=10.0,
            height_cm=80.0,
            measurement_date=datetime.now(),
        )
        assert result["ok"] is False
        assert result["warning"] is not None
        assert result["payload"] is None

    def test_uses_previous_measurement_when_available(self, db, phm_area, midwife_user):
        from backend.models_hierarchical import Measurement
        from decimal import Decimal
        child = self._make_child(db, birth_weight=3.2, birth_height=50.0, phm_area_id=phm_area.id)
        meas = Measurement(
            child_id=child.id,
            measurement_date=datetime.now() - timedelta(days=60),
            weight_kg=Decimal("9.5"),
            height_cm=Decimal("82.0"),
            measured_by_user_id=midwife_user.id,
        )
        db.session.add(meas)
        db.session.flush()

        result = build_future_prediction_payload(
            child=child,
            weight_kg=10.0,
            height_cm=85.0,
            measurement_date=datetime.now(),
            history_source="measurements",
        )
        assert result["ok"] is True
        assert result["history_source"] == "previous_measurement"
        assert float(result["payload"]["prev_weight"]) == pytest.approx(9.5, abs=0.01)

    def test_exclude_measurement_id_skips_record(self, db, phm_area, midwife_user):
        """When exclude_measurement_id is set, that record is skipped."""
        from backend.models_hierarchical import Measurement
        from decimal import Decimal
        child = self._make_child(db, birth_weight=3.2, birth_height=50.0, phm_area_id=phm_area.id)
        meas = Measurement(
            child_id=child.id,
            measurement_date=datetime.now() - timedelta(days=30),
            weight_kg=Decimal("9.5"),
            height_cm=Decimal("82.0"),
            measured_by_user_id=midwife_user.id,
        )
        db.session.add(meas)
        db.session.flush()

        result = build_future_prediction_payload(
            child=child,
            weight_kg=10.0,
            height_cm=85.0,
            measurement_date=datetime.now(),
            history_source="measurements",
            exclude_measurement_id=meas.id,
        )
        # Falls back to birth baseline since only measurement is excluded
        assert result["ok"] is True
        assert result["history_source"] == "birth_baseline"


# ---------------------------------------------------------------------------
# compare_models
# ---------------------------------------------------------------------------

class TestCompareModels:
    def _valid_input(self):
        return {"age_months": 24, "sex": "M", "weight_kg": 12.0, "height_cm": 87.0}

    def test_returns_ok_true(self):
        r = compare_models(self._valid_input())
        assert r["ok"] is True

    def test_has_models_agree_key(self):
        r = compare_models(self._valid_input())
        assert "models_agree" in r
        assert isinstance(r["models_agree"], bool)

    def test_has_final_prediction(self):
        r = compare_models(self._valid_input())
        assert "final_prediction" in r

    def test_has_both_models(self):
        r = compare_models(self._valid_input())
        assert "primary_model" in r["models"]
        assert "logistic_regression" in r["models"]

    def test_primary_model_prediction_is_valid_label(self):
        r = compare_models(self._valid_input())
        # Primary model may return more classes than LR
        assert r["models"]["primary_model"]["prediction"] in VALID_LABELS_CURRENT | {"Unknown", "Error"}
