"""
API tests for measurement endpoints across roles:
  POST /api/midwife/measurement/add
  POST /api/moh/measurement/add
  POST /api/nutritionist/measurement/add
"""
import pytest
from datetime import date
from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, ChildEscalation, ChildReferral,
    UserRole, EscalationStatus, RiskLevel, EscalationRecordStatus, ReferralStatus,
)


# ---------------------------------------------------------------------------
# Midwife measurements
# ---------------------------------------------------------------------------

class TestMidwifeMeasurement:
    URL = "/api/midwife/measurement/add"

    def _payload(self, child_id):
        return {
            "child_id": child_id,
            "weight_kg": 10.5,
            "height_cm": 80.0,
            "muac_cm": 13.5,
        }

    def test_valid_measurement_returns_201(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        assert rv.status_code == 201

    def test_response_contains_z_scores(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        data = rv.get_json()
        meas = data.get("measurement", {})
        assert meas.get("z_score_wfa") is not None
        assert meas.get("z_score_hfa") is not None
        assert meas.get("z_score_wfh") is not None

    def test_response_contains_risk_level(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        data = rv.get_json()
        meas = data.get("measurement", {})
        assert meas.get("risk_level") in ("NORMAL", "MAM", "SAM")

    def test_response_contains_escalation_needed(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        data = rv.get_json()
        assert "escalation_needed" in data
        assert isinstance(data["escalation_needed"], bool)

    def test_response_contains_new_risk(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        data = rv.get_json()
        assert "new_risk" in data
        assert data["new_risk"] in ("NORMAL", "MAM", "SAM")

    def test_missing_weight_returns_400(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json={"child_id": api_child, "height_cm": 80.0}, headers=headers)
        assert rv.status_code == 400

    def test_missing_height_returns_400(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json={"child_id": api_child, "weight_kg": 10.5}, headers=headers)
        assert rv.status_code == 400

    def test_unauthenticated_returns_401(self, client, api_child):
        rv = client.post(self.URL, json=self._payload(api_child))
        assert rv.status_code == 401

    def test_wrong_role_returns_403(self, client, api_moh, api_child):
        _, _moh_area, headers = api_moh
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        assert rv.status_code == 403

    def test_z_scores_are_within_bounds(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        data = rv.get_json()
        meas = data.get("measurement", {})
        for key in ("z_score_wfa", "z_score_hfa", "z_score_wfh"):
            z = float(meas.get(key, 0))
            assert -5.5 <= z <= 5.5, f"{key}={z} out of expected bounds"


# ---------------------------------------------------------------------------
# MOH measurements (child must be escalated to MOH first)
# ---------------------------------------------------------------------------

class TestMohMeasurement:
    URL = "/api/moh/measurement/add"

    def _escalate_child(self, app, child_id, moh_area_id, midwife_user_id):
        """Escalate a child to MOH so MOH can record measurements."""
        with app.app_context():
            child = _db.session.get(Child, child_id)
            esc = ChildEscalation(
                child_id=child_id,
                escalated_by_user_id=midwife_user_id,
                from_role="midwife",
                to_role="moh",
                moh_id=moh_area_id,
                status=EscalationRecordStatus.PENDING.value,
            )
            _db.session.add(esc)
            child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
            child.current_assigned_role = UserRole.MOH.value
            _db.session.commit()

    def test_moh_cannot_measure_non_escalated_child(self, client, api_moh, api_child):
        _, _area, headers = api_moh
        rv = client.post(self.URL, json={
            "child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0
        }, headers=headers)
        assert rv.status_code == 403

    def test_moh_can_measure_escalated_child(self, client, app, api_moh, api_midwife, api_child, api_areas):
        _, moh_area_id, moh_headers = api_moh
        midwife_id, _ = api_midwife

        self._escalate_child(app, api_child, moh_area_id, midwife_id)

        rv = client.post(self.URL, json={
            "child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0
        }, headers=moh_headers)
        assert rv.status_code == 201

    def test_unauthenticated_returns_401(self, client, api_child):
        rv = client.post(self.URL, json={"child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0})
        assert rv.status_code == 401


# ---------------------------------------------------------------------------
# Nutritionist measurements (child must have accepted referral)
# ---------------------------------------------------------------------------

class TestNutritionistMeasurement:
    URL = "/api/nutritionist/measurement/add"

    def test_nutritionist_cannot_measure_without_referral(self, client, api_nutritionist, api_child):
        _, _, headers = api_nutritionist
        rv = client.post(self.URL, json={
            "child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0
        }, headers=headers)
        assert rv.status_code == 403

    def test_unauthenticated_returns_401(self, client, api_child):
        rv = client.post(self.URL, json={"child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0})
        assert rv.status_code == 401
