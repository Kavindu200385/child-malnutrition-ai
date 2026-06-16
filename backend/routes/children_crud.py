from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils import (
    role_required,
    admin_required,
    hospital_required,
    midwife_required,
    visit_required,
    assignment_required,
)
from backend.extensions import db
from backend.models import Child, Visit

bp = Blueprint("children_crud", __name__, url_prefix="/api/children")


def _current_user():
    from backend.models import User

    user_id = get_jwt_identity()
    try:
        user_id_int = int(user_id) if user_id else None
    except Exception:
        user_id_int = None
    return db.session.get(User, user_id_int) if user_id_int else None


def _legacy_user_can_access_child(user, child: Child) -> bool:
    if not user:
        return False
    if user.role == "admin":
        return True
    if user.role == "hospital":
        return bool(user.clinic and child.registered_by_clinic == user.clinic)
    if user.role in ("midwife", "moh_doctor", "nutritionist"):
        return bool(user.clinic and (child.assigned_to_clinic == user.clinic or child.assigned_to_clinic is None))
    return False


@bp.route("", methods=["POST"])
@hospital_required
def create_child():
    """
    Register a new child (Hospital only).
    Hospital registers children at birth, then midwife can assign them to their clinic.
    """
    data = request.get_json() or {}

    # Draft flag (optional) - if true, registration is saved as a draft
    raw_is_draft = data.get("is_draft", False)
    is_draft = bool(raw_is_draft)
    child_id = data.get("child_id")
    if not child_id:
        return jsonify({"status": "error", "message": "child_id is required"}), 400

    if Child.query.filter_by(child_id=child_id).first():
        return jsonify({"status": "error", "message": "child_id already exists"}), 409

    # Get current user to set registered_by_clinic
    user = _current_user()

    child = Child(
        child_id=child_id,
        name=data.get("name"),
        gender=data.get("gender"),
        guardian_name=data.get("guardian_name"),
        guardian_phone=data.get("guardian_phone"),
        address=data.get("address"),
        is_draft=is_draft,
        registered_by_clinic=user.clinic if user else None,  # Track which hospital registered
        birth_registration=data.get("birth_registration"),  # Store birth registration data (JSON)
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
@role_required("admin", "hospital", "midwife", "moh_doctor", "nutritionist")
def list_children():
    """
    List children based on role:
    - Admin: sees all children
    - Hospital: sees children they registered (registered_by_clinic matches)
    - Midwife: sees unassigned children from hospitals + children assigned to their clinic
    - MOH Doctor/Nutritionist: sees children assigned to their clinic
    """
    user = _current_user()

    q = request.args.get("q", "").strip()
    status = request.args.get("status", "").strip().lower()

    # Admin sees all children
    if user and user.role == "admin":
        query = Child.query
    # Hospital sees children they registered
    elif user and user.role == "hospital" and user.clinic:
        query = Child.query.filter(Child.registered_by_clinic == user.clinic)
    # Midwife/MOH Doctor/Nutritionist see: unassigned children (from any hospital) + children assigned to their clinic
    elif user and user.role in ("midwife", "moh_doctor", "nutritionist") and user.clinic:
        query = Child.query.filter(
            (Child.assigned_to_clinic == user.clinic) | (Child.assigned_to_clinic.is_(None))
        )
    else:
        query = Child.query.filter(False)

    # Optional status filter: ?status=draft | active
    if status == "draft":
        query = query.filter(Child.is_draft.is_(True))
    elif status in ("active", "final"):
        query = query.filter(Child.is_draft.is_(False))

    if q:
        query = query.filter(
            Child.child_id.like(f"%{q}%") |
            Child.child_unique_id.like(f"%{q}%")
        )
    children = query.order_by(Child.created_at.desc()).limit(200).all()
    return jsonify({"status": "success", "children": [c.to_dict() for c in children]}), 200


@bp.route("/<child_id>", methods=["GET"])
@role_required("admin", "hospital", "midwife", "moh_doctor", "nutritionist")
def get_child(child_id: str):
    """
    Get child details (all roles can view, but visits only shown to visit_required roles).
    """
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Only show visits to roles that can create visits (not hospital)
    user = _current_user()
    if not _legacy_user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    
    include_visits = user and user.role in ("admin", "midwife", "moh_doctor", "nutritionist")
    
    return jsonify({"status": "success", "child": child.to_dict(include_visits=include_visits)}), 200


@bp.route("/<child_id>", methods=["PUT"])
@hospital_required
def update_child(child_id: str):
    """
    Update child information (Hospital only - for managing registered children).
    """
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    user = _current_user()
    if not _legacy_user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    data = request.get_json() or {}

    for field in ["name", "gender", "guardian_name", "guardian_phone", "address"]:
        if field in data:
            setattr(child, field, data[field])

    # Allow hospital to toggle draft status and update birth_registration blob
    if "is_draft" in data:
        child.is_draft = bool(data["is_draft"])

    if "birth_registration" in data:
        child.birth_registration = data["birth_registration"]

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


@bp.route("/<child_id>/assign", methods=["POST"])
@assignment_required
def assign_child_to_clinic(child_id: str):
    """
    Assign a child to the current user's clinic for monitoring.
    Allowed roles: Midwife, MOH Doctor, Nutritionist, Admin.
    They can assign unassigned children (from hospitals) to their clinic.
    """
    from backend.models import User
    
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Get current user (midwife)
    user_id = get_jwt_identity()
    try:
        user_id_int = int(user_id) if user_id else None
    except Exception:
        user_id_int = None
    user = db.session.get(User, user_id_int) if user_id_int else None
    
    if not user or not user.clinic:
        return jsonify({"status": "error", "message": "User clinic not found"}), 400
    
    # Only allow assigning if child is not already assigned, or if admin
    if child.assigned_to_clinic and user.role != "admin":
        return jsonify({
            "status": "error",
            "message": f"Child is already assigned to {child.assigned_to_clinic}"
        }), 400
    
    child.assigned_to_clinic = user.clinic
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": f"Child assigned to {user.clinic}",
        "child": child.to_dict()
    }), 200


@bp.route("/<child_id>/assign-areas", methods=["POST"])
@assignment_required
def assign_child_areas(child_id: str):
    """
    Assign / update Midwife and MOH areas for a child.

    Allowed roles: Midwife, MOH Doctor, Nutritionist, Admin.
    Expected JSON (all optional, but at least one should be provided):
    - midwife_area: str
    - moh_area: str
    """
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    data = request.get_json() or {}
    midwife_area = (data.get("midwife_area") or "").strip()
    moh_area = (data.get("moh_area") or "").strip()

    if not midwife_area and not moh_area:
        return jsonify({
            "status": "error",
            "message": "Provide at least one of midwife_area or moh_area"
        }), 400

    if midwife_area:
        child.midwife_area = midwife_area
    if moh_area:
        child.moh_area = moh_area

    db.session.commit()

    return jsonify({
        "status": "success",
        "child": child.to_dict()
    }), 200


@bp.route("/<child_id>/visits", methods=["GET"])
@visit_required
def list_visits(child_id: str):
    """
    List visits for a child (Midwife, MOH Doctor, Nutritionist only - not Hospital).
    """
    child = Child.query.filter_by(child_id=child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    visits = Visit.query.filter_by(child_id_fk=child.id).order_by(Visit.visit_date.desc()).all()
    return jsonify({"status": "success", "visits": [v.to_dict() for v in visits]}), 200
