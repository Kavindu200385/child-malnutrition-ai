from datetime import date

from cryptography.fernet import Fernet
from sqlalchemy import text

from backend.extensions import db as _db
from backend.models_hierarchical import AuditLog, Child, Report, RiskLevel, UserRole
from backend.services.encryption_service import decrypt_value, encrypt_value, is_encrypted
from backend.utils.audit import build_clinical_decision_metadata, log_clinical_decision, sanitize_audit_payload


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
        "address": "Secret Lane",
        "request_body": {"child_name": "Sensitive Child", "height_cm": 80},
        "nested": {"weight_kg": 8.5, "status": "ACTIVE"},
    }

    redacted = sanitize_audit_payload(payload)

    assert redacted["entity_id"] == 1
    assert redacted["name"] == "[REDACTED]"
    assert redacted["guardian_phone"] == "[REDACTED]"
    assert redacted["address"] == "[REDACTED]"
    assert redacted["request_body"] == "[REDACTED]"
    assert redacted["nested"]["weight_kg"] == "[REDACTED]"
    assert redacted["nested"]["status"] == "ACTIVE"


def test_clinical_decision_metadata_only_keeps_safe_fields():
    metadata = build_clinical_decision_metadata(
        child_id=7,
        measurement_id=12,
        user_id=3,
        role="midwife",
        area_id=9,
        action="CLINICAL_DECISION_CALCULATED",
        current_nutritional_status="MAM",
        future_predicted_risk="HIGH RISK",
        clinical_action_required=True,
        clinical_review_reason="Low model confidence.",
        model_version="future-risk-v1",
        prediction_timestamp="2026-06-17T10:00:00",
        created_at="2026-06-17T10:00:01",
        child_name="Should Not Persist",
        guardian_phone="0771234567",
        address="Secret Lane",
    )

    assert set(metadata.keys()) == {
        "child_id",
        "measurement_id",
        "user_id",
        "role",
        "area_id",
        "action",
        "current_nutritional_status",
        "future_predicted_risk",
        "clinical_action_required",
        "clinical_review_reason",
        "model_version",
        "prediction_timestamp",
        "created_at",
    }
    assert "child_name" not in metadata
    assert "guardian_phone" not in metadata
    assert "address" not in metadata


def test_clinical_decision_audit_log_excludes_sensitive_fields(db, midwife_user):
    log = log_clinical_decision(
        child_id=11,
        measurement_id=22,
        user_id=midwife_user.id,
        role=midwife_user.role,
        area_id=5,
        current_nutritional_status="NORMAL",
        future_predicted_risk="LOW RISK",
        clinical_action_required=False,
        clinical_review_reason="Routine monitoring recommended.",
        model_version="future-risk-v1",
        prediction_timestamp="2026-06-17T10:00:00",
        created_at="2026-06-17T10:00:01",
    )

    assert log is not None
    stored = AuditLog.query.get(log.id)
    assert stored.action_type == "CLINICAL_DECISION_CALCULATED"
    assert stored.metadata_json["child_id"] == 11
    assert stored.metadata_json["measurement_id"] == 22
    assert stored.metadata_json["current_nutritional_status"] == "NORMAL"
    assert stored.metadata_json["future_predicted_risk"] == "LOW RISK"
    assert "child_name" not in stored.metadata_json
    assert "guardian_phone" not in stored.metadata_json
    assert "address" not in stored.metadata_json


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
