from datetime import date

from cryptography.fernet import Fernet
from sqlalchemy import text

from backend.extensions import db as _db
from backend.models_hierarchical import Child, Report, RiskLevel, UserRole
from backend.services.encryption_service import decrypt_value, encrypt_value, is_encrypted
from backend.utils.audit import sanitize_audit_payload


def test_encrypt_decrypt_roundtrip(monkeypatch):
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())

    encrypted = encrypt_value("Sensitive Child Name")

    assert is_encrypted(encrypted)
    assert encrypted != "Sensitive Child Name"
    assert decrypt_value(encrypted) == "Sensitive Child Name"
    assert encrypt_value(encrypted) == encrypted


def test_child_sensitive_fields_are_encrypted_at_rest(monkeypatch, db, phm_area, midwife_user):
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    child = Child(
        child_unique_id="ENC-CHILD-001",
        child_id="ENC-CHILD-001",
        name="Encrypted Child",
        dob=date(2022, 1, 1),
        gender="female",
        guardian_name="Encrypted Guardian",
        guardian_phone="0771234567",
        birth_weight_kg=3.2,
        birth_height_cm=49.5,
        current_risk_level=RiskLevel.NORMAL.value,
        current_assigned_role=UserRole.MIDWIFE.value,
        current_assigned_user_id=midwife_user.id,
        current_assigned_area_id=phm_area.id,
        phm_area_id=phm_area.id,
        status="ACTIVE",
    )
    db.session.add(child)
    db.session.flush()

    raw = db.session.execute(
        text("SELECT name, dob, guardian_name, guardian_phone, birth_weight_kg FROM children WHERE id = :id"),
        {"id": child.id},
    ).mappings().one()

    assert is_encrypted(raw["name"])
    assert is_encrypted(raw["dob"])
    assert is_encrypted(raw["guardian_name"])
    assert is_encrypted(raw["guardian_phone"])
    assert is_encrypted(raw["birth_weight_kg"])
    assert child.to_dict()["name"] == "Encrypted Child"
    assert child.to_dict()["guardian_name"] == "Encrypted Guardian"


def test_authorized_user_reads_decrypted_child_and_unauthorized_cannot_access(client, api_midwife, api_child):
    _, headers = api_midwife

    ok = client.get(f"/api/children/{api_child}", headers=headers)
    assert ok.status_code == 200
    assert ok.get_json()["child"]["name"]

    unauthenticated = client.get(f"/api/children/{api_child}")
    assert unauthenticated.status_code == 401


def test_audit_payload_redacts_sensitive_values():
    payload = {
        "entity_id": 1,
        "name": "Sensitive Child",
        "guardian_phone": "0771234567",
        "nested": {"weight_kg": 8.5, "status": "ACTIVE"},
    }

    redacted = sanitize_audit_payload(payload)

    assert redacted["entity_id"] == 1
    assert redacted["name"] == "[REDACTED]"
    assert redacted["guardian_phone"] == "[REDACTED]"
    assert redacted["nested"]["weight_kg"] == "[REDACTED]"
    assert redacted["nested"]["status"] == "ACTIVE"


def test_report_data_is_encrypted_at_rest_and_decrypted_for_authorized_use(monkeypatch, db, ministry_user):
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", Fernet.generate_key().decode())
    report = Report(
        report_type="national",
        title="Sensitive Nutrition Report",
        report_data={
            "children": [
                {
                    "child_id": "ENC-REPORT-001",
                    "name": "Report Child",
                    "weight_kg": 8.5,
                    "risk": "MAM",
                }
            ],
            "summary": {"moderate_cases": 1},
        },
        created_by_user_id=ministry_user.id,
    )
    db.session.add(report)
    db.session.flush()

    raw = db.session.execute(
        text("SELECT report_data FROM reports WHERE id = :id"),
        {"id": report.id},
    ).scalar_one()

    assert is_encrypted(raw)
    assert "Report Child" not in raw
    assert report.to_dict()["report_data"]["children"][0]["name"] == "Report Child"
