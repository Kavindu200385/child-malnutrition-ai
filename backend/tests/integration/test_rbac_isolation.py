"""
Integration tests for data isolation between roles / areas.

Ensures that:
- Midwife A cannot see Midwife B's children in the midwife list
- Nutritionist cannot see children without a reviewed referral
"""
import uuid
import pytest
from datetime import date
from flask_jwt_extended import create_access_token

from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, User, Area, WorkerAreaMapping,
    UserRole, EscalationStatus, RiskLevel, AreaLevel,
)


def _commit_release():
    _db.session.commit()
    _db.session.remove()


def _make_isolated_midwife(phm_area_id):
    """Create a midwife user mapped to an area. Returns (user_id, auth_headers)."""
    u = User(username=f"iso_mw_{uuid.uuid4().hex[:6]}", name="ISO Midwife",
             role=UserRole.MIDWIFE.value, is_active=True)
    u.set_password("Test1234!")
    _db.session.add(u)
    _db.session.flush()
    _db.session.add(WorkerAreaMapping(user_id=u.id, area_id=phm_area_id, is_active=True))
    _db.session.flush()
    user_id = u.id
    _commit_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": UserRole.MIDWIFE.value})
    return user_id, {"Authorization": f"Bearer {token}"}


def _make_child_for(midwife_id, phm_area_id):
    """Create a child assigned to a midwife in a specific PHM area."""
    child = Child(
        child_unique_id=f"ISO-{uuid.uuid4().hex[:6]}",
        name="ISO Child",
        gender="male",
        dob=date(2022, 1, 1),
        current_risk_level=RiskLevel.NORMAL.value,
        escalation_status=EscalationStatus.NONE.value,
        current_assigned_role=UserRole.MIDWIFE.value,
        current_assigned_user_id=midwife_id,
        current_assigned_area_id=phm_area_id,
        phm_area_id=phm_area_id,
        status="ACTIVE",
    )
    _db.session.add(child)
    _db.session.flush()
    child_id = child.id
    _commit_release()
    return child_id


class TestMidwifeIsolation:
    """Two midwives in different PHM areas (under DIFFERENT MOH areas) cannot share lists."""

    def test_midwife_sees_own_children_only(self, client):
        # Create two completely separate MOH+PHM hierarchies
        moh_c = Area(name=f"MOH_C_{uuid.uuid4().hex[:4]}", level=AreaLevel.MOH.value, is_active=True)
        _db.session.add(moh_c)
        _db.session.flush()
        moh_d = Area(name=f"MOH_D_{uuid.uuid4().hex[:4]}", level=AreaLevel.MOH.value, is_active=True)
        _db.session.add(moh_d)
        _db.session.flush()
        phm_c = Area(name="PHM_C", level=AreaLevel.PHM.value, parent_id=moh_c.id, is_active=True)
        phm_d = Area(name="PHM_D", level=AreaLevel.PHM.value, parent_id=moh_d.id, is_active=True)
        _db.session.add_all([phm_c, phm_d])
        _db.session.flush()
        phm_c_id, phm_d_id = phm_c.id, phm_d.id
        _commit_release()

        mw_c_id, headers_c = _make_isolated_midwife(phm_c_id)
        mw_d_id, headers_d = _make_isolated_midwife(phm_d_id)

        child_c_id = _make_child_for(mw_c_id, phm_c_id)
        child_d_id = _make_child_for(mw_d_id, phm_d_id)

        # Midwife C sees their child
        rv = client.get("/api/children", headers=headers_c)
        assert rv.status_code == 200
        ids_c = [ch["id"] for ch in rv.get_json().get("children", [])]
        assert child_c_id in ids_c
        # Midwife C does NOT see Midwife D's child
        assert child_d_id not in ids_c

    def test_midwife_cannot_see_other_midwifes_child(self, client):
        """Midwife A cannot see Midwife B's child in their own list."""
        moh_a2 = Area(name=f"MOH_A2_{uuid.uuid4().hex[:4]}", level=AreaLevel.MOH.value, is_active=True)
        _db.session.add(moh_a2)
        _db.session.flush()
        moh_b2 = Area(name=f"MOH_B2_{uuid.uuid4().hex[:4]}", level=AreaLevel.MOH.value, is_active=True)
        _db.session.add(moh_b2)
        _db.session.flush()
        phm_a = Area(name="PHM_A", level=AreaLevel.PHM.value, parent_id=moh_a2.id, is_active=True)
        phm_b = Area(name="PHM_B", level=AreaLevel.PHM.value, parent_id=moh_b2.id, is_active=True)
        _db.session.add_all([phm_a, phm_b])
        _db.session.flush()
        phm_a_id, phm_b_id = phm_a.id, phm_b.id
        _commit_release()

        mw_a_id, headers_a = _make_isolated_midwife(phm_a_id)
        mw_b_id, headers_b = _make_isolated_midwife(phm_b_id)
        child_b_id = _make_child_for(mw_b_id, phm_b_id)

        # Midwife A's list does not include Midwife B's child
        rv = client.get("/api/children", headers=headers_a)
        assert rv.status_code == 200
        ids_a = [ch["id"] for ch in rv.get_json().get("children", [])]
        assert child_b_id not in ids_a


class TestNutritionistIsolation:
    """Nutritionist can only see children with a REVIEWED referral for their hospital."""

    def test_nutritionist_cannot_see_non_referred_child(self, client, api_nutritionist, api_child):
        _, _, headers = api_nutritionist
        rv = client.get(f"/api/nutritionist/child/{api_child}", headers=headers)
        assert rv.status_code in (403, 404)

    def test_nutritionist_referred_children_list_excludes_non_referred(
        self, client, api_nutritionist, api_child
    ):
        _, _, headers = api_nutritionist
        rv = client.get("/api/nutritionist/referred-children", headers=headers)
        assert rv.status_code == 200
        body = rv.get_json()
        children = body.get("children", [])
        ids = [c["id"] for c in children]
        assert api_child not in ids
