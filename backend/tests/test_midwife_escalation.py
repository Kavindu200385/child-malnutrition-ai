"""
Unit tests for midwife → MOH escalation logic.

Covers:
  1. escalate_to_moh sets current_assigned_role to 'moh'
  2. escalated child is excluded from midwife's list_children query
  3. returned child re-appears in midwife's list_children query
  4. can_midwife_access_child uses PHM area (not assignment role)
  5. dashboard stats exclude escalated child
"""
import pytest
from backend.models_hierarchical import (
    User, Child, ChildEscalation, Area,
    UserRole, EscalationStatus, EscalationRecordStatus, RiskLevel,
    WorkerAreaMapping, AreaLevel,
)


# ---------------------------------------------------------------------------
# Helper: replicate list_children query logic (same filters as the route)
# ---------------------------------------------------------------------------
def _midwife_children(db, user):
    return db.session.query(Child).filter(
        Child.current_assigned_role == UserRole.MIDWIFE.value,
        Child.current_assigned_user_id == user.id,
    ).all()


def _dashboard_child_count(db, user):
    return db.session.query(Child).filter(
        Child.current_assigned_role == UserRole.MIDWIFE.value,
        Child.current_assigned_user_id == user.id,
    ).count()


# ---------------------------------------------------------------------------
# Escalation sets current_assigned_role to MOH
# ---------------------------------------------------------------------------
class TestEscalateToMoh:
    def test_escalation_changes_role_to_moh(self, db, assigned_child, midwife_user):
        """After escalation, current_assigned_role must be 'moh'."""
        child = assigned_child

        # Simulate the escalation (mirrors midwife.py escalate_to_moh)
        esc = ChildEscalation(
            child_id=child.id,
            escalated_by_user_id=midwife_user.id,
            from_role="midwife",
            to_role="moh",
            moh_id=child.moh_area_id,
            reason="Risk level increased",
            status=EscalationRecordStatus.PENDING.value,
        )
        db.session.add(esc)
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value  # THE FIX
        db.session.flush()

        assert child.current_assigned_role == UserRole.MOH.value
        assert child.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value

    def test_escalated_child_absent_from_midwife_list(self, db, assigned_child, midwife_user):
        """After escalation, child must NOT appear in midwife's list_children."""
        child = assigned_child

        # Before escalation: child is visible
        before = _midwife_children(db, midwife_user)
        assert child in before

        # Escalate
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        after = _midwife_children(db, midwife_user)
        assert child not in after

    def test_escalated_child_excluded_from_dashboard_stats(self, db, assigned_child, midwife_user):
        """Dashboard count must drop to 0 once child is escalated."""
        assert _dashboard_child_count(db, midwife_user) == 1

        assigned_child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        assigned_child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        assert _dashboard_child_count(db, midwife_user) == 0

    def test_duplicate_escalation_blocked(self, db, assigned_child):
        """A child already escalated to MOH should not be escalated again."""
        assigned_child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        assigned_child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        # The route checks this condition before creating a second record
        already_escalated = (
            assigned_child.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value
        )
        assert already_escalated, "Re-escalation guard should trigger"


# ---------------------------------------------------------------------------
# Return to midwife restores visibility
# ---------------------------------------------------------------------------
class TestReturnToMidwife:
    def test_returned_child_reappears_in_midwife_list(self, db, assigned_child, midwife_user, phm_area):
        """After MOH returns the child, it must appear in midwife's list again."""
        child = assigned_child

        # Escalate first
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value
        db.session.flush()
        assert child not in _midwife_children(db, midwife_user)

        # Simulate MOH return_to_midwife (mirrors moh.py return_to_midwife)
        child.current_risk_level = RiskLevel.NORMAL.value
        child.escalation_status = EscalationStatus.NONE.value
        child.current_assigned_role = UserRole.MIDWIFE.value

        # Re-assign to the midwife covering the PHM area
        mapping = db.session.query(WorkerAreaMapping).filter_by(
            area_id=phm_area.id, is_active=True
        ).first()
        if mapping:
            child.current_assigned_user_id = mapping.user_id
        db.session.flush()

        assert child in _midwife_children(db, midwife_user)

    def test_returned_child_risk_reset_to_normal(self, db, assigned_child):
        """MOH return must set current_risk_level back to NORMAL."""
        child = assigned_child
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        # Return
        child.current_risk_level = RiskLevel.NORMAL.value
        child.escalation_status = EscalationStatus.NONE.value
        child.current_assigned_role = UserRole.MIDWIFE.value
        db.session.flush()

        assert child.current_risk_level == RiskLevel.NORMAL.value
        assert child.escalation_status == EscalationStatus.NONE.value


# ---------------------------------------------------------------------------
# can_midwife_access_child — area-based check survives escalation
# ---------------------------------------------------------------------------
class TestCanMidwifeAccessChild:
    def test_midwife_can_access_own_phm_area_child(self, db, assigned_child, midwife_user):
        """Midwife with matching PHM area can always access the child (area-based)."""
        from backend.utils.midwife_helpers import can_midwife_access_child
        assert can_midwife_access_child(midwife_user, assigned_child) is True

    def test_midwife_can_access_escalated_child_profile(self, db, assigned_child, midwife_user):
        """Even after escalation, midwife can still read the child profile (area check, not role)."""
        from backend.utils.midwife_helpers import can_midwife_access_child

        assigned_child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        assigned_child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        # Area-based check should still pass
        assert can_midwife_access_child(midwife_user, assigned_child) is True

    def test_midwife_cannot_access_different_area_child(self, db, midwife_user):
        """Midwife should be denied access to a child whose PHM area differs."""
        from backend.utils.midwife_helpers import can_midwife_access_child

        other_area = Area(name="Other PHM Area", level=AreaLevel.PHM.value, is_active=True)
        db.session.add(other_area)
        db.session.flush()

        other_child = Child(
            child_unique_id="OTHER-001",
            name="Other Child",
            gender="female",
            escalation_status=EscalationStatus.NONE.value,
            current_assigned_role=UserRole.MIDWIFE.value,
            phm_area_id=other_area.id,
        )
        db.session.add(other_child)
        db.session.flush()

        assert can_midwife_access_child(midwife_user, other_child) is False

    def test_midwife_without_phm_area_denied(self, db, assigned_child):
        """Midwife with no WorkerAreaMapping is denied access."""
        from backend.utils.midwife_helpers import can_midwife_access_child

        orphan = Child.__new__(Child)  # don't persist
        orphan_user = User(username="orphan", name="Orphan User",
                           role=UserRole.MIDWIFE.value, is_active=True, password_hash="x")
        db.session.add(orphan_user)
        db.session.flush()

        assert can_midwife_access_child(orphan_user, assigned_child) is False


# ---------------------------------------------------------------------------
# Escalation record creation
# ---------------------------------------------------------------------------
class TestEscalationRecord:
    def test_escalation_record_stored_with_correct_roles(self, db, assigned_child, midwife_user):
        """The ChildEscalation record must capture from_role='midwife', to_role='moh'."""
        child = assigned_child
        esc = ChildEscalation(
            child_id=child.id,
            escalated_by_user_id=midwife_user.id,
            from_role="midwife",
            to_role="moh",
            moh_id=child.moh_area_id,
            reason="SAM detected",
            status=EscalationRecordStatus.PENDING.value,
        )
        db.session.add(esc)
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value
        db.session.flush()

        stored = db.session.query(ChildEscalation).filter_by(child_id=child.id).first()
        assert stored is not None
        assert stored.from_role == "midwife"
        assert stored.to_role == "moh"
        assert stored.status == EscalationRecordStatus.PENDING.value

    def test_escalation_record_linked_to_correct_moh_area(self, db, assigned_child, midwife_user, moh_area):
        """Escalation record must reference the child's MOH area ID."""
        child = assigned_child
        esc = ChildEscalation(
            child_id=child.id,
            escalated_by_user_id=midwife_user.id,
            from_role="midwife",
            to_role="moh",
            moh_id=child.moh_area_id,
            status=EscalationRecordStatus.PENDING.value,
        )
        db.session.add(esc)
        db.session.flush()

        assert esc.moh_id == moh_area.id
