"""
Children CRUD Routes - Hierarchical System
Updated with area-based access control and hierarchical filtering
"""
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, jsonify, request

from flask_jwt_extended import jwt_required
from sqlalchemy import or_

from backend.auth_utils_hierarchical import (
    get_current_user,
    user_can_access_child,
    get_user_accessible_areas,
    get_moh_area_ids,
    get_rdhs_district_area_ids,
    get_rdhs_child_area_ids,
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
from backend.models_hierarchical import (
    Child,
    Visit,
    Area,
    Hospital,
    RiskLevel,
    ChildReferral,
    ReferralStatus,
    ChildEscalation,
    ChildTransfer,
    AreaChangeRequest,
    Measurement,
    Notification,
    User,
    WorkerAreaMapping,
)
from backend.utils.audit import log_audit
from backend.utils.midwife_helpers import get_area_hierarchy
from backend.utils.hospital_helpers import calculate_birth_risk_level, generate_child_unique_id
from backend.services.email_service import send_child_event_email, send_child_registered_email

bp = Blueprint("children_crud_hierarchical", __name__, url_prefix="/api/children")


def _find_child_by_ref(child_ref: str) -> Child | None:
    """Resolve child by child_id, child_unique_id, or numeric primary key."""
    child = db.session.query(Child).filter(Child.child_id == child_ref).first()
    if not child:
        child = db.session.query(Child).filter(Child.child_unique_id == child_ref).first()
    if not child and child_ref.isdigit():
        child = db.session.get(Child, int(child_ref))
    return child


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

    child_unique_id = (data.get("child_unique_id") or child_id or "").strip()
    if not child_unique_id:
        return jsonify({"status": "error", "message": "child_id (registration number) is required"}), 400

    # Check if child_id / child_unique_id already exists
    from sqlalchemy import or_ as sql_or
    existing = db.session.query(Child).filter(
        sql_or(Child.child_id == child_id, Child.child_unique_id == child_unique_id)
    ).first()
    if existing:
        return jsonify({"status": "error", "message": "child_id already exists"}), 409

    child = Child(
        child_id=child_id,
        child_unique_id=child_unique_id,
        name=data.get("name"),
        registration_date=datetime.utcnow(),
        gender=data.get("gender"),
        mother_name=data.get("mother_name"),
        guardian_name=data.get("guardian_name"),
        guardian_phone=data.get("guardian_phone"),
        guardian_email=(data.get("guardian_email") or None),
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

    if not birth_weight_raw and isinstance(birth_reg, dict):
        birth_weight_raw = birth_reg.get("birthWeight")
    if not birth_height_raw and isinstance(birth_reg, dict):
        birth_height_raw = birth_reg.get("birthLength")

    def _to_float(value):
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    birth_weight = _to_float(birth_weight_raw)
    birth_height = _to_float(birth_height_raw)

    if birth_weight is not None:
        child.birth_weight_kg = Decimal(str(birth_weight))
    if birth_height is not None:
        child.birth_height_cm = Decimal(str(birth_height))

    # If DOB and birth measurements are available, derive an initial birth_risk_level
    if child.dob and birth_weight is not None:
        age_days = (datetime.utcnow().date() - child.dob).days
        birth_risk_level, _reason = calculate_birth_risk_level(
            birth_weight_kg=birth_weight,
            birth_height_cm=birth_height,
            birth_muac_cm=None,
            age_days=age_days,
        )
        child.birth_risk_level = birth_risk_level
        child.current_risk_level = birth_risk_level

    db.session.add(child)
    db.session.flush()

    # When Pediatric Unit (hospital) registers, link child to their hospital + area hierarchy
    if user.role == ROLE_HOSPITAL and getattr(user, "hospital_id", None):
        child.hospital_id = user.hospital_id
        hospital = db.session.get(Hospital, user.hospital_id)
        if hospital:
            child.registered_by_clinic = hospital.hospital_name
            if not child.birth_registration:
                child.birth_registration = {}
            if isinstance(child.birth_registration, dict) and child_id != child_unique_id:
                child.birth_registration.setdefault("mchCardNo", child_id)
            try:
                hos_id = generate_child_unique_id(user.hospital_id)
                child.child_unique_id = hos_id
                if child_id.startswith("MCH-") or child_id.startswith("BR-"):
                    if isinstance(child.birth_registration, dict):
                        child.birth_registration["mchCardNo"] = child_id
                else:
                    child.child_id = hos_id
            except Exception:
                pass
            if hospital.district:
                rdhs = db.session.query(Area).filter(
                    Area.level == "rdhs",
                    Area.district == hospital.district,
                    Area.is_active == True,
                ).first()
                if rdhs:
                    child.district_id = rdhs.id
                    if rdhs.parent_id:
                        child.province_id = rdhs.parent_id
        child.current_assigned_role = ROLE_HOSPITAL
        child.current_assigned_user_id = user.id
        if not is_draft:
            child.status = "ACTIVE"
            child.is_draft = False

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

    if child.guardian_email:
        result = send_child_registered_email(
            child.guardian_email,
            child_name=child.name,
            child_identifier=child.child_unique_id or child.child_id,
            guardian_name=child.guardian_name,
        )
        log_audit(
            action_type="CHILD_REGISTRATION_EMAIL_SENT" if result.ok else "CHILD_REGISTRATION_EMAIL_FAILED",
            action_category="NOTIFICATIONS",
            entity_type="child",
            entity_id=child.id,
            status="SUCCESS" if result.ok else "FAILED",
            user_id=user.id if user else None,
            description=f"Child registration email {'sent' if result.ok else 'failed'} for {child.child_unique_id or child.child_id}.",
            metadata={"recipient": child.guardian_email, "error": None if result.ok else result.message},
        )
        if user and user.role == ROLE_MIDWIFE and child.current_assigned_area_id:
            assigned_area = db.session.get(Area, child.current_assigned_area_id)
            send_child_event_email(
                child.guardian_email,
                child_name=child.name,
                child_identifier=child.child_unique_id or child.child_id,
                guardian_name=child.guardian_name,
                event_title="Child Assigned to Midwife Area",
                event_summary="Your child has been assigned to a PHM/midwife area for follow-up care.",
                details={
                    "Assigned area": assigned_area.name if assigned_area else str(child.current_assigned_area_id),
                    "Assigned role": "Midwife",
                    "Status": "Active follow-up",
                },
            )
        db.session.commit()
    return jsonify({"status": "success", "child": child.to_dict()}), 201


@bp.route("", methods=["GET"])
@jwt_required()
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
            # Include children with district nutritionist even if district_id not set (e.g. before repair)
            child_area_ids = get_rdhs_child_area_ids(rdhs_ids) if rdhs_ids else []
            worker_area_ids = list(set(child_area_ids) | set(rdhs_ids))
            district_nutritionist_ids = [
                u[0] for u in db.session.query(WorkerAreaMapping.user_id)
                .filter(
                    WorkerAreaMapping.area_id.in_(worker_area_ids),
                    WorkerAreaMapping.is_active == True,
                )
                .distinct()
                .all()
            ]
            if district_nutritionist_ids:
                nutritionist_user_ids = [
                    u.id for u in db.session.query(User).filter(
                        User.id.in_(district_nutritionist_ids),
                        User.role == ROLE_NUTRITIONIST,
                        User.is_active == True,
                    ).all()
                ]
                if nutritionist_user_ids:
                    child_ids_with_district_nutritionist = [
                        r[0] for r in db.session.query(ChildReferral.child_id).filter(
                            ChildReferral.referred_to_role == "nutritionist",
                            ChildReferral.status == ReferralStatus.REVIEWED.value,
                            ChildReferral.reviewed_by_user_id.in_(nutritionist_user_ids),
                        ).distinct().all()
                    ]
                    if child_ids_with_district_nutritionist:
                        conditions.append(Child.id.in_(child_ids_with_district_nutritionist))
            if not conditions:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            query = query.filter(or_(*conditions))
        else:
            if not accessible_area_ids:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            query = query.filter(Child.current_assigned_area_id.in_(accessible_area_ids))
    elif user.role == ROLE_HOSPITAL:
        # Hospital: all children at this hospital (not only one registrar's user id)
        from sqlalchemy import or_ as sql_or
        if user.hospital_id:
            query = query.filter(
                sql_or(
                    Child.hospital_id == user.hospital_id,
                    Child.registered_by_user_id == user.id,
                )
            )
        else:
            query = query.filter(Child.registered_by_user_id == user.id)
    elif user.role == ROLE_NUTRITIONIST:
        # Nutritionist: only children whose transfer has been ACCEPTED (REVIEWED)
        # by this hospital nutritionist. This keeps lists and dashboards consistent:
        # - pending / rejected referrals are excluded
        # - only children "under your care" are returned here.
        if not user.hospital_id:
            return jsonify({"status": "success", "children": [], "count": 0}), 200
        query = (
            query.join(ChildReferral, ChildReferral.child_id == Child.id)
            .filter(
                ChildReferral.hospital_id == user.hospital_id,
                ChildReferral.referred_to_role == "nutritionist",
                ChildReferral.status == ReferralStatus.REVIEWED.value,
            )
        )
    elif user.role in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH]:
        # Field workers see ONLY children assigned to their areas.
        # The assign page may pass include_unassigned=true to see
        # unassigned children for the purpose of assigning them.
        include_unassigned = request.args.get("include_unassigned", "false").lower() == "true"

        if user.role in [ROLE_MOH, ROLE_AMOH]:
            # MOH: strict area isolation — only children in their MOH area(s)
            from backend.auth_utils_hierarchical import get_moh_area_ids
            moh_area_ids = get_moh_area_ids(user)
            if not moh_area_ids:
                return jsonify({"status": "success", "children": [], "count": 0}), 200
            if include_unassigned:
                from sqlalchemy import or_
                query = query.filter(
                    or_(
                        Child.moh_area_id.in_(moh_area_ids),
                        Child.current_assigned_area_id.is_(None)
                    )
                )
            else:
                query = query.filter(Child.moh_area_id.in_(moh_area_ids))
        else:
            # Midwife: only children in their PHM area(s)
            accessible_areas = get_user_accessible_areas(user)
            accessible_area_ids = [a.id for a in accessible_areas]
            if not accessible_area_ids:
                if include_unassigned:
                    query = query.filter(Child.current_assigned_area_id.is_(None))
                else:
                    return jsonify({"status": "success", "children": [], "count": 0}), 200
            else:
                if include_unassigned:
                    from sqlalchemy import or_
                    query = query.filter(
                        or_(
                            Child.current_assigned_area_id.in_(accessible_area_ids),
                            Child.current_assigned_area_id.is_(None)
                        )
                    )
                else:
                    # Default: only children currently under midwife care in their area
                    # Exclude escalated children (current_assigned_role != 'midwife')
                    query = query.filter(
                        Child.current_assigned_area_id.in_(accessible_area_ids),
                        Child.current_assigned_role == ROLE_MIDWIFE,
                    )
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
            (Child.child_unique_id.like(f"%{q}%"))
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
    child = _find_child_by_ref(child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Check access
    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    
    # Include visits/transfers for measurement roles and RDHS (read-only); hospital gets visits but not transfers
    include_visits = user.role in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS, ROLE_HOSPITAL]
    include_transfers = user.role in [ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS]
    include_care_history = user.role in [ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY, ROLE_RDHS, ROLE_PDHS]

    child_data = child.to_dict(
        include_visits=include_visits,
        include_transfers=include_transfers,
        include_escalations=include_care_history,
        include_referrals=include_care_history,
    )
    if user.role in (ROLE_MOH, ROLE_AMOH):
        moh_area_ids = get_moh_area_ids(user)
        child_data["can_moh_add_measurement"] = child_was_escalated_to_moh(child, moh_area_ids)
    if user.role == ROLE_NUTRITIONIST and user.hospital_id:
        from backend.models_hierarchical import EscalationStatus
        is_active = (child.escalation_status or "") == EscalationStatus.ESCALATED_TO_NUTRITIONIST.value
        child_data["can_nutritionist_add_measurement"] = is_active

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
    child = _find_child_by_ref(child_id)
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
    for field in ["name", "gender", "guardian_name", "mother_name", "guardian_phone", "guardian_email", "guardian_nic", "address"]:
        if field in data:
            setattr(child, field, data[field])

    if "is_draft" in data:
        child.is_draft = bool(data["is_draft"])
        child.status = "DRAFT" if child.is_draft else "ACTIVE"

    if "birth_registration" in data:
        incoming = data["birth_registration"]
        if isinstance(incoming, dict):
            existing_reg = child.birth_registration if isinstance(child.birth_registration, dict) else {}
            merged = {**existing_reg, **incoming}
            child.birth_registration = merged
        else:
            child.birth_registration = incoming

    # Sync top-level birth measurements from payload or nested birth_registration
    birth_reg = child.birth_registration if isinstance(child.birth_registration, dict) else {}
    if "birth_weight_kg" not in data and birth_reg.get("birthWeight") is not None:
        data = {**data, "birth_weight_kg": birth_reg.get("birthWeight")}
    if "birth_height_cm" not in data and birth_reg.get("birthLength") is not None:
        data = {**data, "birth_height_cm": birth_reg.get("birthLength")}

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
    if "birth_risk_level" in data:
        # Explicit override from client, used as-is
        child.birth_risk_level = data["birth_risk_level"] if data["birth_risk_level"] else None
    elif birth_fields_updated and child.dob:
        # Automatically recalculate birth_risk_level when birth measurements change
        bw = float(child.birth_weight_kg) if child.birth_weight_kg is not None else None
        bh = float(child.birth_height_cm) if child.birth_height_cm is not None else None
        if bw is not None:
            age_days = (datetime.utcnow().date() - child.dob).days
            new_birth_risk, _reason = calculate_birth_risk_level(
                birth_weight_kg=bw,
                birth_height_cm=bh,
                birth_muac_cm=None,
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
    child = _find_child_by_ref(child_id)
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

    # Delete related records that lack cascade-delete on the ORM relationship.
    # (Visit already has cascade="all, delete-orphan", so it's handled automatically.)
    referral_ids = [
        row[0] for row in db.session.query(ChildReferral.id)
        .filter(ChildReferral.child_id == child.id)
        .all()
    ]
    escalation_ids = [
        row[0] for row in db.session.query(ChildEscalation.id)
        .filter(ChildEscalation.child_id == child.id)
        .all()
    ]
    transfer_ids = [
        row[0] for row in db.session.query(ChildTransfer.id)
        .filter(ChildTransfer.child_id == child.id)
        .all()
    ]
    notification_filters = [Notification.related_child_id == child.id]
    if referral_ids:
        notification_filters.append(Notification.related_referral_id.in_(referral_ids))
    if escalation_ids:
        notification_filters.append(Notification.related_escalation_id.in_(escalation_ids))
    if transfer_ids:
        notification_filters.append(Notification.related_transfer_id.in_(transfer_ids))
    db.session.query(Notification).filter(or_(*notification_filters)).delete(synchronize_session=False)

    db.session.query(Measurement).filter(Measurement.child_id == child.id).delete(synchronize_session=False)
    db.session.query(ChildEscalation).filter(ChildEscalation.child_id == child.id).delete(synchronize_session=False)
    db.session.query(ChildReferral).filter(ChildReferral.child_id == child.id).delete(synchronize_session=False)
    db.session.query(ChildTransfer).filter(ChildTransfer.child_id == child.id).delete(synchronize_session=False)
    db.session.query(AreaChangeRequest).filter(AreaChangeRequest.child_id == child.id).delete(synchronize_session=False)
    db.session.flush()

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
@role_required(ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY)
def assign_child_to_area(child_id: str):
    """
    Assign a child to an area (Midwife/MOH/Nutritionist only).
    RDHS/PDHS cannot assign – read-only oversight.
    """
    user = get_current_user()
    if user.role in (ROLE_RDHS, ROLE_PDHS):
        return jsonify({"status": "error", "message": "RDHS/PDHS cannot assign children. Read-only access."}), 403
    data = request.get_json() or {}

    # Try string child_id first, then fallback to numeric primary key
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child:
        child = db.session.query(Child).filter(Child.child_unique_id == child_id).first()
    if not child and child_id.isdigit():
        child = db.session.get(Child, int(child_id))
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
    
    # Update area-specific fields and full hierarchy so child appears correctly in MOH, RDHS, PDHS
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
    elif user.role in [ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST]:
        # MOH / AMOH / Nutritionist all work at MOH level, so ensure MOH + district + province are set
        child.moh_area_id = area_id
        # Set district/province from MOH area's parents so RDHS/PDHS can see the child
        moh_area = db.session.get(Area, area_id)
        if moh_area and moh_area.parent_id:
            child.district_id = moh_area.parent_id  # RDHS level
            rdhs_area = db.session.get(Area, moh_area.parent_id)
            if rdhs_area and rdhs_area.parent_id:
                child.province_id = rdhs_area.parent_id  # PDHS level
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
    send_child_event_email(
        child.guardian_email,
        child_name=child.name,
        child_identifier=child.child_unique_id or child.child_id,
        guardian_name=child.guardian_name,
        event_title="Child Assigned to Care Area",
        event_summary=f"Your child has been assigned to {area.name} for follow-up care.",
        details={
            "Assigned area": area.name,
            "Assigned role": user.role,
            "Status": "Active follow-up",
        },
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
