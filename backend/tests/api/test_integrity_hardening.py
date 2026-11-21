"""Regression coverage for hierarchy and hospital-registration hardening."""

from datetime import datetime
from types import SimpleNamespace

from backend.extensions import db
from backend.models_hierarchical import Area, AreaLevel, UserOTPCode
from backend.routes.auth_jwt import _can_bypass_login_otp


def test_hospital_registration_rejects_invalid_gender(client, api_hospital_user):
    _, _, headers = api_hospital_user
    response = client.post(
        "/api/hospital/child/register",
        headers=headers,
        json={
            "name": "Test child",
            "dob": "2024-01-01",
            "gender": "unknown",
            "birth_weight_kg": 3.1,
        },
    )
    assert response.status_code == 400
    assert "Gender must be" in response.get_json()["message"]


def test_hospital_creation_derives_location_from_rdhs(client, api_ministry):
    _, headers = api_ministry
    pdhs = Area(name="Test PDHS", code="TEST-PDHS", level=AreaLevel.PDHS.value, is_active=True)
    db.session.add(pdhs)
    db.session.flush()
    rdhs = Area(name="Test RDHS", code="TEST-RDHS", level=AreaLevel.RDHS.value, parent_id=pdhs.id, is_active=True)
    db.session.add(rdhs)
    db.session.commit()

    response = client.post(
        "/api/areas/hospitals",
        headers=headers,
        json={"hospital_name": "Hierarchy Hospital", "district_area_id": rdhs.id},
    )

    assert response.status_code == 201
    hospital = response.get_json()["hospital"]
    assert hospital["district_area_id"] == rdhs.id
    assert hospital["district"] == rdhs.name
    assert hospital["province"] == pdhs.name


def test_hospital_creation_rejects_manual_geography_mismatch(client, api_ministry):
    _, headers = api_ministry
    pdhs = Area(name="Mismatch PDHS", code="MISMATCH-PDHS", level=AreaLevel.PDHS.value, is_active=True)
    db.session.add(pdhs)
    db.session.flush()
    rdhs = Area(name="Mismatch RDHS", code="MISMATCH-RDHS", level=AreaLevel.RDHS.value, parent_id=pdhs.id, is_active=True)
    db.session.add(rdhs)
    db.session.commit()

    response = client.post(
        "/api/areas/hospitals",
        headers=headers,
        json={
            "hospital_name": "Rejected Geography Hospital",
            "district_area_id": rdhs.id,
            "province": "Incorrect Province",
        },
    )

    assert response.status_code == 400
    assert "must match" in response.get_json()["message"]


def test_otp_is_invalid_at_its_expiry_boundary():
    assert UserOTPCode(expires_at=datetime.utcnow()).is_expired() is True


def test_privileged_users_do_not_bypass_otp():
    assert _can_bypass_login_otp(SimpleNamespace(is_protected=True, username="superadmin", role="admin")) is False
