from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from backend.extensions import db
from backend.models import User

# Role constants
ROLE_ADMIN = "admin"
ROLE_MIDWIFE = "midwife"
ROLE_MOH_DOCTOR = "moh_doctor"
ROLE_NUTRITIONIST = "nutritionist"

# Roles that have child monitoring access
CHILD_MONITORING_ROLES = {ROLE_ADMIN, ROLE_MIDWIFE, ROLE_MOH_DOCTOR, ROLE_NUTRITIONIST}

# All valid roles
ALL_ROLES = {ROLE_ADMIN, ROLE_MIDWIFE, ROLE_MOH_DOCTOR, ROLE_NUTRITIONIST}


def has_child_monitoring_access(role: str) -> bool:
    """Check if a role has access to child monitoring features."""
    return role in CHILD_MONITORING_ROLES


def role_required(*allowed_roles: str):
    """Require a valid JWT and one of the allowed roles."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user_id = get_jwt_identity()
            user = db.session.get(User, user_id)
            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 401
            if allowed_roles and user.role not in allowed_roles:
                return jsonify({"status": "error", "message": "Forbidden"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    """Require admin role."""
    return role_required(ROLE_ADMIN)(fn)


def child_monitoring_required(fn):
    """Require any role with child monitoring access (admin, midwife, moh_doctor, nutritionist)."""
    return role_required(*CHILD_MONITORING_ROLES)(fn)

