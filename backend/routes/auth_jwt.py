from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token

from backend.extensions import db, limiter
from backend.models import User

bp = Blueprint("auth_jwt", __name__, url_prefix="/api/auth")


@bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute; 50 per hour")
def login():
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"status": "error", "message": "Missing username or password"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    # JWT "sub" should be a string (avoids 422: Subject must be a string)
    token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
    return jsonify({"status": "success", "access_token": token, "user": user.to_dict()}), 200


@bp.route("/seed-status", methods=["GET"])
def seed_status():
    """Quick helper to see if demo users exist."""
    count = User.query.count()
    return jsonify({"status": "success", "user_count": count}), 200

