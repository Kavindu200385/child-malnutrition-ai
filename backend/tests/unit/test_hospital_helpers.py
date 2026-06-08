"""Unit tests for backend/utils/hospital_helpers.py"""
import pytest
from unittest.mock import MagicMock, patch
from backend.utils.hospital_helpers import calculate_birth_risk_level, is_sam_case


class TestCalculateBirthRiskLevel:
    """Tests for birth risk classification using WHO thresholds."""

    # Signature: calculate_birth_risk_level(birth_weight_kg, birth_height_cm, birth_muac_cm, age_days=0)

    def test_very_low_birth_weight_is_sam(self):
        risk, reason = calculate_birth_risk_level(1.5, None, None)
        assert risk == "SAM"
        assert "1.5" in reason or "low" in reason.lower()

    def test_low_birth_weight_is_mam(self):
        risk, _ = calculate_birth_risk_level(2.2, None, None)
        assert risk == "MAM"

    def test_boundary_below_2kg_is_sam(self):
        risk, _ = calculate_birth_risk_level(1.999, None, None)
        assert risk == "SAM"

    def test_boundary_exactly_2kg_is_mam(self):
        risk, _ = calculate_birth_risk_level(2.0, None, None)
        assert risk == "MAM"

    def test_boundary_exactly_2_6kg_is_normal(self):
        risk, _ = calculate_birth_risk_level(2.6, None, None)
        assert risk == "NORMAL"

    def test_normal_birth_weight(self):
        risk, _ = calculate_birth_risk_level(3.2, None, None)
        assert risk == "NORMAL"

    def test_none_weight_returns_normal(self):
        risk, reason = calculate_birth_risk_level(None, None, None)
        assert risk == "NORMAL"
        assert "insufficient" in reason.lower() or "data" in reason.lower()

    def test_muac_override_to_sam(self):
        """MUAC < 11.5 cm upgrades even a normal-weight child to SAM."""
        risk, _ = calculate_birth_risk_level(3.5, None, 11.0)
        assert risk == "SAM"

    def test_muac_upgrade_normal_to_mam(self):
        """MUAC 11.5–12.5 cm upgrades a normal-weight child to MAM."""
        risk, _ = calculate_birth_risk_level(3.5, None, 12.0)
        assert risk == "MAM"

    def test_muac_cannot_downgrade_sam(self):
        """A normal MUAC should not downgrade a weight-based SAM classification."""
        risk, _ = calculate_birth_risk_level(1.5, None, 13.0)
        assert risk == "SAM"

    def test_high_muac_leaves_normal_as_normal(self):
        risk, _ = calculate_birth_risk_level(3.5, None, 14.0)
        assert risk == "NORMAL"


class TestIsSamCase:
    def test_sam_birth_risk_returns_true(self):
        assert is_sam_case("SAM") is True

    def test_mam_birth_risk_returns_false(self):
        assert is_sam_case("MAM") is False

    def test_normal_birth_risk_returns_false(self):
        assert is_sam_case("NORMAL") is False

    def test_none_returns_false(self):
        assert is_sam_case(None) is False
