"""
Authentication API routes.

Provides a simple username/password login backed by an SQLite database.
Demo users are created automatically in backend/db.py on application startup.
"""

from flask import Blueprint, request, jsonify
import os
import sys

# Make backend package importable (similar to other route modules)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from werkzeug.security import check_password_hash  # type: ignore
from db import get_user_by_username  # type: ignore

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and return their profile data."""
    data = request.get_json() or {}

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return (
            jsonify({"status": "error", "message": "Missing username or password"}),
            400,
        )

    user = get_user_by_username(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    # Build response user object (no password hash)
    user_payload = {
        "id": user["id"],
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "clinic": user.get("clinic"),
        "district": user.get("district"),
    }

    return jsonify({"status": "success", "user": user_payload}), 200

