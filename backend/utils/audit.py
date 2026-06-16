"""
Centralized audit logging service.

Audit logs are append-only compliance records. Application modules should call
`audit_logger.log(...)` or the legacy `log_audit(...)` wrapper instead of
creating `AuditLog` rows directly.
"""
from flask import request
from sqlalchemy.orm import sessionmaker

from backend.extensions import db
from backend.models_hierarchical import AuditLog


SENSITIVE_KEYS = {
    "name",
    "child_name",
    "dob",
    "date_of_birth",
    "guardian_name",
    "mother_name",
    "guardian_phone",
    "guardian_email",
    "guardian_nic",
    "address",
    "birth_weight_kg",
    "birth_height_cm",
    "weight_kg",
    "height_cm",
    "muac_cm",
    "z_score_wfa",
    "z_score_hfa",
    "z_score_wfh",
    "z_wfa",
    "z_hfa",
    "z_wfh",
    "model_confidence",
    "notes",
    "reason",
    "review_notes",
    "rejection_reason",
    "referral_reason",
    "birth_registration",
    "report_data",
    "payload",
    "recipient",
}


def sanitize_audit_payload(value):
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            if str(key).lower() in SENSITIVE_KEYS:
                clean[key] = "[REDACTED]"
            else:
                clean[key] = sanitize_audit_payload(item)
        return clean
    if isinstance(value, list):
        return [sanitize_audit_payload(item) for item in value]
    return value


ENTITY_CATEGORIES = {
    "user": "USER_MANAGEMENT",
    "worker": "USER_MANAGEMENT",
    "child": "CHILD_MANAGEMENT",
    "measurement": "MEASUREMENTS",
    "visit": "MEASUREMENTS",
    "prediction": "AI_ML",
    "referral": "REFERRALS",
    "child_referral": "REFERRALS",
    "escalation": "REFERRALS",
    "child_escalation": "REFERRALS",
    "transfer": "REFERRALS",
    "child_transfer": "REFERRALS",
    "report": "REPORTS",
    "notification": "NOTIFICATIONS",
    "setting": "SYSTEM_ADMINISTRATION",
    "settings": "SYSTEM_ADMINISTRATION",
    "area": "SYSTEM_ADMINISTRATION",
    "hospital": "SYSTEM_ADMINISTRATION",
}

GENERIC_ACTION_TYPES = {
    ("user", "CREATE"): "USER_CREATED",
    ("user", "UPDATE"): "USER_UPDATED",
    ("user", "DELETE"): "USER_DELETED",
    ("worker", "CREATE"): "USER_CREATED",
    ("worker", "UPDATE"): "USER_UPDATED",
    ("worker", "DELETE"): "USER_DELETED",
    ("child", "CREATE"): "CHILD_REGISTERED",
    ("child", "UPDATE"): "CHILD_UPDATED",
    ("child", "DELETE"): "CHILD_DELETED",
    ("measurement", "CREATE"): "MEASUREMENT_ADDED",
    ("measurement", "UPDATE"): "MEASUREMENT_EDITED",
    ("measurement", "DELETE"): "MEASUREMENT_DELETED",
    ("visit", "CREATE"): "MEASUREMENT_ADDED",
    ("referral", "CREATE"): "REFERRAL_CREATED",
    ("referral", "APPROVE"): "REFERRAL_ACCEPTED",
    ("referral", "REJECT"): "REFERRAL_REJECTED",
    ("referral", "COMPLETE"): "REFERRAL_COMPLETED",
    ("transfer", "CREATE"): "REFERRAL_CREATED",
    ("child_transfer", "CREATE"): "REFERRAL_CREATED",
    ("child_transfer", "TRANSFER_REQUEST"): "REFERRAL_CREATED",
    ("transfer", "APPROVE"): "REFERRAL_ACCEPTED",
    ("transfer", "TRANSFER_APPROVE"): "REFERRAL_ACCEPTED",
    ("child_transfer", "TRANSFER_APPROVE"): "REFERRAL_ACCEPTED",
    ("child_transfer", "TRANSFER_ACCEPT"): "REFERRAL_ACCEPTED",
    ("transfer", "REJECT"): "REFERRAL_REJECTED",
    ("transfer", "TRANSFER_REJECT"): "REFERRAL_REJECTED",
    ("child_transfer", "TRANSFER_REJECT"): "REFERRAL_REJECTED",
    ("transfer", "COMPLETE"): "REFERRAL_COMPLETED",
    ("child_transfer", "COMPLETE"): "REFERRAL_COMPLETED",
    ("child_referral", "CREATE"): "REFERRAL_CREATED",
    ("child_referral", "UPDATE"): "REFERRAL_ACCEPTED",
    ("child_referral", "APPROVE"): "REFERRAL_ACCEPTED",
    ("child_referral", "REJECT"): "REFERRAL_REJECTED",
    ("child_escalation", "CREATE"): "REFERRAL_CREATED",
    ("child_escalation", "UPDATE"): "REFERRAL_ACCEPTED",
    ("child", "ASSIGN"): "CHILD_ASSIGNED",
    ("report", "CREATE"): "REPORT_GENERATED",
    ("report", "EXPORT"): "REPORT_EXPORTED",
    ("notification", "CREATE"): "NOTIFICATION_CREATED",
    ("notification", "READ"): "NOTIFICATION_MARKED_READ",
    ("notification", "DELETE"): "NOTIFICATION_DISMISSED",
    ("setting", "UPDATE"): "SETTINGS_UPDATED",
    ("settings", "UPDATE"): "SETTINGS_UPDATED",
    ("area", "UPDATE"): "SETTINGS_UPDATED",
}


def _infer_category(entity_type: str | None, current_category: str | None) -> str:
    if current_category and current_category.upper() != "SYSTEM":
        return current_category.upper()
    key = (entity_type or "").lower()
    return ENTITY_CATEGORIES.get(key, "SYSTEM")


def _infer_action_type(entity_type: str | None, action_type: str | None, action: str | None) -> str:
    raw_action = (action_type or action or "UNKNOWN").upper()
    key = ((entity_type or "").lower(), raw_action)
    return GENERIC_ACTION_TYPES.get(key, raw_action)


class AuditLogger:
    def log(
        self,
        action: str = None,
        entity_type: str = None,
        entity_id: int = None,
        old_values: dict = None,
        new_values: dict = None,
        user_id: int = None,
        description: str = None,
        action_type: str = None,
        action_category: str = "SYSTEM",
        username: str = None,
        role: str = None,
        status: str = "SUCCESS",
        metadata: dict = None,
    ):
        """
        Create an immutable audit log entry without interrupting the main action.
        """
        audit_session = None
        session = db.session
        use_current_session = bool(session.new or session.dirty or session.deleted)
        payload = None
        try:
            audit_session = session if use_current_session else sessionmaker(bind=db.engine)()
            ip_address = None
            user_agent = None
            try:
                ip_address = request.headers.get("X-Forwarded-For", request.remote_addr)
                if ip_address and "," in ip_address:
                    ip_address = ip_address.split(",", 1)[0].strip()
                user_agent = request.headers.get("User-Agent")
            except RuntimeError:
                pass

            actual_action_type = _infer_action_type(entity_type, action_type, action)
            actual_status = (status or "SUCCESS").upper()
            actual_category = _infer_category(entity_type, action_category)
            actual_metadata = sanitize_audit_payload(dict(metadata or {}))
            if old_values is not None:
                actual_metadata["old_values"] = sanitize_audit_payload(old_values)
            if new_values is not None:
                actual_metadata["new_values"] = sanitize_audit_payload(new_values)

            if user_id and (not username or not role):
                from backend.models_hierarchical import User

                user = audit_session.get(User, user_id)
                if user:
                    username = username or user.username
                    role = role or user.role

            payload = {
                "user_id": user_id,
                "username": username,
                "role": role,
                "action": actual_action_type,
                "action_type": actual_action_type,
                "action_category": actual_category,
                "description": description,
                "entity_type": entity_type or "system",
                "entity_id": entity_id,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "status": actual_status,
                "old_values": sanitize_audit_payload(old_values),
                "new_values": sanitize_audit_payload(new_values),
                "metadata_json": actual_metadata,
            }

            audit_log = AuditLog(**payload)

            audit_session.add(audit_log)
            if use_current_session:
                audit_session.flush()
            else:
                audit_session.commit()
            return audit_log
        except Exception as e:
            if audit_session and not use_current_session:
                audit_session.rollback()
                audit_session.close()
                if payload:
                    try:
                        fallback_log = AuditLog(**payload)
                        session.add(fallback_log)
                        session.flush()
                        return fallback_log
                    except Exception as fallback_exc:
                        session.rollback()
                        print(f"Audit logging fallback failed: {fallback_exc}")
            print(f"Audit logging failed: {e}")
            return None
        finally:
            if audit_session and not use_current_session:
                audit_session.close()


audit_logger = AuditLogger()


def log_audit(
    action: str = None,
    entity_type: str = None,
    entity_id: int = None,
    old_values: dict = None,
    new_values: dict = None,
    user_id: int = None,
    description: str = None,
    action_type: str = None,
    action_category: str = "SYSTEM",
    username: str = None,
    role: str = None,
    status: str = "SUCCESS",
    metadata: dict = None,
):
    return audit_logger.log(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        user_id=user_id,
        description=description,
        action_type=action_type,
        action_category=action_category,
        username=username,
        role=role,
        status=status,
        metadata=metadata,
    )
