"""
API tests for escalation workflows:
  POST /api/midwife/escalate/:child_id
  GET  /api/moh/escalated-children
  POST /api/moh/accept-escalation/:id
  POST /api/moh/reject-escalation/:id
  GET  /api/moh/escalations/badge-count
"""
import pytest
from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, ChildEscalation,
    UserRole, EscalationStatus, EscalationRecordStatus, RiskLevel,
)


def _escalate(app, child_id, midwife_id, moh_area_id):
    """Direct DB helper: create escalation record + update child status."""
    with app.app_context():
        esc = ChildEscalation(
            child_id=child_id,
            escalated_by_user_id=midwife_id,
            from_role="midwife",
            to_role="moh",
            moh_id=moh_area_id,
            status=EscalationRecordStatus.PENDING.value,
        )
        _db.session.add(esc)
        child = _db.session.get(Child, child_id)
        child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
        child.current_assigned_role = UserRole.MOH.value
        _db.session.commit()
        _db.session.refresh(esc)
        return esc.id


class TestMidwifeEscalate:
    """POST /api/midwife/escalate/:child_id"""

    def test_escalate_returns_200(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        assert rv.status_code in (200, 201)

    def test_child_assigned_to_moh_after_escalation(self, client, app, api_midwife, api_child):
        _, headers = api_midwife
        client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        with app.app_context():
            child = _db.session.get(Child, api_child)
            assert child.current_assigned_role == UserRole.MOH.value
            assert child.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value

    def test_child_absent_from_midwife_list_after_escalation(self, client, app, api_midwife, api_child):
        _, headers = api_midwife
        client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        rv = client.get("/api/midwife/children", headers=headers)
        assert rv.status_code == 200
        body = rv.get_json()
        children = body.get("children", [])
        ids = [c["id"] for c in children]
        assert api_child not in ids

    def test_duplicate_escalation_returns_400(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv1 = client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        assert rv1.status_code in (200, 201)
        rv2 = client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        assert rv2.status_code == 400

    def test_unauthenticated_returns_401(self, client, api_child):
        rv = client.post(f"/api/midwife/escalate/{api_child}", json={})
        assert rv.status_code == 401

    def test_wrong_role_returns_403(self, client, api_moh, api_child):
        _, _, headers = api_moh
        rv = client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=headers)
        assert rv.status_code == 403


class TestMohEscalationList:
    """GET /api/moh/escalated-children  — response: {"escalations": [...], "count": n}"""

    def test_returns_escalated_children(self, client, app, api_moh, api_midwife, api_child):
        midwife_id, _ = api_midwife
        _, moh_area_id, moh_headers = api_moh
        _escalate(app, api_child, midwife_id, moh_area_id)

        rv = client.get("/api/moh/escalated-children", headers=moh_headers)
        assert rv.status_code == 200
        data = rv.get_json()
        # Response is {"escalations": [...], "count": n}
        escalations = data.get("escalations", [])
        child_ids = [e.get("child_id") for e in escalations]
        assert api_child in child_ids

    def test_unauthenticated_returns_401(self, client):
        rv = client.get("/api/moh/escalated-children")
        assert rv.status_code == 401


class TestMohAcceptEscalation:
    """POST /api/moh/accept-escalation/:escalation_id"""

    def test_accept_escalation_returns_200(self, client, app, api_moh, api_midwife, api_child):
        midwife_id, _ = api_midwife
        _, moh_area_id, moh_headers = api_moh
        esc_id = _escalate(app, api_child, midwife_id, moh_area_id)

        rv = client.post(f"/api/moh/accept-escalation/{esc_id}", json={}, headers=moh_headers)
        assert rv.status_code == 200

    def test_escalation_status_becomes_reviewed(self, client, app, api_moh, api_midwife, api_child):
        midwife_id, _ = api_midwife
        _, moh_area_id, moh_headers = api_moh
        esc_id = _escalate(app, api_child, midwife_id, moh_area_id)

        client.post(f"/api/moh/accept-escalation/{esc_id}", json={}, headers=moh_headers)
        with app.app_context():
            esc = _db.session.get(ChildEscalation, esc_id)
            assert esc.status == EscalationRecordStatus.REVIEWED.value


class TestMohBadgeCount:
    """GET /api/moh/escalations/badge-count — response: {"pending_count": n}"""

    def test_badge_count_returns_number(self, client, api_moh):
        _, _, headers = api_moh
        rv = client.get("/api/moh/escalations/badge-count", headers=headers)
        assert rv.status_code == 200
        data = rv.get_json()
        # Actual key is pending_count
        assert "pending_count" in data
        assert isinstance(data["pending_count"], int)

    def test_unauthenticated_returns_401(self, client):
        rv = client.get("/api/moh/escalations/badge-count")
        assert rv.status_code == 401
