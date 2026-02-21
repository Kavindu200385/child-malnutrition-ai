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
ROLE_HOSPITAL = "hospital"

# Roles that can register/manage children (hospital only)
CHILD_REGISTRATION_ROLES = {ROLE_ADMIN, ROLE_HOSPITAL}

# Roles that can assign children to clinics
# (Midwife, MOH Doctor, Nutritionist, plus Admin)
CHILD_ASSIGNMENT_ROLES = {
    ROLE_ADMIN,
    ROLE_MIDWIFE,
    ROLE_MOH_DOCTOR,
    ROLE_NUTRITIONIST,
}

# Roles that can create visits and monitor children (midwife, MOH doctor, nutritionist)
VISIT_MONITORING_ROLES = {
    ROLE_ADMIN,
    ROLE_MIDWIFE,
    ROLE_MOH_DOCTOR,
    ROLE_NUTRITIONIST,
}

# Legacy: all child monitoring roles (for backward compatibility)
CHILD_MONITORING_ROLES = {
    ROLE_ADMIN,
    ROLE_HOSPITAL,
    ROLE_MIDWIFE,
    ROLE_MOH_DOCTOR,
    ROLE_NUTRITIONIST,
}

# All valid roles
ALL_ROLES = {
    ROLE_ADMIN,
    ROLE_HOSPITAL,
    ROLE_MIDWIFE,
    ROLE_MOH_DOCTOR,
    ROLE_NUTRITIONIST,
}


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
            # Identity is stored as string in JWT; convert to int for DB lookup.
            try:
                user_id_int = int(user_id) if user_id is not None else None
            except Exception:
                user_id_int = None

            user = db.session.get(User, user_id_int) if user_id_int is not None else None
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
    """Require any role with child monitoring access (admin, hospital, midwife, moh_doctor, nutritionist)."""
    return role_required(*CHILD_MONITORING_ROLES)(fn)


def hospital_required(fn):
    """Require hospital or admin role (for child registration/management)."""
    return role_required(ROLE_ADMIN, ROLE_HOSPITAL)(fn)


def midwife_required(fn):
    """Require midwife or admin role (for child assignment)."""
    return role_required(ROLE_ADMIN, ROLE_MIDWIFE)(fn)


def assignment_required(fn):
    """Require role that can assign children to clinics (midwife, moh_doctor, nutritionist, admin)."""
    return role_required(*CHILD_ASSIGNMENT_ROLES)(fn)


def visit_required(fn):
    """Require role that can create visits (midwife, MOH doctor, nutritionist, admin)."""
    return role_required(*VISIT_MONITORING_ROLES)(fn)

