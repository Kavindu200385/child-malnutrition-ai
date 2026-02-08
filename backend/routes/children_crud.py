from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils import role_required, admin_required, child_monitoring_required
from backend.extensions import db
from backend.models import Child, Visit

bp = Blueprint("children_crud", __name__, url_prefix="/api/children")


@bp.route("", methods=["POST"])
@child_monitoring_required
def create_child():
    data = request.get_json() or {}
    child_id = data.get("child_id")
    if not child_id:
        return jsonify({"status": "error", "message": "child_id is required"}), 400

    if Child.query.filter_by(child_id=child_id).first():
        return jsonify({"status": "error", "message": "child_id already exists"}), 409

    child = Child(
        child_id=child_id,
        name=data.get("name"),
        gender=data.get("gender"),
        guardian_name=data.get("guardian_name"),
        guardian_phone=data.get("guardian_phone"),
        address=data.get("address"),
    )

    # Optional DOB
    dob = data.get("dob")
    if dob:
        try:
            child.dob = datetime.fromisoformat(dob).date()
        except ValueError:
            return jsonify({"status": "error", "message": "dob must be ISO date (YYYY-MM-DD)"}), 400

    db.session.add(child)
    db.session.commit()
    return jsonify({"status": "success", "child": child.to_dict()}), 201


@bp.route("", methods=["GET"])
@child_monitoring_required
def list_children():
    from backend.models import User
    
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id) if user_id else None
    
    q = request.args.get("q", "").strip()
    
    # Admin sees all children, other users see children from their clinic
    if user and user.role == "admin":
        query = Child.query
    elif user and user.clinic:
        # Filter children by clinic prefix (all users in same clinic see same children)
        clinic_prefix_map = {
            "Colombo PHM Clinic": "COL",
            "Gampaha MOH Office": "GAM",
            "Kandy Health Center": "KAN",
        }
        prefix = clinic_prefix_map.get(user.clinic)
        if prefix:
            query = Child.query.filter(Child.child_id.like(f"{prefix}%"))
        else:
            # If clinic has no prefix mapping, return no children for non-admins
            return jsonify({"status": "success", "children": []}), 200
    else:
        query = Child.query
    
    if q:
        query = query.filter(
            Child.child_id.like(f"%{q}%") |
            Child.name.like(f"%{q}%") |
            Child.guardian_name.like(f"%{q}%")
        )
    children = query.order_by(Child.created_at.desc()).limit(200).all()
    return jsonify({"status": "success", "children": [c.to_dict() for c in children]}), 200


@bp.route("/<child_id>", methods=["GET"])
@child_monitoring_required
def get_child(child_id: str):
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    return jsonify({"status": "success", "child": child.to_dict(include_visits=True)}), 200


@bp.route("/<child_id>", methods=["PUT"])
@child_monitoring_required
def update_child(child_id: str):
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    data = request.get_json() or {}

    for field in ["name", "gender", "guardian_name", "guardian_phone", "address"]:
        if field in data:
            setattr(child, field, data[field])

    if "dob" in data:
        if data["dob"] is None or data["dob"] == "":
            child.dob = None
        else:
            try:
                child.dob = datetime.fromisoformat(data["dob"]).date()
            except ValueError:
                return jsonify({"status": "error", "message": "dob must be ISO date (YYYY-MM-DD)"}), 400

    db.session.commit()
    return jsonify({"status": "success", "child": child.to_dict()}), 200


@bp.route("/<child_id>", methods=["DELETE"])
@admin_required
def delete_child(child_id: str):
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    db.session.delete(child)
    db.session.commit()
    return jsonify({"status": "success"}), 200


@bp.route("/<child_id>/visits", methods=["GET"])
@child_monitoring_required
def list_visits(child_id: str):
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    visits = Visit.query.filter_by(child_id_fk=child.id).order_by(Visit.visit_date.desc()).all()
    return jsonify({"status": "success", "visits": [v.to_dict() for v in visits]}), 200

