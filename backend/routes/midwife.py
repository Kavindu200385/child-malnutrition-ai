"""
MIDWIFE Role Routes
Strict midwife-only functionality:
- Search children by Child ID
- Assign children to PHM area
- Record measurements
- Run AI analysis
- Escalate to MOH
- Generate reports
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from datetime import datetime
from decimal import Decimal

from backend.auth_utils_hierarchical import get_current_user, ROLE_MIDWIFE
from backend.extensions import db
from backend.models_hierarchical import (
    User, Child, Area, Measurement, ChildEscalation, ClinicReport,
    UserRole, RiskLevel, EscalationStatus, EscalationRecordStatus, AreaLevel
)
from backend.utils.midwife_helpers import (
    get_area_hierarchy,
    calculate_z_scores,
    determine_risk_level_from_z_scores,
    should_escalate_to_moh,
    can_midwife_access_child
)
from backend.utils.audit import log_audit
from backend.ai.predictor import predict_current_risk, predict_future_risk

bp = Blueprint("midwife", __name__, url_prefix="/api/midwife")


def midwife_required(f):
    """Decorator to ensure user has MIDWIFE role"""
    @jwt_required()
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if user.role != UserRole.MIDWIFE.value:
            return jsonify({
                "status": "error",
                "message": "Access denied. Midwife role required."
            }), 403
        # Check if user has PHM area assignment (via worker area mapping)
        from backend.models_hierarchical import WorkerAreaMapping, AreaLevel
        phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
            WorkerAreaMapping.user_id == user.id,
            WorkerAreaMapping.is_active == True,
            Area.level == AreaLevel.PHM.value
        ).first()
        
        if not phm_mapping:
            return jsonify({
                "status": "error",
                "message": "User not assigned to a PHM area"
            }), 400
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function


@bp.route("/search-child", methods=["GET"])
@midwife_required
def search_child():
    """
    Search child by child_unique_id (from hospital registration).
    Returns child if found, even if not yet assigned to this midwife's area.
    """
    user = get_current_user()
    child_unique_id = request.args.get("child_unique_id") or request.args.get("child_id")
    
    if not child_unique_id:
        return jsonify({
            "status": "error",
            "message": "child_unique_id is required"
        }), 400
    
    # Search by child_unique_id or legacy child_id
    child = db.session.query(Child).filter(
        (Child.child_unique_id == child_unique_id) |
        (Child.child_id == child_unique_id)
    ).first()
    
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Get user's PHM area from worker area mapping
    from backend.models_hierarchical import WorkerAreaMapping, AreaLevel
    phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
        WorkerAreaMapping.user_id == user.id,
        WorkerAreaMapping.is_active == True,
        Area.level == AreaLevel.PHM.value
    ).first()
    
    user_phm_area_id = phm_mapping.area_id if phm_mapping else None
    
    # Check if already assigned to another area
    is_assigned = child.midwife_area_id is not None
    can_assign = not is_assigned or child.midwife_area_id == user_phm_area_id
    
    return jsonify({
        "status": "success",
        "child": child.to_dict(),
        "is_assigned": is_assigned,
        "can_assign": can_assign,
        "is_in_my_area": child.midwife_area_id == user_phm_area_id,
    }), 200


@bp.route("/assign-child/<int:child_id>", methods=["POST"])
@midwife_required
def assign_child(child_id: int):
    """
    Assign child to midwife's PHM area.
    Only works if child is not already assigned to another area.
    Automatically maps to MOH, RDHS, PDHS based on hierarchy.
    """
    user = get_current_user()
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Check if already assigned to another area
    if child.phm_area_id is not None and child.phm_area_id != user.phm_area_id:
        return jsonify({
            "status": "error",
            "message": "Child is already assigned to another PHM area. Cannot reassign."
        }), 400
    
    # Get area hierarchy
    try:
        hierarchy = get_area_hierarchy(user.phm_area_id)
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    
    # Assign child to this midwife's area
    child.phm_area_id = hierarchy["phm_area_id"]
    child.moh_area_id = hierarchy["moh_id"]
    child.district_id = hierarchy["district_id"]
    child.province_id = hierarchy["province_id"]
    child.assigned_date = datetime.now()
    child.current_assigned_role = UserRole.MIDWIFE.value
    child.current_assigned_user_id = user.id
    
    db.session.flush()
    
    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        old_values={"phm_area_id": None},
        new_values={"phm_area_id": child.phm_area_id, "moh_area_id": child.moh_area_id},
        user_id=user.id,
        description=f"Assigned child {child.child_unique_id} to PHM area",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Child assigned to your PHM area successfully",
        "child": child.to_dict(),
    }), 200


@bp.route("/children", methods=["GET"])
@midwife_required
def list_children():
    """
    List all children in midwife's PHM area.
    Strict area filtering - no cross-area access.
    """
    user = get_current_user()
    
    # Query parameters
    risk_level = request.args.get("risk_level")
    escalation_status = request.args.get("escalation_status")
    search = request.args.get("search")
    
    # Build query - STRICT area scoping
    query = db.session.query(Child).filter(
        Child.phm_area_id == user.phm_area_id
    )
    
    # Apply filters
    if risk_level:
        query = query.filter(Child.current_risk_level == risk_level)
    
    if escalation_status:
        query = query.filter(Child.escalation_status == escalation_status)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Child.name.ilike(search_term)) |
            (Child.child_unique_id.ilike(search_term))
        )
    
    children = query.order_by(Child.assigned_date.desc()).all()
    
    return jsonify({
        "status": "success",
        "children": [c.to_dict(include_visits=True) for c in children],
        "count": len(children),
        "phm_area_id": user.phm_area_id,
    }), 200


@bp.route("/measurement/add", methods=["POST"])
@midwife_required
def add_measurement():
    """
    Add measurement for child in midwife's area.
    Calculates Z-scores, runs AI analysis, updates risk level.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    # Validate required fields
    child_id = data.get("child_id")
    if not child_id:
        return jsonify({
            "status": "error",
            "message": "child_id is required"
        }), 400
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Security: Ensure child is in midwife's area
    if not can_midwife_access_child(user, child):
        return jsonify({
            "status": "error",
            "message": "Access denied. Child is not in your PHM area."
        }), 403
    
    # Validate measurement data
    weight_kg = data.get("weight_kg")
    height_cm = data.get("height_cm")
    muac_cm = data.get("muac_cm")
    
    if not weight_kg or not height_cm:
        return jsonify({
            "status": "error",
            "message": "weight_kg and height_cm are required"
        }), 400
    
    # Calculate age in months
    if not child.dob:
        return jsonify({
            "status": "error",
            "message": "Child date of birth is required for measurement"
        }), 400
    
    age_days = (datetime.now().date() - child.dob).days
    age_months = age_days // 30
    
    # Calculate Z-scores
    sex = "M" if child.gender == "male" else "F"
    z_scores = calculate_z_scores(age_months, sex, float(weight_kg), float(height_cm))
    
    # Run AI analysis
    try:
        ai_result = predict_current_risk({
            "age_months": age_months,
            "sex": sex,
            "weight_kg": float(weight_kg),
            "height_cm": float(height_cm),
        })
        
        if not ai_result.get("ok"):
            return jsonify({
                "status": "error",
                "message": f"AI analysis failed: {ai_result.get('error', 'Unknown error')}"
            }), 500
        
        current_risk = ai_result.get("risk_level", RiskLevel.NORMAL.value)
        predicted_risk = ai_result.get("predicted_risk_next_2_months")
        confidence = ai_result.get("confidence", 0.0)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"AI analysis error: {str(e)}"
        }), 500
    
    # Get previous risk level for escalation check
    previous_risk = child.current_risk_level
    
    # Create measurement record
    measurement = Measurement(
        child_id=child.id,
        measurement_date=datetime.now(),
        weight_kg=Decimal(str(weight_kg)),
        height_cm=Decimal(str(height_cm)),
        muac_cm=Decimal(str(muac_cm)) if muac_cm else None,
        z_score_wfa=Decimal(str(z_scores["z_wfa"])) if z_scores["z_wfa"] else None,
        z_score_hfa=Decimal(str(z_scores["z_hfa"])) if z_scores["z_hfa"] else None,
        z_score_wfh=Decimal(str(z_scores["z_wfh"])) if z_scores["z_wfh"] else None,
        risk_level=current_risk,
        predicted_risk_next_2_months=predicted_risk,
        model_confidence=Decimal(str(confidence)),
        measured_by_user_id=user.id,
        notes=data.get("notes"),
    )
    
    db.session.add(measurement)
    db.session.flush()
    
    # Update child's current risk level
    child.current_risk_level = current_risk
    child.last_risk_update = datetime.now()
    
    # Check if escalation needed
    escalation_needed = should_escalate_to_moh(previous_risk, current_risk)
    
    db.session.commit()
    
    log_audit(
        action="CREATE",
        entity_type="measurement",
        entity_id=measurement.id,
        new_values=measurement.to_dict(),
        user_id=user.id,
        description=f"Added measurement for child {child.child_unique_id}",
    )
    
    return jsonify({
        "status": "success",
        "message": "Measurement recorded successfully",
        "measurement": measurement.to_dict(),
        "child": child.to_dict(),
        "escalation_needed": escalation_needed,
        "previous_risk": previous_risk,
        "new_risk": current_risk,
    }), 201


@bp.route("/escalate/<int:child_id>", methods=["POST"])
@midwife_required
def escalate_to_moh(child_id: int):
    """
    Escalate child to MOH when risk increases.
    Only allowed for children in midwife's area.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Security: Ensure child is in midwife's area
    if not can_midwife_access_child(user, child):
        return jsonify({
            "status": "error",
            "message": "Access denied. Child is not in your PHM area."
        }), 403
    
    if not child.moh_area_id:
        return jsonify({
            "status": "error",
            "message": "Child's MOH area not found"
        }), 400
    
    # Check if already escalated
    if child.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value:
        return jsonify({
            "status": "error",
            "message": "Child already escalated to MOH"
        }), 400
    
    # Create escalation record
    escalation = ChildEscalation(
        child_id=child.id,
        escalated_by_user_id=user.id,
        from_role="midwife",
        to_role="moh",
        moh_id=child.moh_area_id,
        reason=data.get("reason", "Risk level increased - requires MOH review"),
        previous_risk_level=data.get("previous_risk_level"),
        new_risk_level=child.current_risk_level,
        status=EscalationRecordStatus.PENDING.value,
    )
    
    db.session.add(escalation)
    
    # Update child escalation status
    child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
    
    db.session.flush()
    
    log_audit(
        action="CREATE",
        entity_type="escalation",
        entity_id=escalation.id,
        new_values=escalation.to_dict(),
        user_id=user.id,
        description=f"Escalated child {child.child_unique_id} to MOH",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Child escalated to MOH successfully",
        "escalation": escalation.to_dict(),
    }), 201


@bp.route("/child-report/<int:child_id>", methods=["GET"])
@midwife_required
def get_child_report(child_id: int):
    """
    Generate child report with growth charts, measurement history, risk analysis.
    """
    user = get_current_user()
    
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({
            "status": "error",
            "message": "Child not found"
        }), 404
    
    # Security: Ensure child is in midwife's area
    if not can_midwife_access_child(user, child):
        return jsonify({
            "status": "error",
            "message": "Access denied. Child is not in your PHM area."
        }), 403
    
    # Get all measurements
    measurements = db.session.query(Measurement).filter(
        Measurement.child_id == child.id
    ).order_by(Measurement.measurement_date.asc()).all()
    
    # Get escalation history
    escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.child_id == child.id
    ).order_by(ChildEscalation.created_at.desc()).all()
    
    return jsonify({
        "status": "success",
        "child": child.to_dict(include_visits=True),
        "measurements": [m.to_dict() for m in measurements],
        "escalations": [e.to_dict() for e in escalations],
        "report_generated_at": datetime.now().isoformat(),
    }), 200


@bp.route("/clinic-report/submit", methods=["POST"])
@midwife_required
def submit_clinic_report():
    """
    Submit monthly clinic report to MOH.
    Aggregates data for the month and marks as submitted.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    report_month = data.get("report_month")
    report_year = data.get("report_year")
    
    if not report_month or not report_year:
        return jsonify({
            "status": "error",
            "message": "report_month (1-12) and report_year are required"
        }), 400
    
    # Check if report already exists
    existing = db.session.query(ClinicReport).filter(
        ClinicReport.phm_area_id == user.phm_area_id,
        ClinicReport.report_month == report_month,
        ClinicReport.report_year == report_year
    ).first()
    
    if existing and existing.submitted_to_moh:
        return jsonify({
            "status": "error",
            "message": "Report already submitted for this month"
        }), 400
    
    # Aggregate data for the month
    start_date = datetime(report_year, report_month, 1)
    if report_month == 12:
        end_date = datetime(report_year + 1, 1, 1)
    else:
        end_date = datetime(report_year, report_month + 1, 1)
    
    # Get all children in this area
    children = db.session.query(Child).filter(
        Child.phm_area_id == user.phm_area_id,
        Child.assigned_date >= start_date,
        Child.assigned_date < end_date
    ).all()
    
    # Count by risk level
    total = len(children)
    normal_count = sum(1 for c in children if c.current_risk_level == RiskLevel.NORMAL.value)
    mam_count = sum(1 for c in children if c.current_risk_level == RiskLevel.MAM.value)
    sam_count = sum(1 for c in children if c.current_risk_level == RiskLevel.SAM.value)
    escalated_count = sum(1 for c in children if c.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value)
    
    # Create or update report
    if existing:
        report = existing
        report.total_children_seen = total
        report.normal_count = normal_count
        report.mam_count = mam_count
        report.sam_count = sam_count
        report.escalated_cases = escalated_count
    else:
        report = ClinicReport(
            phm_area_id=user.phm_area_id,
            report_month=report_month,
            report_year=report_year,
            total_children_seen=total,
            normal_count=normal_count,
            mam_count=mam_count,
            sam_count=sam_count,
            escalated_cases=escalated_count,
            created_by_user_id=user.id,
        )
        db.session.add(report)
    
    # Mark as submitted
    report.submitted_to_moh = True
    report.submitted_at = datetime.now()
    
    db.session.flush()
    
    log_audit(
        action="CREATE" if not existing else "UPDATE",
        entity_type="clinic_report",
        entity_id=report.id,
        new_values=report.to_dict(),
        user_id=user.id,
        description=f"Submitted clinic report for {report_month}/{report_year}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Clinic report submitted to MOH successfully",
        "report": report.to_dict(),
    }), 200


@bp.route("/dashboard/stats", methods=["GET"])
@midwife_required
def get_dashboard_stats():
    """
    Get dashboard statistics for midwife's area.
    """
    user = get_current_user()
    
    # Get all children in midwife's area
    children = db.session.query(Child).filter(
        Child.phm_area_id == user.phm_area_id
    ).all()
    
    total = len(children)
    normal_count = sum(1 for c in children if c.current_risk_level == RiskLevel.NORMAL.value)
    mam_count = sum(1 for c in children if c.current_risk_level == RiskLevel.MAM.value)
    sam_count = sum(1 for c in children if c.current_risk_level == RiskLevel.SAM.value)
    escalated_count = sum(1 for c in children if c.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value)
    
    # Get recent measurements count (last 30 days)
    thirty_days_ago = datetime.now() - timedelta(days=30)
    recent_measurements = db.session.query(Measurement).join(Child).filter(
        Child.phm_area_id == user.phm_area_id,
        Measurement.measurement_date >= thirty_days_ago
    ).count()
    
    return jsonify({
        "status": "success",
        "stats": {
            "total_children": total,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "escalated_cases": escalated_count,
            "recent_measurements_30days": recent_measurements,
        },
        "phm_area_id": user.phm_area_id,
    }), 200
