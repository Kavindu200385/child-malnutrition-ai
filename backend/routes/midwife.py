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
from functools import wraps
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from datetime import datetime, timedelta
from decimal import Decimal

from backend.auth_utils_hierarchical import get_current_user, ROLE_MIDWIFE
from backend.extensions import db
from backend.models_hierarchical import (
    User, Child, Area, Measurement, Visit, ChildEscalation, ClinicReport,
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
from backend.services.notification_service import (
    PRIORITY_CRITICAL,
    PRIORITY_HIGH,
    PRIORITY_NORMAL,
    notify_moh_area,
    notify_phm_area,
)
from backend.services.email_service import send_child_event_email
from backend.ai.predictor import (
    build_future_prediction_payload,
    predict_current_risk,
    predict_future_risk,
    compute_z_scores as ai_compute_z_scores,
)

bp = Blueprint("midwife", __name__, url_prefix="/api/midwife")


def _normalize_ai_risk(label: str) -> str:
    """
    Map raw AI model output labels to standard DB risk strings.
    Model outputs: 'Normal', 'MAM', 'SAM', 'Severe_Stunting'  →  'NORMAL', 'MAM', 'SAM'
    """
    s = str(label).strip().lower()
    if s == 'normal':
        return RiskLevel.NORMAL.value
    if s in ('mam', 'underweight'):
        return RiskLevel.MAM.value
    if s in ('sam', 'severe_stunting', 'severe stunting'):
        return RiskLevel.SAM.value
    return RiskLevel.NORMAL.value


def midwife_required(f):
    """Decorator: midwife role + active PHM area assignment required."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if user.role != UserRole.MIDWIFE.value:
            return jsonify({
                "status": "error",
                "message": "Access denied. Midwife role required."
            }), 403
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

    # Resolve midwife's PHM area from WorkerAreaMapping (authoritative)
    from backend.models_hierarchical import WorkerAreaMapping
    phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
        WorkerAreaMapping.user_id == user.id,
        WorkerAreaMapping.is_active == True,
        Area.level == AreaLevel.PHM.value
    ).first()

    if not phm_mapping:
        return jsonify({
            "status": "error",
            "message": "Your PHM area is not configured"
        }), 400

    midwife_phm_area_id = phm_mapping.area_id

    # Check if already assigned to another area
    if child.phm_area_id is not None and child.phm_area_id != midwife_phm_area_id:
        return jsonify({
            "status": "error",
            "message": "Child is already assigned to another PHM area. Cannot reassign."
        }), 400

    # Get area hierarchy
    try:
        hierarchy = get_area_hierarchy(midwife_phm_area_id)
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
    child.current_assigned_area_id = midwife_phm_area_id
    child.current_assigned_role = UserRole.MIDWIFE.value
    child.current_assigned_user_id = user.id
    child.assigned_date = datetime.now()
    child.status = "ACTIVE"
    child.is_draft = False

    db.session.flush()

    notify_phm_area(
        child.phm_area_id,
        title="Child assigned to PHM area",
        message=f"{child.child_unique_id or child.child_id} was assigned to your PHM area.",
        type="child_assigned",
        priority=PRIORITY_NORMAL,
        actor_user_id=user.id,
        related_child_id=child.id,
    )

    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        old_values={"phm_area_id": None},
        new_values={"phm_area_id": child.phm_area_id, "moh_area_id": child.moh_area_id},
        user_id=user.id,
        description=f"Assigned child {child.child_unique_id or child.child_id} to PHM area {midwife_phm_area_id}",
    )
    phm_area = db.session.get(Area, midwife_phm_area_id)
    send_child_event_email(
        child.guardian_email,
        child_name=child.name,
        child_identifier=child.child_unique_id or child.child_id,
        guardian_name=child.guardian_name,
        event_title="Child Assigned to Midwife Area",
        event_summary="Your child has been assigned to a PHM/midwife area for follow-up care.",
        details={
            "Assigned area": phm_area.name if phm_area else str(midwife_phm_area_id),
            "Assigned role": "Midwife",
            "Status": "Active follow-up",
        },
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
    
    # Build query - show ONLY children explicitly assigned to this midwife
    # (prevents hospital-registered/unassigned children from appearing)
    query = db.session.query(Child).filter(
        Child.current_assigned_role == UserRole.MIDWIFE.value,
        Child.current_assigned_user_id == user.id,
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

    # Accept both numeric DB id and string child_id/child_unique_id
    child = None
    if isinstance(child_id, int) or (isinstance(child_id, str) and child_id.isdigit()):
        child = db.session.get(Child, int(child_id))
    if not child:
        child = db.session.query(Child).filter(
            (Child.child_id == str(child_id)) | (Child.child_unique_id == str(child_id))
        ).first()
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

    sex = "M" if child.gender == "male" else "F"

    # Use real WHO Z-score computation from AI module
    try:
        wfa_z, hfa_z, wfh_z = ai_compute_z_scores(
            age_months=age_months, sex=sex,
            weight_kg=float(weight_kg), height_cm=float(height_cm)
        )
    except Exception:
        wfa_z = hfa_z = wfh_z = None

    # Run AI current-risk analysis
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

        # *** KEY FIX: model returns 'model_prediction', NOT 'risk_level' ***
        raw_label = ai_result.get("model_prediction", "Normal")
        current_risk = _normalize_ai_risk(raw_label)
        confidence = ai_result.get("confidence", 0.0)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"AI analysis error: {str(e)}"
        }), 500

    prediction_warning = None
    prediction_history_source = None
    try:
        future_payload = build_future_prediction_payload(
            child=child,
            weight_kg=float(weight_kg),
            height_cm=float(height_cm),
            measurement_date=datetime.now(),
            history_source="measurements",
        )
        prediction_warning = future_payload.get("warning")
        prediction_history_source = future_payload.get("history_source")
        if future_payload.get("ok"):
            future_result = predict_future_risk(future_payload["payload"])
            predicted_risk = future_result.get("predicted_risk_next_2_months") if future_result.get("ok") else None
        else:
            predicted_risk = None
    except Exception:
        prediction_warning = "Future prediction could not be generated from child history."
        predicted_risk = None

    # Get previous risk level for escalation check
    previous_risk = child.current_risk_level

    # Create measurement record
    measurement = Measurement(
        child_id=child.id,
        measurement_date=datetime.now(),
        weight_kg=Decimal(str(weight_kg)),
        height_cm=Decimal(str(height_cm)),
        muac_cm=Decimal(str(muac_cm)) if muac_cm else None,
        z_score_wfa=Decimal(str(round(wfa_z, 4))) if wfa_z is not None else None,
        z_score_hfa=Decimal(str(round(hfa_z, 4))) if hfa_z is not None else None,
        z_score_wfh=Decimal(str(round(wfh_z, 4))) if wfh_z is not None else None,
        risk_level=current_risk,
        predicted_risk_next_2_months=predicted_risk,
        model_confidence=Decimal(str(confidence)) if confidence else None,
        measured_by_user_id=user.id,
        notes=data.get("notes"),
    )

    db.session.add(measurement)
    db.session.flush()

    if current_risk in (RiskLevel.MAM.value, RiskLevel.SAM.value):
        notify_phm_area(
            child.phm_area_id,
            title="High-risk child follow-up",
            message=f"{child.child_unique_id or child.child_id} is now classified as {current_risk}.",
            type="ai_high_risk",
            priority=PRIORITY_CRITICAL if current_risk == RiskLevel.SAM.value else PRIORITY_HIGH,
            actor_user_id=user.id,
            related_child_id=child.id,
            metadata={"risk_level": current_risk, "measurement_id": measurement.id},
        )

    # ── Create Visit record so visit history is populated ──────────────────
    visit = Visit(
        child_id_fk=child.id,
        visit_date=datetime.now(),
        age_months=age_months,
        sex=sex,
        weight_kg=float(weight_kg),
        height_cm=float(height_cm),
        z_wfa=float(wfa_z) if wfa_z is not None else None,
        z_hfa=float(hfa_z) if hfa_z is not None else None,
        z_wfh=float(wfh_z) if wfh_z is not None else None,
        current_risk=current_risk,
        predicted_risk_next_2_months=predicted_risk,
        model_confidence=float(confidence) if confidence else None,
        notes=data.get("notes"),
        created_by_user_id=user.id,
    )
    db.session.add(visit)
    # ───────────────────────────────────────────────────────────────────────

    # Update child's current risk level
    child.current_risk_level = current_risk
    child.last_risk_update = datetime.now()

    # Check if escalation needed
    escalation_needed = should_escalate_to_moh(previous_risk, current_risk)

    log_audit(
        action="CREATE",
        entity_type="measurement",
        entity_id=measurement.id,
        new_values=measurement.to_dict(),
        user_id=user.id,
        description=f"Added measurement for child {child.child_unique_id or child.child_id}",
    )
    send_child_event_email(
        child.guardian_email,
        child_name=child.name,
        child_identifier=child.child_unique_id or child.child_id,
        guardian_name=child.guardian_name,
        event_title="Clinic Measurement Recorded",
        event_summary="A new growth measurement has been recorded for your child.",
        details={
            "Current nutrition status": current_risk,
            "Weight": f"{weight_kg} kg",
            "Height": f"{height_cm} cm",
            "MUAC": f"{muac_cm} cm" if muac_cm else None,
            "Future risk prediction": predicted_risk,
        },
    )

    db.session.commit()

    return jsonify({
        "status": "success",
        "message": "Measurement recorded successfully",
        "measurement": measurement.to_dict(),
        "child": child.to_dict(),
        "escalation_needed": escalation_needed,
        "previous_risk": previous_risk,
        "new_risk": current_risk,
        "future_prediction_warning": prediction_warning,
        "future_prediction_history_source": prediction_history_source,
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
    
    # Update child escalation status and move ownership to MOH so the child
    # disappears from the midwife's list (list_children filters on current_assigned_role)
    child.escalation_status = EscalationStatus.ESCALATED_TO_MOH.value
    child.current_assigned_role = UserRole.MOH.value

    db.session.flush()
    
    log_audit(
        action="CREATE",
        entity_type="escalation",
        entity_id=escalation.id,
        new_values=escalation.to_dict(),
        user_id=user.id,
        description=f"Escalated child {child.child_unique_id} to MOH",
    )
    send_child_event_email(
        child.guardian_email,
        child_name=child.name,
        child_identifier=child.child_unique_id or child.child_id,
        guardian_name=child.guardian_name,
        event_title="Child Referred to MOH Review",
        event_summary="Your child has been referred to the MOH team for further review and follow-up.",
        details={
            "Reason": escalation.reason,
            "Current nutrition status": child.current_risk_level,
            "Next step": "MOH review",
        },
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


@bp.route("/clinic-reports", methods=["GET"])
@midwife_required
def list_clinic_reports():
    """List all clinic reports submitted by this midwife, newest first."""
    user = get_current_user()
    phm_area_id = _get_midwife_phm_area_id(user)
    if phm_area_id is None:
        return jsonify({"status": "success", "reports": []}), 200

    reports = (
        db.session.query(ClinicReport)
        .filter(ClinicReport.phm_area_id == phm_area_id)
        .order_by(ClinicReport.report_year.desc(), ClinicReport.report_month.desc())
        .all()
    )
    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
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

    phm_area_id = _get_midwife_phm_area_id(user)
    if phm_area_id is None:
        return jsonify({
            "status": "error",
            "message": "Midwife has no PHM area assigned"
        }), 400

    report_month = data.get("report_month")
    report_year = data.get("report_year")

    if not report_month or not report_year:
        return jsonify({
            "status": "error",
            "message": "report_month (1-12) and report_year are required"
        }), 400

    # Check if report already exists
    existing = db.session.query(ClinicReport).filter(
        ClinicReport.phm_area_id == phm_area_id,
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
        Child.phm_area_id == phm_area_id,
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
            phm_area_id=phm_area_id,
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

    phm_area = db.session.get(Area, phm_area_id)
    notify_moh_area(
        phm_area.parent_id if phm_area else None,
        title="Clinic report submitted",
        message=f"PHM clinic report for {report_month}/{report_year} is ready for MOH review.",
        type="report_submitted",
        priority=PRIORITY_NORMAL,
        actor_user_id=user.id,
        related_report_id=report.id,
        metadata={"report_kind": "clinic", "phm_area_id": phm_area_id},
    )
    
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


def _get_midwife_phm_area_id(user):
    """Resolve midwife's PHM area from User.phm_area_id or WorkerAreaMapping."""
    if getattr(user, "phm_area_id", None) is not None:
        return user.phm_area_id
    from backend.models_hierarchical import WorkerAreaMapping
    phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
        WorkerAreaMapping.user_id == user.id,
        WorkerAreaMapping.is_active == True,
        Area.level == AreaLevel.PHM.value
    ).first()
    return phm_mapping.area_id if phm_mapping else None


@bp.route("/dashboard/stats", methods=["GET"])
@midwife_required
def get_dashboard_stats():
    """
    Get dashboard statistics for this midwife's currently assigned children.
    Filters by current_assigned_user_id so counts update immediately when
    a child is transferred to MOH or returned.
    """
    user = get_current_user()
    phm_area_id = _get_midwife_phm_area_id(user)

    # Count only children currently assigned to this midwife (matches list_children)
    children = db.session.query(Child).filter(
        Child.current_assigned_role == UserRole.MIDWIFE.value,
        Child.current_assigned_user_id == user.id,
    ).all()

    total = len(children)

    def _display_risk(c) -> str:
        """Use birth_risk_level as fallback when no measurement has been recorded yet."""
        if not c.last_risk_update and c.birth_risk_level:
            return (c.birth_risk_level or "").upper()
        return (c.current_risk_level or "NORMAL").upper()

    normal_count = sum(1 for c in children if _display_risk(c) == RiskLevel.NORMAL.value)
    mam_count = sum(1 for c in children if _display_risk(c) in (RiskLevel.MAM.value, RiskLevel.MODERATE.value, RiskLevel.HIGH.value))
    sam_count = sum(1 for c in children if _display_risk(c) in (RiskLevel.SAM.value, RiskLevel.CRITICAL.value))
    escalated_count = sum(1 for c in children if c.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value)

    # Recent measurements for this midwife's children only
    thirty_days_ago = datetime.now() - timedelta(days=30)
    child_ids = [c.id for c in children]
    recent_measurements = 0
    if child_ids:
        recent_measurements = db.session.query(Measurement).filter(
            Measurement.child_id.in_(child_ids),
            Measurement.measurement_date >= thirty_days_ago
        ).count()

    # Get predicted risk counts from the latest measurement per child
    predicted_sam_count = 0
    predicted_mam_count = 0
    if child_ids:
        latest_subq = (
            db.session.query(
                Measurement.child_id,
                db.func.max(Measurement.measurement_date).label("max_date"),
            )
            .filter(Measurement.child_id.in_(child_ids))
            .group_by(Measurement.child_id)
            .subquery()
        )
        preds = (
            db.session.query(Measurement.predicted_risk_next_2_months)
            .join(
                latest_subq,
                db.and_(
                    Measurement.child_id == latest_subq.c.child_id,
                    Measurement.measurement_date == latest_subq.c.max_date,
                ),
            )
            .filter(Measurement.predicted_risk_next_2_months.isnot(None))
            .all()
        )
        for (p,) in preds:
            if p and p.strip() == "Severe":
                predicted_sam_count += 1
            elif p and p.strip() in ("High", "Moderate"):
                predicted_mam_count += 1

    # Optional: resolve PHM area name/full path for frontend display
    phm_area_name = None
    phm_area_full_path = None
    if phm_area_id is not None:
        area = db.session.get(Area, phm_area_id)
        if area:
            phm_area_name = area.name
            try:
                phm_area_full_path = area.get_full_path()
            except Exception:
                phm_area_full_path = area.name

    return jsonify({
        "status": "success",
        "stats": {
            "total_children": total,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "escalated_cases": escalated_count,
            "recent_measurements_30days": recent_measurements,
            "predicted_sam_count": predicted_sam_count,
            "predicted_mam_count": predicted_mam_count,
        },
        "phm_area_id": phm_area_id,
        "phm_area_name": phm_area_name,
        "phm_area_full_path": phm_area_full_path,
    }), 200
