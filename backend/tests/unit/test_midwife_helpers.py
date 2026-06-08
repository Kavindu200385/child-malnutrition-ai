"""Unit tests for backend/utils/midwife_helpers.py"""
import pytest
from backend.utils.midwife_helpers import should_escalate_to_moh, can_midwife_access_child
from backend.models_hierarchical import (
    User, Child, Area, WorkerAreaMapping,
    UserRole, EscalationStatus, AreaLevel,
)


class TestShouldEscalateToMoh:
    """
    Escalation triggers: NORMAL→MAM, NORMAL→SAM, MAM→SAM, None→MAM, None→SAM.
    No escalation for improvements or same-level stays.
    """

    # --- Should escalate ---
    def test_normal_to_mam(self):
        assert should_escalate_to_moh("NORMAL", "MAM") is True

    def test_normal_to_sam(self):
        assert should_escalate_to_moh("NORMAL", "SAM") is True

    def test_mam_to_sam(self):
        assert should_escalate_to_moh("MAM", "SAM") is True

    def test_none_previous_to_mam(self):
        assert should_escalate_to_moh(None, "MAM") is True

    def test_none_previous_to_sam(self):
        assert should_escalate_to_moh(None, "SAM") is True

    def test_empty_previous_to_mam(self):
        assert should_escalate_to_moh("", "MAM") is True

    # --- Should NOT escalate ---
    def test_sam_stays_sam(self):
        assert should_escalate_to_moh("SAM", "SAM") is False

    def test_mam_stays_mam(self):
        assert should_escalate_to_moh("MAM", "MAM") is False

    def test_normal_stays_normal(self):
        assert should_escalate_to_moh("NORMAL", "NORMAL") is False

    def test_sam_improves_to_mam(self):
        assert should_escalate_to_moh("SAM", "MAM") is False

    def test_sam_improves_to_normal(self):
        assert should_escalate_to_moh("SAM", "NORMAL") is False

    def test_mam_improves_to_normal(self):
        assert should_escalate_to_moh("MAM", "NORMAL") is False

    def test_none_previous_to_normal(self):
        assert should_escalate_to_moh(None, "NORMAL") is False


class TestCanMidwifeAccessChild:
    """Access control: midwife can access child whose phm_area_id matches their mapping."""

    def test_midwife_can_access_own_area_child(self, db, midwife_user, assigned_child):
        assert can_midwife_access_child(midwife_user, assigned_child) is True

    def test_midwife_can_access_escalated_child(self, db, midwife_user, assigned_child):
        """Even escalated children remain readable by area check."""
        assigned_child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        assigned_child.current_assigned_role = UserRole.MOH.value
        db.session.flush()
        assert can_midwife_access_child(midwife_user, assigned_child) is True

    def test_midwife_cannot_access_different_area_child(self, db, midwife_user):
        other_area = Area(name="Other PHM", level=AreaLevel.PHM.value, is_active=True)
        db.session.add(other_area)
        db.session.flush()
        other_child = Child(
            child_unique_id="OTHER-XYZ",
            name="Other Child",
            gender="female",
            escalation_status=EscalationStatus.NONE.value,
            phm_area_id=other_area.id,
        )
        db.session.add(other_child)
        db.session.flush()
        assert can_midwife_access_child(midwife_user, other_child) is False

    def test_midwife_without_area_mapping_denied(self, db, assigned_child):
        orphan = User(
            username="orphan_mw",
            name="Orphan Midwife",
            role=UserRole.MIDWIFE.value,
            is_active=True,
            password_hash="x",
        )
        db.session.add(orphan)
        db.session.flush()
        assert can_midwife_access_child(orphan, assigned_child) is False

    def test_child_with_no_phm_area_denied(self, db, midwife_user):
        child_no_area = Child(
            child_unique_id="NO-AREA-001",
            name="Area-less Child",
            gender="male",
            escalation_status=EscalationStatus.NONE.value,
            phm_area_id=None,
        )
        db.session.add(child_no_area)
        db.session.flush()
        assert can_midwife_access_child(midwife_user, child_no_area) is False
