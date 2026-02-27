"""
Children CRUD Routes - Hierarchical System
Updated with area-based access control and hierarchical filtering
"""
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import (
    get_current_user,
    user_can_access_child,
    get_user_accessible_areas,
    get_moh_area_ids,
    get_rdhs_district_area_ids,
    child_was_escalated_to_moh,
    hospital_required,
    measurement_required,
    child_access_required,
    role_required,
    ROLE_HEALTH_MINISTRY,
    ROLE_HOSPITAL,
    ROLE_MIDWIFE,
    ROLE_MOH,
    ROLE_AMOH,
    ROLE_NUTRITIONIST,
    ROLE_PDHS,
    ROLE_RDHS,
)
from backend.extensions import db
from backend.models_hierarchical import Child, Visit, Area, RiskLevel
from backend.utils.audit import log_audit
from backend.utils.midwife_helpers import get_area_hierarchy
from backend.utils.hospital_helpers import calculate_birth_risk_level

bp = Blueprint("children_crud_hierarchical", __name__, url_prefix="/api/children")


@bp.route("", methods=["POST"])
@role_required(ROLE_HOSPITAL, ROLE_MIDWIFE, ROLE_HEALTH_MINISTRY)
def create_child():
    """
    Register a new child. Hospital (Pediatric Unit) or Midwife can register.
    Hospital: registers at birth with registration number.
    Midwife: 4-step birth registration; child is auto-assigned to midwife's PHM area.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    is_draft = bool(data.get("is_draft", False))
    child_id = data.get("child_id")
    if not child_id:
        return jsonify({"status": "error", "message": "child_id (registration number) is required"}), 400

    # Check if child_id already exists
    existing = db.session.query(Child).filter(Child.child_id == child_id).first()
    if existing:
        return jsonify({"status": "error", "message": "child_id already exists"}), 409

    child = Child(
        child_id=child_id,
        name=data.get("name"),
        gender=data.get("gender"),
        guardian_name=data.get("guardian_name"),
        guardian_phone=data.get("guardian_phone"),
        guardian_nic=data.get("guardian_nic"),
        address=data.get("address"),
        is_draft=is_draft,
        registered_by_user_id=user.id if user else None,
        registered_by_clinic=user.clinic if user else None,  # Legacy field
        current_risk_level=RiskLevel.NORMAL,
        status="ACTIVE" if not is_draft else "DRAFT",
        birth_registration=data.get("birth_registration"),
    )

    # Optional DOB
    dob = data.get("dob")
    if dob:
        try:
            child.dob = datetime.fromisoformat(dob).date()
        except ValueError:
            return jsonify({"status": "error", "message": "dob must be ISO date (YYYY-MM-DD)"}), 400

    # Optional birth measurements (BirthRegistrationView wizard or direct payload)
    birth_reg = data.get("birth_registration") or {}

    # Allow both direct fields and nested birth_registration fields
    birth_weight_raw = data.get("birth_weight_kg")
    birth_height_raw = data.get("birth_height_cm")
    birth_muac_raw = data.get("birth_muac_cm")

    if not birth_weight_raw and isinstance(birth_reg, dict):
        birth_weight_raw = birth_reg.get("birthWeight")
    if not birth_height_raw and isinstance(birth_reg, dict):
        birth_height_raw = birth_reg.get("birthLength")
    if not birth_muac_raw and isinstance(birth_reg, dict):
        birth_muac_raw = birth_reg.get("birthMuac") or birth_reg.get("muac")

    def _to_float(value):
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    birth_weight = _to_float(birth_weight_raw)
    birth_height = _to_float(birth_height_raw)
    birth_muac = _to_float(birth_muac_raw)

    if birth_weight is not None:
        child.birth_weight_kg = Decimal(str(birth_weight))
    if birth_height is not None:
        child.birth_height_cm = Decimal(str(birth_height))
    if birth_muac is not None:
        child.birth_muac_cm = Decimal(str(birth_muac))

    # If DOB and birth measurements are available, derive an initial birth_risk_level
    if child.dob and birth_weight is not None:
        age_days = (datetime.utcnow().date() - child.dob).days
        birth_risk_level, _reason = calculate_birth_risk_level(
            birth_weight_kg=birth_weight,
            birth_height_cm=birth_height,
            birth_muac_cm=birth_muac,
            age_days=age_days,
        )
        child.birth_risk_level = birth_risk_level
        # Keep child's current_risk_level in sync if it is still at the default NORMAL
        if not child.current_risk_level or str(child.current_risk_level) == str(RiskLevel.NORMAL.value):
            child.current_risk_level = birth_risk_level

    db.session.add(child)
    db.session.flush()

    # When Pediatric Unit (hospital) registers, link child to their hospital
    if user.role == ROLE_HOSPITAL and getattr(user, "hospital_id", None):
        child.hospital_id = user.hospital_id

    # When midwife registers, assign child to their PHM area so it appears in their list
    if user.role == ROLE_MIDWIFE:
        accessible_areas = get_user_accessible_areas(user)
        phm_area = next((a for a in accessible_areas if a.level == "phm"), None)
        if phm_area:
            try:
                hierarchy = get_area_hierarchy(phm_area.id)
                child.phm_area_id = hierarchy["phm_area_id"]
                child.moh_area_id = hierarchy.get("moh_id")
                child.district_id = hierarchy.get("district_id")
                child.province_id = hierarchy.get("province_id")
                child.current_assigned_area_id = phm_area.id
                child.current_assigned_user_id = user.id
                child.current_assigned_role = ROLE_MIDWIFE
                child.assigned_date = datetime.utcnow()
                child.status = "ACTIVE"
                child.is_draft = False
            except ValueError:
                pass  # If hierarchy fails, child stays unassigned; midwife can assign later
    
    log_audit(
        action="CREATE",
        entity_type="child",
        entity_id=child.id,
        new_values=child.to_dict(),
        user_id=user.id if user else None,
        description=f"Registered child {child_id}",
    )
    
    db.session.commit()
    return jsonify({"status": "success", "child": child.to_dict()}), 201


@bp.route("", methods=["GET"])
def list_children():
    """
    List children based on role and area hierarchy:
    - Health Ministry: all children
    - PDHS: children in their province
    - RDHS: children in their district
    - Hospital: children they registered
    - Midwife/MOH/Nutritionist: children in their assigned areas + unassigned (for Midwife)
    """
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    q = request.args.get("q", "").strip()
    status_filter = request.args.get("status", "").strip().lower()  # draft, active, transferred
    risk_filter = request.args.get("risk", "").strip().upper()  # NORMAL, MODERATE, HIGH, CRITICAL
    area_id = request.args.get("area_id", type=int)
    
    # Build query based on role
    query = db.session.query(Child)
    
    if user.role == ROLE_HEALTH_MINISTRY:
        # Health Ministry (admin/superadmin): all island children – no area filter
        pass
    elif user.role in [ROLE_PDHS, ROLE_RDHS]:
        # PDHS/RDHS see children in their areas
        accessible_areas = get_user_accessible_areas(user)
        accessible_area_ids = [a.id for a in accessible_areas]
        if user.role == ROLE_RDHS:
            from sqlalchemy import or_
            rdhs_ids = get_rdhs_district_area_ids(user)
            conditions = []
            if accessible_area_ids:
                conditions.append(Child.current_assigned_area_id.in_(accessible_area_ids))
            if rdhs_ids:
                conditions.append(Child.district_id.in_(rdhs_ids))
            if not conditions:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            query = query.filter(or_(*conditions))
        else:
            if not accessible_area_ids:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            query = query.filter(Child.current_assigned_area_id.in_(accessible_area_ids))
    elif user.role == ROLE_HOSPITAL:
        # Hospital sees children they registered
        query = query.filter(Child.registered_by_user_id == user.id)
    elif user.role == ROLE_NUTRITIONIST:
        # Nutritionist: only children referred to their hospital (strict specialist isolation)
        from backend.models_hierarchical import ChildReferral
        if not user.hospital_id:
            return jsonify({"status": "success", "children": [], "count": 0}), 200
        ref_child_ids = db.session.query(ChildReferral.child_id).filter(
            ChildReferral.hospital_id == user.hospital_id,
            ChildReferral.referred_to_role == "nutritionist",
        ).distinct().all()
        ref_child_ids = [r[0] for r in ref_child_ids]
        if not ref_child_ids:
            return jsonify({"status": "success", "children": [], "count": 0}), 200
        query = query.filter(Child.id.in_(ref_child_ids))
    elif user.role in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH]:
        # Field workers see children in their assigned areas
        if user.role in [ROLE_MOH, ROLE_AMOH]:
            # MOH: strict area isolation - only children in their MOH area(s)
            from backend.auth_utils_hierarchical import get_moh_area_ids
            moh_area_ids = get_moh_area_ids(user)
            if not moh_area_ids:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            query = query.filter(Child.moh_area_id.in_(moh_area_ids))
        else:
            accessible_areas = get_user_accessible_areas(user)
            accessible_area_ids = [a.id for a in accessible_areas]
            if user.role == ROLE_MIDWIFE:
                # Midwife also sees unassigned children (to assign them)
                if accessible_area_ids:
                    query = query.filter(
                        (Child.current_assigned_area_id.in_(accessible_area_ids)) |
                        (Child.current_assigned_area_id.is_(None))
                    )
                else:
                    query = query.filter(Child.current_assigned_area_id.is_(None))
            else:
                if not accessible_area_ids:
                    return jsonify({"status": "success", "children": [], "count": 0}), 200
                query = query.filter(Child.current_assigned_area_id.in_(accessible_area_ids))
    else:
        return jsonify({"status": "error", "message": "Invalid role"}), 403
    
    # Filter by area_id if specified
    if area_id:
        query = query.filter(Child.current_assigned_area_id == area_id)
    
    # Filter by status
    if status_filter == "draft":
        query = query.filter(Child.is_draft == True)
    elif status_filter in ["active", "final"]:
        query = query.filter(Child.is_draft == False, Child.status == "ACTIVE")
    elif status_filter == "transferred":
        query = query.filter(Child.status == "TRANSFERRED")
    
    # Filter by risk level (NORMAL, MAM, SAM, MODERATE, HIGH, CRITICAL)
    if risk_filter and risk_filter in ["NORMAL", "MODERATE", "HIGH", "CRITICAL", "MAM", "SAM"]:
        query = query.filter(Child.current_risk_level == risk_filter)
    
    # Search filter
    if q:
        query = query.filter(
            (Child.child_id.like(f"%{q}%")) |
            (Child.name.like(f"%{q}%")) |
            (Child.guardian_name.like(f"%{q}%")) |
            (Child.guardian_phone.like(f"%{q}%"))
        )
    
    children = query.order_by(Child.created_at.desc()).limit(200).all()
    
    # Filter by access control (double-check)
    accessible_children = []
    for child in children:
        if user_can_access_child(user, child):
            accessible_children.append(child)

    # Build response; for MOH/AMOH add can_moh_add_measurement (only for children sent by midwife)
    moh_area_ids = get_moh_area_ids(user) if user.role in (ROLE_MOH, ROLE_AMOH) else []
    def child_dict(c):
        d = c.to_dict()
        if moh_area_ids:
            d["can_moh_add_measurement"] = child_was_escalated_to_moh(c, moh_area_ids)
        return d

    return jsonify({
        "status": "success",
        "children": [child_dict(c) for c in accessible_children],
        "count": len(accessible_children),
    }), 200


@bp.route("/<child_id>", methods=["GET"])
@child_access_required
def get_child(child_id: str):
    """
    Get child details with area-based access control.
    Accepts either child_id (string, e.g. registration number) or numeric primary key id.
    """
    user = get_current_user()
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child and child_id.isdigit():
        child = db.session.get(Child, int(child_id))
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Check access
    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    
    # Include visits/transfers for measurement roles and RDHS (read-only)
    include_visits = user.role in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS]
    include_transfers = user.role in [ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS]
    
    child_data = child.to_dict(include_visits=include_visits, include_transfers=include_transfers)
    if user.role in (ROLE_MOH, ROLE_AMOH):
        moh_area_ids = get_moh_area_ids(user)
        child_data["can_moh_add_measurement"] = child_was_escalated_to_moh(child, moh_area_ids)
    
    return jsonify({
        "status": "success",
        "child": child_data
    }), 200


@bp.route("/<child_id>", methods=["PUT"])
@role_required(ROLE_HOSPITAL, ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_HEALTH_MINISTRY)
@child_access_required
def update_child(child_id: str):
    """
    Update child information. Pediatric Unit, Midwife, MOH/AMOH, and Health Ministry
    can edit children they have access to.
    """
    user = get_current_user()
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child and child_id.isdigit():
        child = db.session.get(Child, int(child_id))
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403

    # Pediatric Unit can only edit within 1 day of registration
    if user.role == ROLE_HOSPITAL:
        if not child.registration_date:
            return jsonify({"status": "error", "message": "Cannot edit: registration date missing"}), 403
        now = datetime.utcnow()
        diff = now - child.registration_date
        if diff.total_seconds() > 24 * 60 * 60:
            return jsonify({"status": "error", "message": "Pediatric Unit can edit child details only within 1 day of registration"}), 403

    data = request.get_json() or {}
    old_values = child.to_dict()

    # Update basic fields
    for field in ["name", "gender", "guardian_name", "mother_name", "guardian_phone", "guardian_nic", "address"]:
        if field in data:
            setattr(child, field, data[field])

    if "is_draft" in data:
        child.is_draft = bool(data["is_draft"])
        child.status = "DRAFT" if child.is_draft else "ACTIVE"

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

    # Optional birth measurements
    birth_fields_updated = False
    if "birth_weight_kg" in data:
        v = data["birth_weight_kg"]
        child.birth_weight_kg = Decimal(str(v)) if v is not None and v != "" else None
        birth_fields_updated = True
    if "birth_height_cm" in data:
        v = data["birth_height_cm"]
        child.birth_height_cm = Decimal(str(v)) if v is not None and v != "" else None
        birth_fields_updated = True
    if "birth_muac_cm" in data:
        v = data["birth_muac_cm"]
        child.birth_muac_cm = Decimal(str(v)) if v is not None and v != "" else None
        birth_fields_updated = True
    if "birth_risk_level" in data:
        # Explicit override from client, used as-is
        child.birth_risk_level = data["birth_risk_level"] if data["birth_risk_level"] else None
    elif birth_fields_updated and child.dob:
        # Automatically recalculate birth_risk_level when birth measurements change
        bw = float(child.birth_weight_kg) if child.birth_weight_kg is not None else None
        bh = float(child.birth_height_cm) if child.birth_height_cm is not None else None
        bm = float(child.birth_muac_cm) if child.birth_muac_cm is not None else None
        if bw is not None:
            age_days = (datetime.utcnow().date() - child.dob).days
            new_birth_risk, _reason = calculate_birth_risk_level(
                birth_weight_kg=bw,
                birth_height_cm=bh,
                birth_muac_cm=bm,
                age_days=age_days,
            )
            child.birth_risk_level = new_birth_risk

    db.session.flush()

    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        old_values=old_values,
        new_values=child.to_dict(),
        user_id=user.id,
        description=f"Updated child {child_id}",
    )

    db.session.commit()
    return jsonify({"status": "success", "child": child.to_dict()}), 200


@bp.route("/<child_id>", methods=["DELETE"])
@role_required(ROLE_HOSPITAL, ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_HEALTH_MINISTRY)
@child_access_required
def delete_child(child_id: str):
    """Delete child. Pediatric Unit, Midwife, MOH/AMOH, and Health Ministry can delete children they have access to."""
    user = get_current_user()
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child and child_id.isdigit():
        child = db.session.get(Child, int(child_id))
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403

    # Pediatric Unit can only delete within 1 day of registration
    if user.role == ROLE_HOSPITAL:
        if not child.registration_date:
            return jsonify({"status": "error", "message": "Cannot delete: registration date missing"}), 403
        now = datetime.utcnow()
        diff = now - child.registration_date
        if diff.total_seconds() > 24 * 60 * 60:
            return jsonify({"status": "error", "message": "Pediatric Unit can delete child only within 1 day of registration"}), 403

    old_values = child.to_dict()
    db.session.delete(child)
    db.session.flush()

    log_audit(
        action="DELETE",
        entity_type="child",
        entity_id=child.id,
        old_values=old_values,
        user_id=user.id,
        description=f"Deleted child {child_id}",
    )

    db.session.commit()
    return jsonify({"status": "success"}), 200


@bp.route("/<child_id>/assign", methods=["POST"])
def assign_child_to_area(child_id: str):
    """
    Assign a child to an area (Midwife/MOH/Nutritionist only).
    RDHS/PDHS cannot assign – read-only oversight.
    """
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    if user.role in (ROLE_RDHS, ROLE_PDHS):
        return jsonify({"status": "error", "message": "RDHS/PDHS cannot assign children. Read-only access."}), 403
    data = request.get_json() or {}
    
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Check access
    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    
    # Get target area
    area_id = data.get("area_id")
    if not area_id:
        return jsonify({"status": "error", "message": "area_id is required"}), 400
    
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404
    
    # Validate user can assign to this area
    accessible_areas = get_user_accessible_areas(user)
    accessible_area_ids = {a.id for a in accessible_areas}
    if user.role != ROLE_HEALTH_MINISTRY and area.id not in accessible_area_ids:
        return jsonify({"status": "error", "message": "No access to target area"}), 403
    
    # Validate area level matches role
    role_area_levels = {
        ROLE_MIDWIFE: "phm",
        ROLE_MOH: "moh",
        ROLE_AMOH: "moh",
        ROLE_NUTRITIONIST: "moh",
    }
    expected_level = role_area_levels.get(user.role)
    if expected_level and area.level != expected_level:
        return jsonify({
            "status": "error",
            "message": f"Area must be {expected_level} level for {user.role} role"
        }), 400
    
    old_values = child.to_dict()
    
    # Update child assignment
    child.current_assigned_role = user.role
    child.current_assigned_area_id = area_id
    child.current_assigned_user_id = user.id
    
    # Update area-specific fields and full hierarchy so child appears in MOH, RDHS, PDHS
    if user.role == ROLE_MIDWIFE:
        child.phm_area_id = area_id
        try:
            hierarchy = get_area_hierarchy(area_id)
            child.moh_area_id = hierarchy.get("moh_id")
            child.district_id = hierarchy.get("district_id")
            child.province_id = hierarchy.get("province_id")
        except ValueError:
            pass  # area may not be PHM or hierarchy incomplete
        child.assigned_date = datetime.utcnow()
    elif user.role in [ROLE_MOH, ROLE_AMOH]:
        child.moh_area_id = area_id
        # Set district/province from MOH area's parents so RDHS/PDHS see the child
        moh_area = db.session.get(Area, area_id)
        if moh_area and moh_area.parent_id:
            child.district_id = moh_area.parent_id  # RDHS
            rdhs_area = db.session.get(Area, moh_area.parent_id)
            if rdhs_area and rdhs_area.parent_id:
                child.province_id = rdhs_area.parent_id  # PDHS
        child.assigned_date = datetime.utcnow()
    
    child.status = "ACTIVE"
    child.is_draft = False
    
    db.session.flush()
    
    log_audit(
        action="ASSIGN",
        entity_type="child",
        entity_id=child.id,
        old_values=old_values,
        new_values=child.to_dict(),
        user_id=user.id,
        description=f"Assigned child {child_id} to {area.name}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": f"Child assigned to {area.name}",
        "child": child.to_dict()
    }), 200


@bp.route("/<child_id>/visits", methods=["GET"])
@child_access_required
def list_visits(child_id: str):
    """
    List visits for a child. Midwife/MOH/Nutritionist/Health Ministry can manage.
    RDHS can view (read-only).
    """
    user = get_current_user()
    if user.role not in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS]:
        return jsonify({"status": "error", "message": "Insufficient permissions"}), 403
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    visits = db.session.query(Visit).filter(
        Visit.child_id_fk == child.id
    ).order_by(Visit.visit_date.desc()).all()
    
    return jsonify({
        "status": "success",
        "visits": [v.to_dict() for v in visits],
        "count": len(visits),
    }), 200
