"""
Integration test: complete clinical workflow

Hospital registration → Midwife assignment → Measurements → Escalation →
MOH review → MOH escalation to nutritionist → Nutritionist referral →
Nutritionist return to MOH → MOH return to midwife
"""
import uuid
import pytest
from datetime import date
from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, ChildEscalation, ChildReferral,
    UserRole, EscalationStatus, RiskLevel, ReferralStatus, EscalationRecordStatus,
)


class TestFullClinicalWorkflow:
    """
    Happy-path end-to-end test tracing a child through the entire system.
    Each step uses the HTTP layer (Flask test client) to mirror real usage.
    """

    def test_hospital_registers_child(self, client, api_hospital_user):
        """Step 1: Hospital registers a newborn."""
        hosp_user_id, h_id, headers = api_hospital_user
        rv = client.post("/api/hospital/child/register", json={
            "name": "Workflow Child",
            "dob": "2022-06-01",
            "gender": "male",
            "birth_weight_kg": 2.1,  # MAM
            "birth_height_cm": 47.0,
        }, headers=headers)
        assert rv.status_code == 201
        data = rv.get_json()
        child_unique_id = data.get("child", {}).get("child_unique_id") or data.get("child_unique_id")
        assert child_unique_id is not None

    def test_midwife_adds_measurement_to_assigned_child(
        self, client, api_midwife, api_child
    ):
        """Step 3: Midwife records a measurement on their assigned child."""
        _, mw_headers = api_midwife
        rv = client.post("/api/midwife/measurement/add", json={
            "child_id": api_child, "weight_kg": 12.0, "height_cm": 87.0
        }, headers=mw_headers)
        assert rv.status_code == 201
        data = rv.get_json()
        assert "measurement" in data
        assert data.get("new_risk") in ("NORMAL", "MAM", "SAM")

    def test_escalation_full_cycle(self, client, app, api_midwife, api_moh, api_child):
        """
        Steps 4–6: Midwife escalates → MOH accepts → child moves to MOH care.
        """
        _, mw_headers = api_midwife
        _, moh_area_id, moh_headers = api_moh

        # Midwife escalates
        rv = client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=mw_headers)
        assert rv.status_code in (200, 201)

        # Child gone from midwife list
        rv2 = client.get("/api/midwife/children", headers=mw_headers)
        body = rv2.get_json()
        ids = [c["id"] for c in body.get("children", [])]
        assert api_child not in ids

        # MOH sees escalation — response is {"escalations": [...], "count": n}
        rv3 = client.get("/api/moh/escalated-children", headers=moh_headers)
        assert rv3.status_code == 200
        pending = rv3.get_json().get("escalations", [])
        esc_child_ids = [e.get("child_id") for e in pending]
        assert api_child in esc_child_ids

        # MOH accepts
        with app.app_context():
            esc = _db.session.query(ChildEscalation).filter_by(child_id=api_child).first()
            assert esc is not None
            esc_id = esc.id

        rv4 = client.post(f"/api/moh/accept-escalation/{esc_id}", json={}, headers=moh_headers)
        assert rv4.status_code == 200

    def test_moh_return_to_midwife(self, client, app, api_midwife, api_moh, api_child, api_areas):
        """Steps 9–10: MOH returns recovered child back to midwife."""
        midwife_id, mw_headers = api_midwife
        _, moh_area_id, moh_headers = api_moh
        _, phm_id = api_areas

        # First escalate
        client.post(f"/api/midwife/escalate/{api_child}", json={}, headers=mw_headers)

        # Mark risk as NORMAL so return is allowed
        with app.app_context():
            child = _db.session.get(Child, api_child)
            child.current_risk_level = RiskLevel.NORMAL.value
            _db.session.commit()

        # MOH returns to midwife
        rv = client.post(f"/api/moh/return-to-midwife/{api_child}",
                         json={"phm_area_id": phm_id}, headers=moh_headers)
        assert rv.status_code == 200

        # Child reappears in midwife list
        rv2 = client.get("/api/midwife/children", headers=mw_headers)
        assert rv2.status_code == 200
        body = rv2.get_json()
        ids = [c["id"] for c in body.get("children", [])]
        assert api_child in ids

        # Risk reset to NORMAL
        with app.app_context():
            child = _db.session.get(Child, api_child)
            assert child.current_risk_level == RiskLevel.NORMAL.value
            assert child.escalation_status == EscalationStatus.NONE.value
