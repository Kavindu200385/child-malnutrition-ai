"""
Hospital Role Routes
Strict hospital-only functionality:
- Register children at birth
- View hospital's children
- Transfer SAM cases to nutritionist
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from datetime import datetime
from decimal import Decimal

from backend.auth_utils_hierarchical import get_current_user
from backend.extensions import db
from backend.models_hierarchical import (
    User, Child, Hospital, ChildReferral, UserRole, BirthRiskLevel, TransferStatus, ReferralStatus
)
from backend.utils.hospital_helpers import (
    generate_child_unique_id,
    calculate_birth_risk_level,
    is_sam_case
)
from backend.utils.audit import log_audit

bp = Blueprint("hospital", __name__, url_prefix="/api/hospital")


def hospital_required(f):
    """Decorator to ensure user has HOSPITAL role"""
    @jwt_required()
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if user.role != UserRole.HOSPITAL.value:
            return jsonify({
                "status": "error",
                "message": "Access denied. Hospital role required."
            }), 403
        if not user.hospital_id:
            return jsonify({
                "status": "error",
                "message": "User not assigned to a hospital"
            }), 400
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function


@bp.route("/child/register", methods=["POST"])
@hospital_required
def register_child():
    """
    Register a newborn child at birth.
    Hospital role only.
    Auto-generates child_unique_id and calculates birth risk level.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    # Validate required fields
    required_fields = ["name", "dob", "gender", "birth_weight_kg"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({
                "status": "error",
                "message": f"{field} is required"
            }), 400
    
    # Get hospital
    hospital = db.session.get(Hospital, user.hospital_id)
    if not hospital:
        return jsonify({
            "status": "error",
            "message": "Hospital not found"
        }), 404
    
    # Generate unique child ID
    try:
        child_unique_id = generate_child_unique_id(user.hospital_id)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to generate child ID: {str(e)}"
        }), 500
    
    # Parse date of birth
    try:
        if isinstance(data["dob"], str):
            dob = datetime.strptime(data["dob"], "%Y-%m-%d").date()
        else:
            dob = data["dob"]
    except Exception:
        return jsonify({
            "status": "error",
            "message": "Invalid date format. Use YYYY-MM-DD"
        }), 400
    
    # Calculate age in days
    age_days = (datetime.now().date() - dob).days
    
    # Calculate birth risk level
    birth_weight = float(data.get("birth_weight_kg", 0))
    birth_height = float(data.get("birth_height_cm", 0)) if data.get("birth_height_cm") else None
    birth_muac = float(data.get("birth_muac_cm", 0)) if data.get("birth_muac_cm") else None
    
    birth_risk_level, risk_reason = calculate_birth_risk_level(
        birth_weight_kg=birth_weight,
        birth_height_cm=birth_height,
        birth_muac_cm=birth_muac,
        age_days=age_days
    )
    
    # Create child record
    child = Child(
        child_unique_id=child_unique_id,
        child_id=child_unique_id,  # Also set legacy field
        name=data["name"],
        dob=dob,
        gender=data["gender"].lower(),
        birth_weight_kg=Decimal(str(birth_weight)),
        birth_height_cm=Decimal(str(birth_height)) if birth_height else None,
        birth_muac_cm=Decimal(str(birth_muac)) if birth_muac else None,
        mother_name=data.get("mother_name"),
        guardian_name=data.get("guardian_name") or data.get("mother_name"),
        guardian_phone=data.get("guardian_phone") or data.get("contact_number"),
        guardian_nic=data.get("guardian_nic") or data.get("nic"),
        address=data.get("address"),
        hospital_id=user.hospital_id,
        registered_by_user_id=user.id,
        registered_by_clinic=hospital.hospital_name,
        registration_date=datetime.now(),
        birth_risk_level=birth_risk_level,
        transfer_status=TransferStatus.NONE.value,
        is_transferred=False,
        current_assigned_role=UserRole.HOSPITAL.value,
        current_risk_level=birth_risk_level,  # Set initial risk level
        status="ACTIVE",
        is_draft=False,
    )
    
    db.session.add(child)
    db.session.flush()
    
    # Log audit
    log_audit(
        action="CREATE",
        entity_type="child",
        entity_id=child.id,
        new_values=child.to_dict(),
        user_id=user.id,
        description=f"Registered child {child_unique_id} at {hospital.hospital_name}",
    )
    
    db.session.commit()
    
    # Prepare response
    response_data = child.to_dict()
    response_data["risk_reason"] = risk_reason
    response_data["is_sam"] = is_sam_case(birth_risk_level)
    
    return jsonify({
        "status": "success",
        "child": response_data,
        "message": f"Child registered successfully. ID: {child_unique_id}"
    }), 201


@bp.route("/children", methods=["GET"])
@hospital_required
def list_children():
    """
    List all children registered by this hospital.
    Hospital role only.
    Filtered by hospital_id from JWT.
    """
    user = get_current_user()
    
    # Query parameters
    birth_risk_level = request.args.get("birth_risk_level")  # NORMAL, MAM, SAM
    transfer_status = request.args.get("transfer_status")  # NONE, TRANSFERRED_TO_NUTRITIONIST
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    search = request.args.get("search")  # Search by name or child_unique_id
    
    # Build query - STRICT hospital scoping
    query = db.session.query(Child).filter(
        Child.hospital_id == user.hospital_id
    )
    
    # Apply filters
    if birth_risk_level:
        query = query.filter(Child.birth_risk_level == birth_risk_level)
    
    if transfer_status:
        query = query.filter(Child.transfer_status == transfer_status)
    
    if start_date:
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Child.registration_date >= start)
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.strptime(end_date, "%Y-%m-%d")
            query = query.filter(Child.registration_date <= end)
        except ValueError:
            pass
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Child.name.ilike(search_term)) |
            (Child.child_unique_id.ilike(search_term))
        )
    
    # Order by registration date (newest first)
    children = query.order_by(Child.registration_date.desc()).all()
    
    return jsonify({
        "status": "success",
        "children": [c.to_dict() for c in children],
        "count": len(children),
        "hospital_id": user.hospital_id,
    }), 200


@bp.route("/child/<int:child_id>", methods=["GET"])
@hospital_required
def get_child(child_id: int):
    """Get child details (hospital-scoped)"""
    user = get_current_user()
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Security: Ensure child belongs to this hospital
    if child.hospital_id != user.hospital_id:
        return jsonify({
            "status": "error",
            "message": "Access denied. Child does not belong to your hospital."
        }), 403
    
    return jsonify({
        "status": "success",
        "child": child.to_dict(include_referrals=True),
    }), 200


@bp.route("/transfer-to-nutritionist/<int:child_id>", methods=["POST"])
@hospital_required
def transfer_to_nutritionist(child_id: int):
    """
    Transfer SAM case to hospital nutritionist.
    Hospital role only.
    Only allowed if birth_risk_level = SAM.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Security: Ensure child belongs to this hospital
    if child.hospital_id != user.hospital_id:
        return jsonify({
            "status": "error",
            "message": "Access denied. Child does not belong to your hospital."
        }), 403
    
    # Only allow transfer if SAM
    if not is_sam_case(child.birth_risk_level):
        return jsonify({
            "status": "error",
            "message": "Transfer to nutritionist only allowed for SAM cases. Current risk level: " + (child.birth_risk_level or "NORMAL")
        }), 400
    
    # Check if already transferred
    if child.is_transferred:
        return jsonify({
            "status": "error",
            "message": "Child already transferred to nutritionist"
        }), 400
    
    # Update child transfer status
    child.transfer_status = TransferStatus.TRANSFERRED_TO_NUTRITIONIST.value
    child.is_transferred = True
    
    # Create referral record
    referral = ChildReferral(
        child_id=child.id,
        referred_by_user_id=user.id,
        referred_to_role="nutritionist",
        hospital_id=user.hospital_id,
        status=ReferralStatus.PENDING.value,
        referral_reason=data.get("reason", "SAM case - immediate nutritionist referral required"),
    )
    
    db.session.add(referral)
    db.session.flush()
    
    # Log audit
    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        old_values={"transfer_status": TransferStatus.NONE.value, "is_transferred": False},
        new_values={"transfer_status": TransferStatus.TRANSFERRED_TO_NUTRITIONIST.value, "is_transferred": True},
        user_id=user.id,
        description=f"Transferred SAM case {child.child_unique_id} to nutritionist",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Child transferred to nutritionist successfully",
        "referral": referral.to_dict(),
    }), 200


@bp.route("/stats", methods=["GET"])
@hospital_required
def get_hospital_stats():
    """Get hospital statistics (hospital-scoped)"""
    user = get_current_user()
    
    # Get all children for this hospital
    all_children = db.session.query(Child).filter(
        Child.hospital_id == user.hospital_id
    ).all()
    
    total = len(all_children)
    sam_count = sum(1 for c in all_children if c.birth_risk_level == BirthRiskLevel.SAM.value)
    mam_count = sum(1 for c in all_children if c.birth_risk_level == BirthRiskLevel.MAM.value)
    normal_count = sum(1 for c in all_children if c.birth_risk_level == BirthRiskLevel.NORMAL.value)
    transferred_count = sum(1 for c in all_children if c.is_transferred)
    
    return jsonify({
        "status": "success",
        "stats": {
            "total_children": total,
            "sam_cases": sam_count,
            "mam_cases": mam_count,
            "normal_cases": normal_count,
            "transferred_to_nutritionist": transferred_count,
        },
        "hospital_id": user.hospital_id,
    }), 200
