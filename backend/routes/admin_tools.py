import os

from flask import Blueprint, jsonify

from backend.auth_utils import admin_required
from backend.demo_children_seed import reset_demo_children_data
from backend.maintenance import recompute_all_visits

bp = Blueprint("admin_tools", __name__, url_prefix="/api/admin")


@bp.route("/reset-dummy-data", methods=["POST"])
@admin_required
def reset_dummy_data():
    """
    Admin-only endpoint to wipe and recreate dummy child+visit data.
    Protected by env flag to avoid accidental use.
    """
    if os.environ.get("ALLOW_RESET_DUMMY_DATA", "false").lower() not in ("1", "true", "yes"):
        return jsonify({"status": "error", "message": "Reset is disabled"}), 403

    result = reset_demo_children_data()
    return jsonify({"status": "success", "result": result}), 200


@bp.route("/recompute-visits", methods=["POST"])
@admin_required
def recompute_visits():
    """
    Admin-only endpoint to recompute all visit-derived values:
    - z-scores
    - current risk
    - next-2-month predicted risk (if the prediction model is available)
    """
    if os.environ.get("ALLOW_RESET_DUMMY_DATA", "false").lower() not in ("1", "true", "yes"):
        return jsonify({"status": "error", "message": "Admin tools are disabled"}), 403

    result = recompute_all_visits()
    return jsonify({"status": "success", "result": result}), 200

