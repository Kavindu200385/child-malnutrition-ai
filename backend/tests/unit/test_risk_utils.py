"""Unit tests for backend/utils/risk_utils.py"""
import pytest
from backend.utils.risk_utils import is_sam, is_mam, is_normal, display_risk_level


class TestIsSam:
    def test_sam_string(self):
        assert is_sam("SAM") is True

    def test_critical_string(self):
        assert is_sam("CRITICAL") is True

    def test_lowercase(self):
        assert is_sam("sam") is True
        assert is_sam("critical") is True

    def test_mam_is_not_sam(self):
        assert is_sam("MAM") is False

    def test_normal_is_not_sam(self):
        assert is_sam("NORMAL") is False

    def test_none_is_not_sam(self):
        assert is_sam(None) is False

    def test_empty_is_not_sam(self):
        assert is_sam("") is False


class TestIsMam:
    def test_mam_string(self):
        assert is_mam("MAM") is True

    def test_moderate_string(self):
        assert is_mam("MODERATE") is True

    def test_high_string(self):
        assert is_mam("HIGH") is True

    def test_lowercase(self):
        assert is_mam("mam") is True
        assert is_mam("moderate") is True
        assert is_mam("high") is True

    def test_sam_is_not_mam(self):
        assert is_mam("SAM") is False

    def test_normal_is_not_mam(self):
        assert is_mam("NORMAL") is False

    def test_none_is_not_mam(self):
        assert is_mam(None) is False

    def test_empty_is_not_mam(self):
        assert is_mam("") is False


class TestIsNormal:
    def test_normal_string(self):
        assert is_normal("NORMAL") is True

    def test_low_string(self):
        assert is_normal("LOW") is True

    def test_lowercase(self):
        assert is_normal("normal") is True
        assert is_normal("low") is True

    def test_mam_is_not_normal(self):
        assert is_normal("MAM") is False

    def test_sam_is_not_normal(self):
        assert is_normal("SAM") is False

    def test_none_is_not_normal(self):
        assert is_normal(None) is False

    def test_empty_is_not_normal(self):
        assert is_normal("") is False


class TestDisplayRiskLevel:
    def _child(self, last_risk_update=None, current_risk_level=None, birth_risk_level=None):
        """Build a simple namespace object mimicking a Child."""
        class _C:
            pass
        c = _C()
        c.last_risk_update = last_risk_update
        c.current_risk_level = current_risk_level
        c.birth_risk_level = birth_risk_level
        return c

    def test_uses_birth_risk_when_no_clinic_measurement(self):
        child = self._child(last_risk_update=None, birth_risk_level="SAM", current_risk_level=None)
        assert display_risk_level(child) == "SAM"

    def test_uses_current_risk_when_clinic_measurement_exists(self):
        from datetime import datetime
        child = self._child(
            last_risk_update=datetime.now(),
            birth_risk_level="SAM",
            current_risk_level="NORMAL",
        )
        assert display_risk_level(child) == "NORMAL"

    def test_falls_back_to_current_when_birth_absent(self):
        from datetime import datetime
        child = self._child(
            last_risk_update=datetime.now(),
            birth_risk_level=None,
            current_risk_level="MAM",
        )
        assert display_risk_level(child) == "MAM"

    def test_falls_back_to_normal_when_both_absent(self):
        child = self._child(last_risk_update=None, birth_risk_level=None, current_risk_level=None)
        assert display_risk_level(child) == "NORMAL"

    def test_prefers_birth_risk_when_no_update_and_both_set(self):
        child = self._child(last_risk_update=None, birth_risk_level="MAM", current_risk_level="NORMAL")
        assert display_risk_level(child) == "MAM"
