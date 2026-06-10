import secrets
from threading import Thread
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required

from backend.extensions import db, limiter
from backend.models import User
from backend.models_hierarchical import OTPPurpose, UserOTPCode
from backend.services.email_service import send_otp_email
from backend.utils.audit import log_audit
from backend.auth_utils_hierarchical import get_current_user

bp = Blueprint("auth_jwt", __name__, url_prefix="/api/auth")

OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
OTP_ADMIN_BYPASS_ROLES = {
    "superadmin",
    "super_admin",
    "system_developer",
    "system developer",
    "admin",
    "administrator",
    "health_ministry",
}


def _request_ip():
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.remote_addr


def _issue_login_response(user: User):
    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    log_audit(
        action_type="LOGIN",
        action_category="AUTHENTICATION",
        status="SUCCESS",
        user_id=user.id,
        username=user.username,
        role=user.role,
        description=f"User '{user.username}' logged in successfully.",
    )
    return jsonify({"status": "success", "access_token": token, "user": user.to_dict()}), 200


def _can_bypass_login_otp(user: User) -> bool:
    if getattr(user, "is_protected", False):
        return True
    superadmin_username = current_app.config.get("SUPERADMIN_USERNAME") or "superadmin"
    if (user.username or "").strip().lower() == str(superadmin_username).strip().lower():
        return True
    return (user.role or "").strip().lower() in OTP_ADMIN_BYPASS_ROLES


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _invalidate_active_otps(user_id: int, purpose: str) -> None:
    now = datetime.utcnow()
    db.session.query(UserOTPCode).filter(
        UserOTPCode.user_id == user_id,
        UserOTPCode.purpose == purpose,
        UserOTPCode.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)


def _send_login_otp_async(app, user_id: int, username: str, role: str, user_email: str, otp_code: str) -> None:
    with app.app_context():
        result = send_otp_email(user_email, otp_code, OTP_EXPIRY_MINUTES)
        if not result.ok:
            log_audit(
                action_type="OTP_EMAIL_FAILED",
                action_category="AUTHENTICATION",
                status="FAILED",
                user_id=user_id,
                username=username,
                role=role,
                description="Failed to send login OTP email.",
                metadata={"error": result.message},
            )


def _queue_login_otp_email(user: User, otp_code: str) -> None:
    app = current_app._get_current_object()
    Thread(
        target=_send_login_otp_async,
        args=(app, user.id, user.username, user.role, user.email, otp_code),
        daemon=True,
    ).start()


def _create_and_send_login_otp(user: User):
    if not current_app.config.get("EMAIL_ENABLED"):
        return jsonify({"status": "error", "message": "Email service is not configured."}), 503
    if not user.email:
        log_audit(
            action_type="OTP_EMAIL_MISSING",
            action_category="AUTHENTICATION",
            status="FAILED",
            user_id=user.id,
            username=user.username,
            role=user.role,
            description="Login blocked because user has no email address for OTP.",
        )
        return jsonify({"status": "error", "message": "Your account does not have an email address for OTP verification. Contact your administrator."}), 403

    otp_code = _generate_otp()
    _invalidate_active_otps(user.id, OTPPurpose.LOGIN_2FA.value)
    otp = UserOTPCode(
        user_id=user.id,
        purpose=OTPPurpose.LOGIN_2FA.value,
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        ip_address=_request_ip(),
        user_agent=request.headers.get("User-Agent"),
    )
    otp.set_otp(otp_code)
    db.session.add(otp)

    log_audit(
        action_type="OTP_GENERATED",
        action_category="AUTHENTICATION",
        status="SUCCESS",
        user_id=user.id,
        username=user.username,
        role=user.role,
        description="Login OTP generated and email delivery queued.",
        metadata={
            "purpose": OTPPurpose.LOGIN_2FA.value,
            "expires_in_minutes": OTP_EXPIRY_MINUTES,
            "email_delivery": "queued",
        },
    )
    db.session.commit()
    _queue_login_otp_email(user, otp_code)
    return jsonify({
        "status": "success",
        "requires_2fa": True,
        "message": "OTP is being sent to your registered email",
        "username": user.username,
    }), 200


@bp.route("/login", methods=["POST"])
@limiter.limit("5 per 15 minutes; 50 per hour")
def login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"status": "error", "message": "Missing username or password"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password) or not user.is_active:
        log_audit(
            action_type="LOGIN",
            action_category="AUTHENTICATION",
            status="FAILED",
            username=username,
            description=f"Failed login attempt for username: {username}",
        )
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    if current_app.config.get("EMAIL_2FA_ENABLED") and not _can_bypass_login_otp(user):
        return _create_and_send_login_otp(user)

    if current_app.config.get("EMAIL_2FA_ENABLED") and _can_bypass_login_otp(user):
        log_audit(
            action_type="OTP_BYPASSED",
            action_category="AUTHENTICATION",
            status="SUCCESS",
            user_id=user.id,
            username=user.username,
            role=user.role,
            description=f"Email OTP bypassed for privileged role '{user.role}'.",
        )

    return _issue_login_response(user)


@bp.route("/verify-otp", methods=["POST"])
@limiter.limit("10 per 15 minutes")
def verify_otp():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    otp_code = (data.get("otp") or "").strip()
    if not username or not otp_code:
        return jsonify({"status": "error", "message": "Invalid OTP or expired code"}), 400
    if not otp_code.isdigit() or len(otp_code) != 6:
        return jsonify({"status": "error", "message": "Invalid OTP or expired code"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.is_active:
        return jsonify({"status": "error", "message": "Invalid OTP or expired code"}), 400

    otp = db.session.query(UserOTPCode).filter(
        UserOTPCode.user_id == user.id,
        UserOTPCode.purpose == OTPPurpose.LOGIN_2FA.value,
        UserOTPCode.used_at.is_(None),
    ).order_by(UserOTPCode.created_at.desc()).first()

    if not otp or otp.is_expired() or otp.attempts >= OTP_MAX_ATTEMPTS:
        log_audit(
            action_type="OTP_VERIFY_FAILED",
            action_category="AUTHENTICATION",
            status="FAILED",
            user_id=user.id,
            username=user.username,
            role=user.role,
            description="OTP verification failed.",
            metadata={"reason": "missing_expired_or_locked"},
        )
        return jsonify({"status": "error", "message": "Invalid OTP or expired code"}), 400

    if not otp.check_otp(otp_code):
        otp.attempts += 1
        db.session.commit()
        log_audit(
            action_type="OTP_VERIFY_FAILED",
            action_category="AUTHENTICATION",
            status="FAILED",
            user_id=user.id,
            username=user.username,
            role=user.role,
            description="OTP verification failed.",
            metadata={"attempts": otp.attempts},
        )
        return jsonify({"status": "error", "message": "Invalid OTP or expired code"}), 400

    otp.used_at = datetime.utcnow()
    db.session.commit()
    log_audit(
        action_type="OTP_VERIFIED",
        action_category="AUTHENTICATION",
        status="SUCCESS",
        user_id=user.id,
        username=user.username,
        role=user.role,
        description="Login OTP verified successfully.",
    )
    return _issue_login_response(user)


@bp.route("/resend-otp", methods=["POST"])
@limiter.limit("3 per 10 minutes")
def resend_otp():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"status": "error", "message": "Unable to resend OTP"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.is_active:
        return jsonify({"status": "error", "message": "Unable to resend OTP"}), 400

    response = _create_and_send_login_otp(user)
    status_code = response[1] if isinstance(response, tuple) and len(response) > 1 else 200
    log_audit(
        action_type="OTP_RESEND_REQUESTED",
        action_category="AUTHENTICATION",
        status="SUCCESS" if status_code < 400 else "FAILED",
        user_id=user.id,
        username=user.username,
        role=user.role,
        description="Login OTP resend requested.",
    )
    return response


@bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Logs the logout action. In a real app, you'd also blocklist the token."""
    user = get_current_user()
    if user:
        log_audit(
            action_type="LOGOUT",
            action_category="AUTHENTICATION",
            status="SUCCESS",
            user_id=user.id,
            username=user.username,
            role=user.role,
            description=f"User '{user.username}' logged out successfully.",
        )
    return jsonify({"status": "success", "message": "Logout successful"}), 200


@bp.route("/seed-status", methods=["GET"])
def seed_status():
    """Quick helper to see if demo users exist."""
    count = User.query.count()
    return jsonify({"status": "success", "user_count": count}), 200
