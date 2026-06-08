"""
API tests for /api/children endpoints

Covers: registration, list (role-scoped), detail access with RBAC.
"""
import pytest
import uuid
from datetime import date
from flask_jwt_extended import create_access_token
from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, Area, User, WorkerAreaMapping,
    UserRole, EscalationStatus, RiskLevel, AreaLevel,
)


class TestChildRegistration:
    """POST /api/children — midwife and hospital roles may register children."""

    def test_midwife_registers_child_returns_201(self, client, api_midwife, api_areas):
        _, headers = api_midwife
        rv = client.post("/api/children", json={
            "child_id": f"MCH-{uuid.uuid4().hex[:8].upper()}",
            "name": "New Child",
            "dob": "2022-06-15",
            "gender": "female",
            "birth_weight_kg": 3.1,
        }, headers=headers)
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["status"] == "success"

    def test_missing_required_fields_returns_400(self, client, api_midwife):
        _, headers = api_midwife
        # child_id is required
        rv = client.post("/api/children", json={"name": "Incomplete"}, headers=headers)
        assert rv.status_code in (400, 409)

    def test_unauthenticated_registration_returns_401(self, client):
        rv = client.post("/api/children", json={
            "name": "Child", "dob": "2022-01-01", "gender": "male", "birth_weight_kg": 3.0
        })
        assert rv.status_code == 401


class TestChildList:
    """GET /api/children — each role sees only their own scope of children."""

    def test_unauthenticated_returns_401(self, client):
        rv = client.get("/api/children")
        assert rv.status_code == 401

    def test_midwife_can_list_children(self, client, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/children", headers=headers)
        assert rv.status_code == 200
        data = rv.get_json()
        assert "children" in data or isinstance(data, list) or data.get("status") == "success"

    def test_midwife_sees_only_own_children(self, client, api_midwife, api_child):
        """Midwife should see the child assigned to them (by area)."""
        _, headers = api_midwife
        rv = client.get("/api/children", headers=headers)
        assert rv.status_code == 200
        body = rv.get_json()
        children = body.get("children", [])
        child_ids = [c["id"] for c in children]
        assert api_child in child_ids

    def test_ministry_can_list_children(self, client, api_ministry):
        _, headers = api_ministry
        rv = client.get("/api/children", headers=headers)
        assert rv.status_code == 200

    def test_midwife_cannot_see_other_midwifes_children(self, client, api_midwife, api_areas):
        """Midwife A's list does not contain a child assigned to a different PHM area."""
        moh_id, phm_id = api_areas
        # Create a second MOH+PHM area to isolate from the first
        moh2 = Area(name=f"MOH2-{uuid.uuid4().hex[:6]}", level=AreaLevel.MOH.value, is_active=True)
        _db.session.add(moh2)
        _db.session.flush()
        phm2 = Area(name=f"PHM2-{uuid.uuid4().hex[:6]}", level=AreaLevel.PHM.value,
                    parent_id=moh2.id, is_active=True)
        _db.session.add(phm2)
        _db.session.flush()
        phm2_id = phm2.id

        # Midwife 2 in the second PHM area
        mw2 = User(username=f"mw2_{uuid.uuid4().hex[:6]}", name="Midwife 2",
                   role=UserRole.MIDWIFE.value, is_active=True)
        mw2.set_password("Test1234!")
        _db.session.add(mw2)
        _db.session.flush()
        _db.session.add(WorkerAreaMapping(user_id=mw2.id, area_id=phm2_id, is_active=True))
        _db.session.flush()
        mw2_id = mw2.id

        # Child in midwife 2's area
        child2 = Child(
            child_unique_id=f"MWB-{uuid.uuid4().hex[:6]}",
            name="Midwife2 Child",
            gender="female",
            dob=date(2022, 1, 1),
            current_risk_level=RiskLevel.NORMAL.value,
            escalation_status=EscalationStatus.NONE.value,
            current_assigned_role=UserRole.MIDWIFE.value,
            current_assigned_user_id=mw2_id,
            current_assigned_area_id=phm2_id,
            phm_area_id=phm2_id,
            status="ACTIVE",
        )
        _db.session.add(child2)
        _db.session.flush()
        child2_id = child2.id
        _db.session.commit()
        _db.session.remove()

        # Midwife 1's list should NOT contain child2
        _, headers1 = api_midwife
        rv = client.get("/api/children", headers=headers1)
        assert rv.status_code == 200
        body = rv.get_json()
        children = body.get("children", [])
        ids = [c["id"] for c in children]
        assert child2_id not in ids


class TestChildDetail:
    """GET /api/children/:id — role-based access control."""

    def test_midwife_accesses_own_child(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.get(f"/api/children/{api_child}", headers=headers)
        assert rv.status_code == 200

    def test_ministry_accesses_any_child(self, client, api_ministry, api_child):
        _, headers = api_ministry
        rv = client.get(f"/api/children/{api_child}", headers=headers)
        assert rv.status_code == 200

    def test_unauthenticated_returns_401(self, client, api_child):
        rv = client.get(f"/api/children/{api_child}")
        assert rv.status_code == 401

    def test_nonexistent_child_returns_404(self, client, api_ministry):
        _, headers = api_ministry
        rv = client.get("/api/children/999999", headers=headers)
        assert rv.status_code == 404
