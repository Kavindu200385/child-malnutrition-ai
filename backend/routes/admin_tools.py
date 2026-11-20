import os

from flask import Blueprint, jsonify

from backend.auth_utils_hierarchical import health_ministry_required
from backend.demo_children_seed import reset_demo_children_data

bp = Blueprint("admin_tools", __name__, url_prefix="/api/admin")


@bp.route("/reset-dummy-data", methods=["POST"])
@health_ministry_required
def reset_dummy_data():
    """
    Admin-only endpoint to wipe and recreate dummy child+visit data.
    Protected by env flag to avoid accidental use.
    """
    if os.environ.get("ALLOW_RESET_DUMMY_DATA", "false").lower() not in ("1", "true", "yes"):
        return jsonify({"status": "error", "message": "Reset is disabled"}), 403

    result = reset_demo_children_data()
    return jsonify({"status": "success", "result": result}), 200


