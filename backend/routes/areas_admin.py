from flask import Blueprint, jsonify, request

from backend.auth_utils import admin_required
from backend.extensions import db
from backend.models import Area

bp = Blueprint("areas_admin", __name__, url_prefix="/api/admin/areas")


@bp.route("", methods=["GET"])
@admin_required
def list_areas():
    """
    List all areas (optionally filtered by ?type=midwife|moh).
    """
    area_type = (request.args.get("type") or "").strip().lower()
    query = Area.query
    if area_type in ("midwife", "moh"):
        query = query.filter(Area.type == area_type)

    areas = query.order_by(Area.type.asc(), Area.name.asc()).all()
    return jsonify({"status": "success", "areas": [a.to_dict() for a in areas]}), 200


@bp.route("", methods=["POST"])
@admin_required
def create_area():
    """
    Create a new area (midwife or moh).

    Expected JSON:
    - name (str, required)
    - type ('midwife' | 'moh', required)
    - district (optional)
    """
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    area_type = (data.get("type") or "").strip().lower()

    if not name or area_type not in ("midwife", "moh"):
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "name and valid type ('midwife' or 'moh') are required",
                }
            ),
            400,
        )

    if Area.query.filter_by(name=name).first():
        return (
            jsonify({"status": "error", "message": "Area with this name already exists"}),
            409,
        )

    area = Area(name=name, type=area_type, district=data.get("district"))
    db.session.add(area)
    db.session.commit()

    return jsonify({"status": "success", "area": area.to_dict()}), 201


@bp.route("/<int:area_id>", methods=["PUT"])
@admin_required
def update_area(area_id: int):
    """
    Update an existing area.
    """
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404

    data = request.get_json() or {}
    if "name" in data:
        new_name = (data["name"] or "").strip()
        if new_name and new_name != area.name:
            if Area.query.filter(Area.name == new_name, Area.id != area.id).first():
                return (
                    jsonify(
                        {"status": "error", "message": "Another area with this name already exists"}
                    ),
                    409,
                )
            area.name = new_name

    if "type" in data:
        new_type = (data["type"] or "").strip().lower()
        if new_type in ("midwife", "moh"):
            area.type = new_type

    if "district" in data:
        area.district = data.get("district")

    db.session.commit()
    return jsonify({"status": "success", "area": area.to_dict()}), 200


@bp.route("/<int:area_id>", methods=["DELETE"])
@admin_required
def delete_area(area_id: int):
    """
    Delete an area.
    """
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404

    db.session.delete(area)
    db.session.commit()
    return jsonify({"status": "success"}), 200

