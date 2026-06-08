from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from backend.auth_utils_hierarchical import get_current_user
from backend.extensions import db
from backend.models_hierarchical import Notification

bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


def _current_user_or_401():
    user = get_current_user()
    if not user:
        return None, jsonify({"status": "error", "message": "User not found"}), 401
    return user, None, None


@bp.route("", methods=["GET"])
@jwt_required()
def list_notifications():
    user, err, status = _current_user_or_401()
    if err:
        return err, status

    unread_only = str(request.args.get("unread", "")).lower() in ("1", "true", "yes")
    limit = min(max(int(request.args.get("limit", 30)), 1), 100)

    query = Notification.query.filter(Notification.user_id == user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)

    notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
    return jsonify({
        "status": "success",
        "notifications": [n.to_dict() for n in notifications],
        "count": len(notifications),
    }), 200


@bp.route("/unread-count", methods=["GET"])
@jwt_required()
def unread_count():
    user, err, status = _current_user_or_401()
    if err:
        return err, status

    count = Notification.query.filter(
        Notification.user_id == user.id,
        Notification.is_read == False,
    ).count()
    return jsonify({"status": "success", "unread_count": int(count)}), 200


@bp.route("/<int:notification_id>/read", methods=["POST"])
@jwt_required()
def mark_read(notification_id: int):
    user, err, status = _current_user_or_401()
    if err:
        return err, status

    notification = db.session.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        return jsonify({"status": "error", "message": "Notification not found"}), 404

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.session.commit()

    return jsonify({"status": "success", "notification": notification.to_dict()}), 200


@bp.route("/mark-all-read", methods=["POST"])
@jwt_required()
def mark_all_read():
    user, err, status = _current_user_or_401()
    if err:
        return err, status

    now = datetime.utcnow()
    updated = Notification.query.filter(
        Notification.user_id == user.id,
        Notification.is_read == False,
    ).update({"is_read": True, "read_at": now}, synchronize_session=False)
    db.session.commit()
    return jsonify({"status": "success", "updated": int(updated)}), 200


@bp.route("/<int:notification_id>", methods=["DELETE"])
@jwt_required()
def delete_notification(notification_id: int):
    user, err, status = _current_user_or_401()
    if err:
        return err, status

    notification = db.session.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        return jsonify({"status": "error", "message": "Notification not found"}), 404

    db.session.delete(notification)
    db.session.commit()
    return jsonify({"status": "success", "message": "Notification deleted"}), 200

