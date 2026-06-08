"""
API tests for the hospital → nutritionist referral workflow:
  POST /api/hospital/transfer-to-nutritionist/:child_id
  GET  /api/nutritionist/transfer-requests
  POST /api/nutritionist/transfer-requests/:id/accept
  POST /api/nutritionist/transfer-requests/:id/reject
"""
import pytest
from datetime import date
from backend.extensions import db as _db
from backend.models_hierarchical import (
    Child, ChildReferral, ChildEscalation,
    UserRole, EscalationStatus, RiskLevel, ReferralStatus, EscalationRecordStatus,
)


def _create_hospital_child(app, hospital_id, hospital_user_id):
    """Create a child registered at the hospital (SAM-level) for referral tests."""
    import uuid
    with app.app_context():
        child = Child(
            child_unique_id=f"REF-{uuid.uuid4().hex[:6]}",
            name="Referral Child",
            gender="female",
            dob=date(2022, 3, 1),
            birth_weight_kg=1.8,  # SAM
            hospital_id=hospital_id,
            registered_by_user_id=hospital_user_id,
            current_risk_level=RiskLevel.SAM.value,
            birth_risk_level=RiskLevel.SAM.value,
            escalation_status=EscalationStatus.NONE.value,
            current_assigned_role=UserRole.HOSPITAL.value,
            status="ACTIVE",
        )
        _db.session.add(child)
        _db.session.commit()
        _db.session.refresh(child)
        return child.id


def _create_referral(app, child_id, hospital_user_id, hospital_id, nutritionist_hospital_id):
    """Create a pending referral directly in DB."""
    with app.app_context():
        ref = ChildReferral(
            child_id=child_id,
            referred_by_user_id=hospital_user_id,
            referred_to_role="nutritionist",
            hospital_id=nutritionist_hospital_id,
            status=ReferralStatus.PENDING.value,
            referral_reason="SAM at birth",
        )
        _db.session.add(ref)
        child = _db.session.get(Child, child_id)
        child.escalation_status = EscalationStatus.ESCALATED_TO_NUTRITIONIST.value
        _db.session.commit()
        _db.session.refresh(ref)
        return ref.id


class TestHospitalReferral:
    """POST /api/hospital/transfer-to-nutritionist/:child_id"""

    def test_hospital_can_refer_sam_child(self, client, app, api_hospital_user, api_nutritionist):
        hospital_user_id, h_id, hosp_headers = api_hospital_user
        _, nut_h_id, _ = api_nutritionist
        child_id = _create_hospital_child(app, h_id, hospital_user_id)

        rv = client.post(
            f"/api/hospital/transfer-to-nutritionist/{child_id}",
            json={"referral_reason": "SAM at birth"},
            headers=hosp_headers,
        )
        assert rv.status_code in (200, 201)

    def test_unauthenticated_returns_401(self, client, api_hospital_user, app):
        hospital_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hospital_user_id)
        rv = client.post(f"/api/hospital/transfer-to-nutritionist/{child_id}")
        assert rv.status_code == 401

    def test_wrong_role_returns_403(self, client, api_midwife, api_hospital_user, app):
        hospital_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hospital_user_id)
        _, mw_headers = api_midwife
        rv = client.post(
            f"/api/hospital/transfer-to-nutritionist/{child_id}",
            headers=mw_headers,
        )
        assert rv.status_code == 403


class TestNutritionistTransferRequests:
    """GET/POST /api/nutritionist/transfer-requests"""

    def test_nutritionist_sees_pending_referrals(self, client, app, api_nutritionist, api_hospital_user):
        nut_id, nut_h_id, nut_headers = api_nutritionist
        hosp_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hosp_user_id)
        ref_id = _create_referral(app, child_id, hosp_user_id, h_id, nut_h_id)

        rv = client.get("/api/nutritionist/transfer-requests", headers=nut_headers)
        assert rv.status_code == 200
        data = rv.get_json()
        # Actual key is "transfer_requests"
        refs = data.get("transfer_requests", data.get("referrals", data.get("requests", [])))
        # Each item has "referral_id" (not "id") at the top level
        ref_ids = [r.get("referral_id") or r.get("id") for r in refs]
        assert ref_id in ref_ids

    def test_accept_referral_returns_200(self, client, app, api_nutritionist, api_hospital_user):
        nut_id, nut_h_id, nut_headers = api_nutritionist
        hosp_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hosp_user_id)
        ref_id = _create_referral(app, child_id, hosp_user_id, h_id, nut_h_id)

        rv = client.post(
            f"/api/nutritionist/transfer-requests/{ref_id}/accept",
            json={},
            headers=nut_headers,
        )
        assert rv.status_code == 200

    def test_reject_referral_returns_200(self, client, app, api_nutritionist, api_hospital_user):
        nut_id, nut_h_id, nut_headers = api_nutritionist
        hosp_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hosp_user_id)
        ref_id = _create_referral(app, child_id, hosp_user_id, h_id, nut_h_id)

        rv = client.post(
            f"/api/nutritionist/transfer-requests/{ref_id}/reject",
            json={"reason": "Child recovered"},
            headers=nut_headers,
        )
        assert rv.status_code == 200

    def test_referral_status_reviewed_after_accept(self, client, app, api_nutritionist, api_hospital_user):
        nut_id, nut_h_id, nut_headers = api_nutritionist
        hosp_user_id, h_id, _ = api_hospital_user
        child_id = _create_hospital_child(app, h_id, hosp_user_id)
        ref_id = _create_referral(app, child_id, hosp_user_id, h_id, nut_h_id)

        client.post(f"/api/nutritionist/transfer-requests/{ref_id}/accept", json={}, headers=nut_headers)
        with app.app_context():
            ref = _db.session.get(ChildReferral, ref_id)
            assert ref.status == ReferralStatus.REVIEWED.value

    def test_unauthenticated_returns_401(self, client):
        rv = client.get("/api/nutritionist/transfer-requests")
        assert rv.status_code == 401
