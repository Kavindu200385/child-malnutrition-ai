"""
API tests for measurement endpoints across roles:
  POST /api/midwife/measurement/add
  POST /api/moh/measurement/add
  POST /api/nutritionist/measurement/add
"""
import pytest
from datetime import date
import backend.routes.midwife as midwife_route
from backend.extensions import db as _db
from backend.models_hierarchical import (
    AuditLog, Child, ChildEscalation, ChildReferral,
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

    def test_assessment_works_without_muac(self, client, api_midwife, api_child):
        _, headers = api_midwife
        payload = {
            "child_id": api_child,
            "weight_kg": 10.5,
            "height_cm": 80.0,
        }
        rv = client.post(self.URL, json=payload, headers=headers)
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["muac_status"] == "Not Recorded"
        assert "MUAC" not in str(meas.get("clinical_review_reason") or "")

    def test_assessment_works_without_edema(self, client, api_midwife, api_child):
        _, headers = api_midwife
        payload = {
            "child_id": api_child,
            "weight_kg": 10.5,
            "height_cm": 80.0,
            "muac_cm": 13.5,
        }
        rv = client.post(self.URL, json=payload, headers=headers)
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["edema_status"] == "Not Recorded"

    def test_edema_yes_triggers_sam_and_clinical_action(self, client, api_midwife, api_child):
        _, headers = api_midwife
        payload = {
            "child_id": api_child,
            "weight_kg": 10.5,
            "height_cm": 80.0,
            "edema": "yes",
        }
        rv = client.post(self.URL, json=payload, headers=headers)
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["edema_status"] == "Edema Present"
        assert meas["current_nutritional_status"] == "SAM"
        assert meas["clinical_action_required"] is True

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

    def test_response_contains_rule_based_current_status_breakdown(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        meas = rv.get_json().get("measurement", {})
        assert "current_nutritional_status" in meas
        assert "underweight_status" in meas
        assert "stunting_status" in meas
        assert "wasting_status" in meas
        assert "muac_status" in meas
        assert "edema_status" in meas
        assert isinstance(meas.get("current_status_breakdown"), dict)

    def test_response_contains_future_prediction_metadata(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        meas = rv.get_json().get("measurement", {})
        assert "future_predicted_risk" in meas
        assert "future_risk_confidence" in meas
        assert "prediction_timestamp" in meas
        assert "model_version" in meas
        assert "training_dataset_version" in meas
        assert "explanation_factors" in meas

    def test_response_includes_clinical_safety_fields(self, client, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        meas = rv.get_json()["measurement"]

        assert "current_nutritional_status" in meas
        assert "future_predicted_risk" in meas
        assert "clinical_action_required" in meas
        assert "current_status_breakdown" in meas

    def test_clinical_decision_audit_log_is_safe(self, client, app, api_midwife, api_child):
        _, headers = api_midwife
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        assert rv.status_code == 201
        meas = rv.get_json()["measurement"]

        with app.app_context():
            log = (
                _db.session.query(AuditLog)
                .filter(
                    AuditLog.action_type == "CLINICAL_DECISION_CALCULATED",
                    AuditLog.entity_id == meas["id"],
                )
                .order_by(AuditLog.id.desc())
                .first()
            )
            assert log is not None
            assert log.metadata_json["measurement_id"] == meas["id"]
            assert log.metadata_json["child_id"] is not None
            assert "current_nutritional_status" in log.metadata_json
            assert "future_predicted_risk" in log.metadata_json
            assert "child_name" not in log.metadata_json
            assert "guardian_phone" not in log.metadata_json
            assert "address" not in log.metadata_json

    def test_negative_muac_is_rejected_only_if_provided(self, client, api_midwife, api_child):
        _, headers = api_midwife
        ok_rv = client.post(
            self.URL,
            json={"child_id": api_child, "weight_kg": 10.5, "height_cm": 80.0},
            headers=headers,
        )
        bad_rv = client.post(
            self.URL,
            json={"child_id": api_child, "weight_kg": 10.5, "height_cm": 80.0, "muac_cm": -1},
            headers=headers,
        )

        assert ok_rv.status_code == 201
        assert bad_rv.status_code == 400
        assert "MUAC cannot be negative." in bad_rv.get_json()["message"]

    def test_current_status_is_rule_based_and_future_risk_is_separate(self, client, api_midwife, api_child, monkeypatch):
        _, headers = api_midwife

        def stub_zscores(**_kwargs):
            return -2.4, -1.0, -1.0

        def stub_payload(**_kwargs):
            return {"ok": True, "payload": {}, "warning": None, "history_source": "measurements"}

        def stub_future(_payload):
            return {
                "ok": True,
                "predicted_risk_next_2_months": "High",
                "confidence": 0.92,
                "model_version": "future-test-v1",
                "training_dataset_version": "test-ds-v1",
                "explanation_factors": ["low WFA z-score"],
                "prediction_timestamp": "2026-06-17T10:00:00",
                "low_confidence": False,
            }

        monkeypatch.setattr(midwife_route, "ai_compute_z_scores", stub_zscores)
        monkeypatch.setattr(midwife_route, "build_future_prediction_payload", stub_payload)
        monkeypatch.setattr(midwife_route, "predict_future_risk", stub_future)

        rv = client.post(
            self.URL,
            json={"child_id": api_child, "weight_kg": 10.5, "height_cm": 80.0},
            headers=headers,
        )
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["current_nutritional_status"] == "UNDERWEIGHT"
        assert meas["future_predicted_risk"] == "HIGH RISK"
        assert meas["current_nutritional_status"] != meas["future_predicted_risk"]

    def test_declining_is_never_shown_as_current_nutritional_status(self, client, api_midwife, api_child, monkeypatch):
        _, headers = api_midwife

        def stub_zscores(**_kwargs):
            return -1.0, -1.0, -1.0

        def stub_payload(**_kwargs):
            return {"ok": True, "payload": {}, "warning": None, "history_source": "measurements"}

        def stub_future(_payload):
            return {
                "ok": True,
                "predicted_risk_next_2_months": "Declining",
                "confidence": 0.91,
                "model_version": "future-test-v1",
                "training_dataset_version": "test-ds-v1",
                "explanation_factors": ["previous decline"],
                "prediction_timestamp": "2026-06-17T10:00:00",
                "low_confidence": False,
            }

        monkeypatch.setattr(midwife_route, "ai_compute_z_scores", stub_zscores)
        monkeypatch.setattr(midwife_route, "build_future_prediction_payload", stub_payload)
        monkeypatch.setattr(midwife_route, "predict_future_risk", stub_future)

        rv = client.post(
            self.URL,
            json={"child_id": api_child, "weight_kg": 10.5, "height_cm": 80.0},
            headers=headers,
        )
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["current_nutritional_status"] == "NORMAL"
        assert meas["future_predicted_risk"] == "DECLINING"
        assert meas["current_nutritional_status"] != "DECLINING"

    def test_low_model_confidence_returns_needs_clinical_review(self, client, api_midwife, api_child, monkeypatch):
        _, headers = api_midwife

        def stub_payload(**_kwargs):
            return {"ok": True, "payload": {}, "warning": None, "history_source": "measurements"}

        def stub_future(_payload):
            return {
                "ok": True,
                "predicted_risk_next_2_months": "NEEDS CLINICAL REVIEW",
                "confidence": 0.45,
                "model_version": "future-test-v1",
                "training_dataset_version": "test-ds-v1",
                "explanation_factors": ["low current weight"],
                "prediction_timestamp": "2026-06-17T10:00:00",
                "low_confidence": True,
            }

        monkeypatch.setattr(midwife_route, "build_future_prediction_payload", stub_payload)
        monkeypatch.setattr(midwife_route, "predict_future_risk", stub_future)

        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        meas = rv.get_json()["measurement"]

        assert rv.status_code == 201
        assert meas["future_predicted_risk"] == "NEEDS CLINICAL REVIEW"
        assert meas["clinical_action_required"] is True

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

    def test_future_dob_is_rejected(self, client, api_midwife, api_child, app):
        _, headers = api_midwife
        with app.app_context():
            child = _db.session.get(Child, api_child)
            child.dob = date.today().replace(year=date.today().year + 1)
            _db.session.commit()
            _db.session.remove()
        rv = client.post(self.URL, json=self._payload(api_child), headers=headers)
        assert rv.status_code == 400
        assert "Date of birth cannot be in the future." in rv.get_json()["message"]

    def test_measurement_date_before_dob_is_rejected(self, client, api_midwife, api_child, app):
        _, headers = api_midwife
        with app.app_context():
            child = _db.session.get(Child, api_child)
            child.dob = date(2024, 1, 1)
            _db.session.commit()
            _db.session.remove()
        rv = client.post(
            self.URL,
            json={**self._payload(api_child), "measurement_date": "2023-12-01"},
            headers=headers,
        )
        assert rv.status_code == 400
        assert "Measurement date cannot be before date of birth." in rv.get_json()["message"]

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
