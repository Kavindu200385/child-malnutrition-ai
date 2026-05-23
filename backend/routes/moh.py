"""
MOH (Medical Officer of Health) Role Routes
Area-level clinical supervisor: midwife management, escalated children,
risk escalation to nutritionist, return to midwife, reports to RDHS.
Strict area isolation: all data filtered by moh_area_id.
"""
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import (
    get_current_user,
    moh_required,
    get_moh_area_ids,
    child_was_escalated_to_moh,
    user_can_access_child,
    ROLE_MOH,
    ROLE_AMOH,
)
from backend.extensions import db
from backend.models_hierarchical import (
    User,
    Child,
    Area,
    WorkerAreaMapping,
    ChildEscalation,
    ChildReferral,
    ReferralStatus,
    Measurement,
    Visit,
    MohReport,
    Hospital,
    UserRole,
    RiskLevel,
    EscalationStatus,
    EscalationRecordStatus,
    AreaLevel,
)
from backend.utils.audit import log_audit
from backend.utils.midwife_helpers import calculate_z_scores, should_escalate_to_moh
from backend.ai.predictor import predict_current_risk, predict_future_risk, compute_z_scores as ai_compute_z_scores

bp = Blueprint("moh", __name__, url_prefix="/api/moh")


def _normalize_ai_risk(label: str) -> str:
    """Map raw AI model output to standard DB risk strings."""
    s = str(label).strip().lower()
    if s == 'normal':
        return 'NORMAL'
    if s == 'mam':
        return 'MAM'
    if s in ('sam', 'severe_stunting', 'severe stunting'):
        return 'SAM'
    return 'NORMAL'


def _moh_area_ids_or_403():
    """Return MOH area IDs for current user or 403."""
    user = get_current_user()
    ids = get_moh_area_ids(user)
    if not ids:
        return None, jsonify({"status": "error", "message": "No MOH area assigned"}), 403
    return user, ids, None


def _child_in_moh_area(child: Child, moh_area_ids: list) -> bool:
    return child.moh_area_id is not None and child.moh_area_id in moh_area_ids


def _display_risk_level(child: Child) -> str:
    """
    Shared MOH/Nutritionist rule:
    - If there is NO clinic measurement yet (last_risk_update is null) but birth_risk_level exists,
      use birth_risk_level so SAM-at-birth shows correctly.
    - Otherwise use current_risk_level.
    """
    birth = (child.birth_risk_level or "").upper()
    current = (child.current_risk_level or "").upper()
    if not child.last_risk_update and birth:
        return birth
    if current:
        return current
    if birth:
        return birth
    return RiskLevel.NORMAL.value


# ---------------------------------------------------------------------------
# Add measurement (only for children sent by midwife / escalated to MOH)
# ---------------------------------------------------------------------------
@bp.route("/measurement/add", methods=["POST"])
@moh_required
def add_measurement():
    """
    Add measurement for a child. MOH can only add measurements for children
    that were sent (escalated) by a midwife to this MOH area.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    data = request.get_json() or {}
    child_id = data.get("child_id")
    if not child_id:
        return jsonify({"status": "error", "message": "child_id is required"}), 400

    child = db.session.get(Child, child_id)
    if not child:
        # Try by child_id string (child_unique_id)
        child = db.session.query(Child).filter(Child.child_id == str(child_id)).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "Access denied. Child is not in your MOH area."}), 403

    if not child_was_escalated_to_moh(child, moh_area_ids):
        return jsonify({
            "status": "error",
            "message": "You can only add measurements for children sent (escalated) by a midwife. This child has not been escalated to your area.",
        }), 403

    weight_kg = data.get("weight_kg")
    height_cm = data.get("height_cm")
    muac_cm = data.get("muac_cm")
    if not weight_kg or not height_cm:
        return jsonify({"status": "error", "message": "weight_kg and height_cm are required"}), 400

    if not child.dob:
        return jsonify({"status": "error", "message": "Child date of birth is required for measurement"}), 400

    age_days = (datetime.now().date() - child.dob).days
    age_months = age_days // 30
    sex = "M" if child.gender == "male" else "F"

    # Real WHO Z-scores
    try:
        wfa_z, hfa_z, wfh_z = ai_compute_z_scores(
            age_months=age_months, sex=sex,
            weight_kg=float(weight_kg), height_cm=float(height_cm)
        )
    except Exception:
        wfa_z = hfa_z = wfh_z = None

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
                "message": f"AI analysis failed: {ai_result.get('error', 'Unknown error')}",
            }), 500
        # KEY FIX: model returns 'model_prediction', not 'risk_level'
        current_risk = _normalize_ai_risk(ai_result.get("model_prediction", "Normal"))
        confidence = ai_result.get("confidence", 0.0)
    except Exception as e:
        return jsonify({"status": "error", "message": f"AI analysis error: {str(e)}"}), 500

    # Future risk prediction
    try:
        future_result = predict_future_risk({
            "age_months": age_months, "sex": sex,
            "weight_kg": float(weight_kg), "height_cm": float(height_cm),
        })
        predicted_risk = future_result.get("predicted_risk_next_2_months") if future_result.get("ok") else None
    except Exception:
        predicted_risk = None

    previous_risk = child.current_risk_level
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

    child.current_risk_level = current_risk
    child.last_risk_update = datetime.now()
    escalation_needed = should_escalate_to_moh(previous_risk, current_risk)

    log_audit(
        action="CREATE",
        entity_type="measurement",
        entity_id=measurement.id,
        new_values=measurement.to_dict(),
        user_id=user.id,
        description=f"MOH added measurement for child {child.child_unique_id}",
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
    }), 201


# ---------------------------------------------------------------------------
# Midwife transfer: release
# ---------------------------------------------------------------------------
@bp.route("/release-midwife/<int:midwife_id>", methods=["POST"])
@moh_required
def release_midwife(midwife_id: int):
    """
    Release a midwife from current MOH area (transfer out).
    Only if midwife.moh_id == logged-in MOH user id.
    Sets phm_area_id=NULL, moh_id=NULL, assignment_status='UNASSIGNED'.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    midwife = db.session.get(User, midwife_id)
    if not midwife:
        return jsonify({"status": "error", "message": "Midwife not found"}), 404
    if midwife.role not in (UserRole.MIDWIFE.value, "midwife"):
        return jsonify({"status": "error", "message": "User is not a midwife"}), 400
    # Only the MOH who manages this midwife can release
    if midwife.moh_id != user.id:
        return jsonify({"status": "error", "message": "You can only release midwives assigned to your area"}), 403

    midwife.phm_area_id = None
    midwife.moh_id = None
    midwife.assignment_status = "UNASSIGNED"
    # Deactivate worker area mappings for this user (PHM areas)
    db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == midwife.id,
        WorkerAreaMapping.is_active == True,
    ).update({"is_active": False})

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="user",
        entity_id=midwife.id,
        new_values={"assignment_status": "UNASSIGNED", "phm_area_id": None, "moh_id": None},
        user_id=user.id,
        description=f"MOH released midwife {midwife.username}",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Midwife released successfully",
        "midwife": midwife.to_dict(include_areas=True),
    }), 200


# ---------------------------------------------------------------------------
# Midwife transfer: search (by staff_id or NIC/username)
# ---------------------------------------------------------------------------
@bp.route("/search-midwife", methods=["GET"])
@moh_required
def search_midwife():
    """
    Search for an unassigned midwife by staff_id (or username).
    Returns midwife if found and assignment_status='UNASSIGNED'.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    staff_id = (request.args.get("staff_id") or request.args.get("q") or "").strip()
    if not staff_id:
        return jsonify({"status": "error", "message": "staff_id or q is required"}), 400

    midwife = db.session.query(User).filter(
        User.role == UserRole.MIDWIFE.value,
        (User.staff_id == staff_id) | (User.username == staff_id),
        User.is_active == True,
    ).first()

    if not midwife:
        return jsonify({"status": "error", "message": "Midwife not found"}), 404
    if (midwife.assignment_status or "ACTIVE") != "UNASSIGNED":
        return jsonify({
            "status": "error",
            "message": "Midwife is already assigned to an area",
            "midwife": midwife.to_dict(include_areas=True),
        }), 400

    return jsonify({
        "status": "success",
        "midwife": midwife.to_dict(include_areas=True),
    }), 200


# ---------------------------------------------------------------------------
# Midwife transfer: assign (to this MOH's area)
# ---------------------------------------------------------------------------
@bp.route("/assign-midwife/<int:midwife_id>", methods=["POST"])
@moh_required
def assign_midwife(midwife_id: int):
    """
    Assign an UNASSIGNED midwife to a PHM area under this MOH.
    Body: { "phm_area_id": <id> }.
    Prevents cross-district: phm_area must be under this MOH's area.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    data = request.get_json() or {}
    phm_area_id = data.get("phm_area_id")
    if not phm_area_id:
        return jsonify({"status": "error", "message": "phm_area_id is required"}), 400

    phm_area = db.session.get(Area, phm_area_id)
    if not phm_area or phm_area.level != AreaLevel.PHM.value or not phm_area.is_active:
        return jsonify({"status": "error", "message": "Invalid or inactive PHM area"}), 400
    # PHM parent must be this MOH's area (same district)
    if phm_area.parent_id not in moh_area_ids:
        return jsonify({"status": "error", "message": "PHM area is not under your MOH area (cross-district not allowed)"}), 403

    midwife = db.session.get(User, midwife_id)
    if not midwife:
        return jsonify({"status": "error", "message": "Midwife not found"}), 404
    if midwife.role not in (UserRole.MIDWIFE.value, "midwife"):
        return jsonify({"status": "error", "message": "User is not a midwife"}), 400
    if (midwife.assignment_status or "ACTIVE") != "UNASSIGNED":
        return jsonify({"status": "error", "message": "Midwife is already assigned"}), 400

    midwife.phm_area_id = phm_area_id
    midwife.moh_id = user.id
    midwife.assignment_status = "ACTIVE"

    # Ensure one WorkerAreaMapping for this PHM area
    existing = db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == midwife.id,
        WorkerAreaMapping.area_id == phm_area_id,
    ).first()
    if existing:
        existing.is_active = True
    else:
        db.session.add(WorkerAreaMapping(
            user_id=midwife.id,
            area_id=phm_area_id,
            is_active=True,
            created_by_id=user.id,
        ))

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="user",
        entity_id=midwife.id,
        new_values={"phm_area_id": phm_area_id, "moh_id": user.id, "assignment_status": "ACTIVE"},
        user_id=user.id,
        description=f"MOH assigned midwife {midwife.username} to PHM area {phm_area_id}",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Midwife assigned successfully",
        "midwife": midwife.to_dict(include_areas=True),
    }), 200


# ---------------------------------------------------------------------------
# Escalated children (to_role=MOH, status=PENDING, moh_id = MOH area)
# ---------------------------------------------------------------------------
@bp.route("/escalated-children", methods=["GET"])
@moh_required
def get_escalated_children():
    """
    List children escalated to MOH: child_escalations.to_role='MOH',
    escalation.moh_id in (MOH's area ids), status='PENDING'.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.PENDING.value,
    ).order_by(ChildEscalation.created_at.desc()).all()

    out = []
    for e in escalations:
        rec = e.to_dict()
        rec["child"] = e.child.to_dict(include_visits=True) if e.child else None
        if e.child:
            rec["measurements"] = [m.to_dict() for m in e.child.measurements[:50]]
        out.append(rec)

    return jsonify({
        "status": "success",
        "escalations": out,
        "count": len(out),
    }), 200


# ---------------------------------------------------------------------------
# Review escalation (add notes, mark REVIEWED)
# ---------------------------------------------------------------------------
@bp.route("/review-escalation/<int:child_id>", methods=["POST"])
@moh_required
def review_escalation(child_id: int):
    """
    MOH reviews an escalated child: add clinical notes, mark escalation as REVIEWED.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _child_in_moh_area(child, moh_area_ids):
        return jsonify({"status": "error", "message": "Child is not in your MOH area"}), 403

    # Latest PENDING escalation to MOH for this child
    escalation = db.session.query(ChildEscalation).filter(
        ChildEscalation.child_id == child_id,
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.PENDING.value,
    ).order_by(ChildEscalation.created_at.desc()).first()

    if not escalation:
        return jsonify({"status": "error", "message": "No pending escalation found for this child"}), 404

    data = request.get_json() or {}
    escalation.review_notes = data.get("review_notes") or escalation.review_notes
    escalation.status = EscalationRecordStatus.REVIEWED.value
    escalation.reviewed_by_user_id = user.id
    escalation.reviewed_at = datetime.utcnow()

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="escalation",
        entity_id=escalation.id,
        new_values=escalation.to_dict(),
        user_id=user.id,
        description=f"MOH reviewed escalation for child {child_id}",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Escalation reviewed",
        "escalation": escalation.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# Escalate child to Nutritionist (MAM→SAM or SAM remains)
# ---------------------------------------------------------------------------
@bp.route("/escalate-to-nutritionist/<int:child_id>", methods=["POST"])
@moh_required
def escalate_to_nutritionist(child_id: int):
    """
    Create referral to NUTRITIONIST; set child.escalation_status = ESCALATED_TO_NUTRITIONIST.
    hospital_id = hospital linked to MOH area (same district).
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _child_in_moh_area(child, moh_area_ids):
        return jsonify({"status": "error", "message": "Child is not in your MOH area"}), 403

    moh_area = db.session.get(Area, child.moh_area_id)
    district_name = moh_area.district if moh_area and moh_area.district else None
    hospital = None
    if district_name:
        hospital = db.session.query(Hospital).filter(
            Hospital.district == district_name,
            Hospital.is_active == True,
        ).first()
    if not hospital:
        return jsonify({"status": "error", "message": "No hospital linked to MOH area district for referral"}), 400

    data = request.get_json() or {}
    reason = data.get("reason", "Escalated from MOH - requires nutritionist review")

    referral = ChildReferral(
        child_id=child.id,
        referred_by_user_id=user.id,
        referred_to_role="nutritionist",
        hospital_id=hospital.id,
        status="PENDING",
        referral_reason=reason,
    )
    db.session.add(referral)
    child.escalation_status = EscalationStatus.ESCALATED_TO_NUTRITIONIST.value

    db.session.flush()
    log_audit(
        action="CREATE",
        entity_type="referral",
        entity_id=referral.id,
        new_values=referral.to_dict(),
        user_id=user.id,
        description=f"MOH escalated child {child_id} to nutritionist",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Child escalated to nutritionist",
        "referral": referral.to_dict(),
    }), 201


# ---------------------------------------------------------------------------
# Return child to midwife (downgrade risk: MAM/SAM → NORMAL)
# ---------------------------------------------------------------------------
@bp.route("/escalations/badge-count", methods=["GET"])
@moh_required
def escalations_badge_count():
    """Count of pending escalations (from midwife or nutritionist) for nav badge."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err
    count = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.PENDING.value,
    ).count()
    return jsonify({"status": "success", "pending_count": count}), 200


@bp.route("/assign-returned-child/<int:child_id>", methods=["POST"])
@moh_required
def assign_returned_child(child_id: int):
    """
    Accept a child returned from nutritionist and route them:
    - phm_area_id in body → assign to that PHM (midwife monitoring)
    - no phm_area_id → keep under MOH care
    Clears escalation_status, marks escalation REVIEWED.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _child_in_moh_area(child, moh_area_ids):
        return jsonify({"status": "error", "message": "Child is not in your MOH area"}), 403

    data = request.get_json() or {}
    phm_area_id = data.get("phm_area_id")

    escalation = db.session.query(ChildEscalation).filter(
        ChildEscalation.child_id == child_id,
        ChildEscalation.from_role == "nutritionist",
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.PENDING.value,
    ).order_by(ChildEscalation.created_at.desc()).first()

    if not escalation:
        return jsonify({"status": "error", "message": "No pending return request found for this child"}), 404

    child.escalation_status = EscalationStatus.NONE.value
    child.current_risk_level = RiskLevel.NORMAL.value

    if phm_area_id:
        phm_area = db.session.get(Area, phm_area_id)
        if not phm_area:
            return jsonify({"status": "error", "message": "PHM area not found"}), 404
        child.phm_area_id = phm_area_id
        child.current_assigned_role = "midwife"
        action_desc = f"assigned to PHM area {phm_area.name}"
    else:
        child.current_assigned_role = "moh"
        action_desc = "kept under MOH care"

    escalation.status = EscalationRecordStatus.REVIEWED.value
    escalation.reviewed_by_user_id = user.id
    escalation.reviewed_at = datetime.utcnow()
    escalation.review_notes = data.get("notes", "")

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        new_values=child.to_dict(),
        user_id=user.id,
        description=f"MOH accepted returned child {child_id} from nutritionist — {action_desc}",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": f"Child accepted and {action_desc}",
        "child": child.to_dict(),
    }), 200


@bp.route("/return-to-midwife/<int:child_id>", methods=["POST"])
@moh_required
def return_to_midwife(child_id: int):
    """
    Remove escalation; set child.current_risk_level='NORMAL', escalation_status='NONE'.
    Child remains in same PHM area.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _child_in_moh_area(child, moh_area_ids):
        return jsonify({"status": "error", "message": "Child is not in your MOH area"}), 403

    child.current_risk_level = RiskLevel.NORMAL.value
    child.escalation_status = EscalationStatus.NONE.value

    db.session.flush()
    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        new_values={"current_risk_level": "NORMAL", "escalation_status": "NONE"},
        user_id=user.id,
        description=f"MOH returned child {child_id} to midwife care",
    )
    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Child returned to midwife",
        "child": child.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# Area health worker management (midwives + nutritionists in MOH area)
# ---------------------------------------------------------------------------
@bp.route("/workers", methods=["GET"])
@moh_required
def list_area_workers():
    """
    List midwives in MOH area and nutritionists at hospital(s) in district.
    Midwives: User.role=midwife and (moh_id=current user or WorkerAreaMapping in PHM under MOH area).
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    # PHM areas under this MOH
    phm_ids = db.session.query(Area.id).filter(
        Area.parent_id.in_(moh_area_ids),
        Area.level == AreaLevel.PHM.value,
        Area.is_active == True,
    ).all()
    phm_ids = [r[0] for r in phm_ids]

    # Midwives: assigned to these PHM areas (via WorkerAreaMapping or User.phm_area_id/moh_id)
    midwife_ids_wa = set()
    if phm_ids:
        for row in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(phm_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all():
            midwife_ids_wa.add(row[0])
    midwife_ids_moh = set()
    for u in db.session.query(User.id).filter(
        User.role == UserRole.MIDWIFE.value,
        User.moh_id == user.id,
        User.is_active == True,
    ).all():
        midwife_ids_moh.add(u[0])
    all_midwife_ids = list(midwife_ids_wa | midwife_ids_moh)

    midwives = db.session.query(User).filter(
        User.id.in_(all_midwife_ids),
        User.is_active == True,
    ).all() if all_midwife_ids else []

    # Stats per midwife: total children, MAM, SAM, escalations
    def midwife_stats(mw: User):
        if mw.phm_area_id and mw.phm_area_id in phm_ids:
            area_filter = Child.phm_area_id == mw.phm_area_id
        else:
            area_filter = Child.moh_area_id.in_(moh_area_ids)
        children = db.session.query(Child).filter(
            area_filter,
            Child.status == "ACTIVE",
        ).all()
        total = len(children)
        mam = sum(1 for c in children if c.current_risk_level == RiskLevel.MAM.value)
        sam = sum(1 for c in children if c.current_risk_level == RiskLevel.SAM.value)
        esc = sum(1 for c in children if c.escalation_status == EscalationStatus.ESCALATED_TO_MOH.value)
        return {"total_children": total, "mam_count": mam, "sam_count": sam, "escalations_count": esc}

    midwife_list = []
    for mw in midwives:
        d = mw.to_dict(include_areas=True)
        d["stats"] = midwife_stats(mw)
        midwife_list.append(d)

    # Nutritionists: (1) assigned to this MOH area or its PHM areas via WorkerAreaMapping, or
    # (2) linked to a hospital in the same district as the MOH area (Area.district / Hospital.district match)
    nutritionist_ids = set()
    worker_area_ids = list(moh_area_ids) + list(phm_ids)
    if worker_area_ids:
        for row in db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().all():
            nutritionist_ids.add(row[0])
    moh_area = db.session.get(Area, moh_area_ids[0]) if moh_area_ids else None
    district_name = moh_area.district if moh_area and moh_area.district else None
    if district_name:
        hosp_ids = [r[0] for r in db.session.query(Hospital.id).filter(
            Hospital.district == district_name,
            Hospital.is_active == True,
        ).all()]
        if hosp_ids:
            for u in db.session.query(User).filter(
                User.role == UserRole.NUTRITIONIST.value,
                User.hospital_id.in_(hosp_ids),
                User.is_active == True,
            ).all():
                nutritionist_ids.add(u.id)
    nutritionists = []
    if nutritionist_ids:
        for u in db.session.query(User).filter(
            User.id.in_(list(nutritionist_ids)),
            User.role == UserRole.NUTRITIONIST.value,
            User.is_active == True,
        ).all():
            d = u.to_dict(include_areas=True)
            d["hospital_name"] = u.assigned_hospital.hospital_name if u.assigned_hospital else None
            children_under_care = db.session.query(ChildReferral).filter(
                ChildReferral.reviewed_by_user_id == u.id,
                ChildReferral.referred_to_role == "nutritionist",
                ChildReferral.status == ReferralStatus.REVIEWED.value,
            ).count()
            d["stats"] = {"children_under_care": children_under_care}
            nutritionists.append(d)

    return jsonify({
        "status": "success",
        "midwives": midwife_list,
        "nutritionists": nutritionists,
    }), 200


# ---------------------------------------------------------------------------
# Activate/Deactivate midwife (soft: is_active)
# ---------------------------------------------------------------------------
@bp.route("/workers/<int:worker_id>/activate", methods=["POST"])
@moh_required
def set_worker_active(worker_id: int):
    """Activate a midwife in MOH area."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err
    data = request.get_json() or {}
    active = data.get("active", True)
    worker = db.session.get(User, worker_id)
    if not worker:
        return jsonify({"status": "error", "message": "Worker not found"}), 404
    if worker.role not in (UserRole.MIDWIFE.value, UserRole.NUTRITIONIST.value):
        return jsonify({"status": "error", "message": "Not a midwife or nutritionist"}), 400
    if worker.role == UserRole.MIDWIFE.value:
        if worker.moh_id != user.id:
            if not worker.phm_area_id:
                return jsonify({"status": "error", "message": "Worker not in your area"}), 403
            phm = db.session.get(Area, worker.phm_area_id)
            if not phm or phm.parent_id not in moh_area_ids:
                return jsonify({"status": "error", "message": "Worker not in your area"}), 403
    else:
        # Nutritionist: allow only if in this MOH area (WorkerAreaMapping or hospital in district)
        phm_ids = [r[0] for r in db.session.query(Area.id).filter(
            Area.parent_id.in_(moh_area_ids),
            Area.level == AreaLevel.PHM.value,
            Area.is_active == True,
        ).all()]
        worker_area_ids = list(moh_area_ids) + list(phm_ids)
        in_area = db.session.query(WorkerAreaMapping).filter(
            WorkerAreaMapping.user_id == worker_id,
            WorkerAreaMapping.area_id.in_(worker_area_ids),
            WorkerAreaMapping.is_active == True,
        ).first() is not None
        if not in_area and worker.hospital_id:
            moh_area = db.session.get(Area, moh_area_ids[0]) if moh_area_ids else None
            district_name = moh_area.district if moh_area and moh_area.district else None
            if district_name:
                hosp = db.session.get(Hospital, worker.hospital_id)
                in_area = hosp and hosp.district == district_name
        if not in_area:
            return jsonify({"status": "error", "message": "Nutritionist not in your area"}), 403
    if worker.is_protected:
        return jsonify({"status": "error", "message": "Cannot change protected user"}), 403
    worker.is_active = bool(active)
    db.session.commit()
    return jsonify({"status": "success", "worker": worker.to_dict(include_areas=True)}), 200


# ---------------------------------------------------------------------------
# Monthly reports
# ---------------------------------------------------------------------------
@bp.route("/reports/monthly", methods=["GET"])
@moh_required
def get_monthly_reports():
    """List or generate monthly MOH reports for the area."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    month = request.args.get("month", type=int)
    year = request.args.get("year", type=int)
    if not year:
        year = datetime.utcnow().year
    if month and (month < 1 or month > 12):
        return jsonify({"status": "error", "message": "Invalid month"}), 400

    query = db.session.query(MohReport).filter(
        MohReport.moh_id == user.id,
        MohReport.moh_area_id.in_(moh_area_ids),
        MohReport.report_year == year,
    )
    if month:
        query = query.filter(MohReport.month == month)
    reports = query.order_by(MohReport.month.desc()).all()

    # If no report for current month and no month filter, create one
    if not month and not reports:
        now = datetime.utcnow()
        report = _generate_moh_report(user, moh_area_ids[0], now.month, now.year)
        if report:
            reports = [report]

    return jsonify({
        "status": "success",
        "reports": [r.to_dict() for r in reports],
    }), 200


@bp.route("/reports/summary", methods=["GET"])
@moh_required
def get_reports_summary():
    """
    Summary for an arbitrary date range (daily / weekly / monthly) for MOH area.
    Query params:
      - start_date: YYYY-MM-DD
      - end_date:   YYYY-MM-DD
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    start_str = request.args.get("start_date")
    end_str = request.args.get("end_date")
    if not start_str or not end_str:
        return jsonify({"status": "error", "message": "start_date and end_date are required (YYYY-MM-DD)"}), 400

    try:
        start_date = datetime.fromisoformat(start_str).date()
        end_date = datetime.fromisoformat(end_str).date()
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}), 400

    if end_date < start_date:
        return jsonify({"status": "error", "message": "end_date must be on or after start_date"}), 400

    # Children in this MOH area
    children = db.session.query(Child).filter(
        Child.moh_area_id.in_(moh_area_ids),
        Child.status == "ACTIVE",
    ).all()

    # Child IDs with measurements in the date range
    end_dt_exclusive = datetime.combine(end_date, datetime.max.time())
    start_dt_inclusive = datetime.combine(start_date, datetime.min.time())
    meas_child_ids = {
        row[0]
        for row in db.session.query(Measurement.child_id)
        .filter(
            Measurement.measurement_date >= start_dt_inclusive,
            Measurement.measurement_date <= end_dt_exclusive,
        )
        .distinct()
        .all()
    }

    # Select children that were active in the range: either created or measured in the window
    selected_children: list[Child] = []
    for c in children:
        in_range = False
        if c.created_at:
            created_date = c.created_at.date()
            if start_date <= created_date <= end_date:
                in_range = True
        if not in_range and c.id in meas_child_ids:
            in_range = True
        if in_range:
            selected_children.append(c)

    total_children = len(selected_children)
    normal_count = 0
    mam_count = 0
    sam_count = 0
    # Pre-compute latest measurement date per child inside the window
    latest_meas_map: dict[int, datetime] = {}
    if selected_children:
        child_ids = [c.id for c in selected_children]
        for m in (
            db.session.query(Measurement)
            .filter(
                Measurement.child_id.in_(child_ids),
                Measurement.measurement_date >= start_dt_inclusive,
                Measurement.measurement_date <= end_dt_exclusive,
            )
            .order_by(Measurement.child_id, Measurement.measurement_date.desc())
            .all()
        ):
            if m.child_id not in latest_meas_map:
                latest_meas_map[m.child_id] = m.measurement_date

    children_output: list[dict] = []
    for c in selected_children:
        r = _display_risk_level(c)
        if r == RiskLevel.NORMAL.value:
            normal_count += 1
        elif r == RiskLevel.MAM.value:
            mam_count += 1
        elif r == RiskLevel.SAM.value:
            sam_count += 1
        lm = latest_meas_map.get(c.id)
        children_output.append(
            {
                "id": c.id,
                "child_unique_id": c.child_unique_id or c.child_id,
                "name": c.name,
                "dob": c.dob.isoformat() if c.dob else None,
                "gender": c.gender,
                "display_risk_level": r,
                "last_measurement_date": lm.isoformat() if lm else None,
            }
        )

    escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.created_at >= start_dt_inclusive,
        ChildEscalation.created_at <= end_dt_exclusive,
    ).count()

    referrals_to_nutritionist = db.session.query(ChildReferral).join(
        Child, Child.id == ChildReferral.child_id
    ).filter(
        ChildReferral.referred_to_role == "nutritionist",
        ChildReferral.created_at >= start_dt_inclusive,
        ChildReferral.created_at <= end_dt_exclusive,
        Child.moh_area_id.in_(moh_area_ids),
    ).count()

    return jsonify(
        {
            "status": "success",
            "summary": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "total_children": total_children,
                "normal_count": normal_count,
                "mam_count": mam_count,
                "sam_count": sam_count,
                "escalations": escalations,
                "referrals_to_nutritionist": referrals_to_nutritionist,
                "children": children_output,
            },
        }
    ), 200


def _generate_moh_report(moh_user: User, moh_area_id: int, month: int, year: int) -> MohReport | None:
    """Create a MohReport for the given month/year."""
    children = db.session.query(Child).filter(
        Child.moh_area_id == moh_area_id,
        Child.status == "ACTIVE",
    ).all()
    total = len(children)
    normal = sum(1 for c in children if c.current_risk_level == RiskLevel.NORMAL.value)
    mam = sum(1 for c in children if c.current_risk_level == RiskLevel.MAM.value)
    sam = sum(1 for c in children if c.current_risk_level == RiskLevel.SAM.value)
    esc = sum(1 for c in children if c.escalation_status and c.escalation_status != EscalationStatus.NONE.value)
    report = MohReport(
        moh_id=moh_user.id,
        moh_area_id=moh_area_id,
        total_children=total,
        normal_count=normal,
        mam_count=mam,
        sam_count=sam,
        total_escalations=esc,
        month=month,
        report_year=year,
        sent_to_rdhs=False,
    )
    db.session.add(report)
    db.session.commit()
    return report


@bp.route("/reports/monthly/generate", methods=["POST"])
@moh_required
def generate_monthly_report():
    """Generate monthly report for current month (or body month/year)."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err
    data = request.get_json() or {}
    now = datetime.utcnow()
    month = data.get("month") or now.month
    year = data.get("year") or now.year
    if month < 1 or month > 12:
        return jsonify({"status": "error", "message": "Invalid month"}), 400
    existing = db.session.query(MohReport).filter(
        MohReport.moh_id == user.id,
        MohReport.moh_area_id == moh_area_ids[0],
        MohReport.month == month,
        MohReport.report_year == year,
    ).first()
    if existing:
        return jsonify({"status": "success", "report": existing.to_dict()}), 200
    report = _generate_moh_report(user, moh_area_ids[0], month, year)
    return jsonify({"status": "success", "report": report.to_dict()}), 201


@bp.route("/send-report-to-rdhs/<int:report_id>", methods=["POST"])
@moh_required
def send_report_to_rdhs(report_id: int):
    """Mark report as sent to RDHS."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err
    report = db.session.get(MohReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404
    if report.moh_id != user.id or report.moh_area_id not in moh_area_ids:
        return jsonify({"status": "error", "message": "Report not in your area"}), 403
    report.sent_to_rdhs = True
    report.sent_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()}), 200


# ---------------------------------------------------------------------------
# MOH areas and PHM areas (for assign dropdown)
# ---------------------------------------------------------------------------
@bp.route("/areas", methods=["GET"])
@moh_required
def get_moh_areas():
    """Return MOH areas and child PHM areas for the current MOH (for transfer/assign UI)."""
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err
    moh_areas = db.session.query(Area).filter(
        Area.id.in_(moh_area_ids),
        Area.is_active == True,
    ).all()
    phm_areas = db.session.query(Area).filter(
        Area.parent_id.in_(moh_area_ids),
        Area.level == AreaLevel.PHM.value,
        Area.is_active == True,
    ).order_by(Area.name).all()
    return jsonify({
        "status": "success",
        "moh_areas": [a.to_dict() for a in moh_areas],
        "phm_areas": [a.to_dict() for a in phm_areas],
    }), 200


# ---------------------------------------------------------------------------
# MOH dashboard summary
# ---------------------------------------------------------------------------
@bp.route("/dashboard", methods=["GET"])
@moh_required
def moh_dashboard():
    """
    Dashboard: total children, Normal/MAM/SAM, pending escalations,
    midwife performance summary, nutritionist referral summary.
    """
    user, moh_area_ids, err = _moh_area_ids_or_403()
    if err:
        return err

    now = datetime.utcnow()
    cur_year = now.year
    cur_month = now.month

    children = db.session.query(Child).filter(
        Child.moh_area_id.in_(moh_area_ids),
        Child.status == "ACTIVE",
    ).all()
    total_children = len(children)
    normal_count = 0
    mam_count = 0
    sam_count = 0
    high_risk_children: list[dict] = []
    for c in children:
        r = _display_risk_level(c)
        if r == RiskLevel.NORMAL.value:
            normal_count += 1
        elif r == RiskLevel.MAM.value:
            mam_count += 1
        elif r == RiskLevel.SAM.value:
            sam_count += 1
        if r in (RiskLevel.MAM.value, RiskLevel.SAM.value):
            high_risk_children.append({"child": c})
    pending_escalations = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.PENDING.value,
    ).count()
    referrals_to_nutritionist = db.session.query(Child).filter(
        Child.moh_area_id.in_(moh_area_ids),
        Child.escalation_status == EscalationStatus.ESCALATED_TO_NUTRITIONIST.value,
    ).count()

    # New children registered in this month for this MOH area
    new_children_month = db.session.query(Child).filter(
        Child.moh_area_id.in_(moh_area_ids),
        Child.status == "ACTIVE",
        Child.created_at.isnot(None),
        db.extract("year", Child.created_at) == cur_year,
        db.extract("month", Child.created_at) == cur_month,
    ).count()

    # New escalations to MOH created in this month
    new_escalations_month = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.created_at.isnot(None),
        db.extract("year", ChildEscalation.created_at) == cur_year,
        db.extract("month", ChildEscalation.created_at) == cur_month,
    ).count()

    # Escalations reviewed/resolved this month
    resolved_escalations_month = db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
        ChildEscalation.status == EscalationRecordStatus.REVIEWED.value,
        ChildEscalation.reviewed_at.isnot(None),
        db.extract("year", ChildEscalation.reviewed_at) == cur_year,
        db.extract("month", ChildEscalation.reviewed_at) == cur_month,
    ).count()

    phm_ids = [r[0] for r in db.session.query(Area.id).filter(
        Area.parent_id.in_(moh_area_ids),
        Area.level == AreaLevel.PHM.value,
        Area.is_active == True,
    ).all()]
    midwife_count = 0
    if phm_ids:
        midwife_count = db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(phm_ids),
            WorkerAreaMapping.is_active == True,
        ).distinct().count()
    midwife_count += db.session.query(User).filter(
        User.role == UserRole.MIDWIFE.value,
        User.moh_id == user.id,
        User.is_active == True,
    ).count()

    # Build a simple monthly trend of escalations/referrals for charts
    from collections import defaultdict

    monthly = defaultdict(lambda: {"year": None, "month": None, "escalations": 0, "to_nutritionist": 0})
    for esc in db.session.query(ChildEscalation).filter(
        ChildEscalation.to_role == "moh",
        ChildEscalation.moh_id.in_(moh_area_ids),
    ).all():
        if not esc.created_at:
            continue
        y, m = esc.created_at.year, esc.created_at.month
        key = (y, m)
        monthly[key]["year"] = y
        monthly[key]["month"] = m
        monthly[key]["escalations"] += 1
    for ref in db.session.query(ChildReferral).filter(
        ChildReferral.referred_to_role == "nutritionist",
    ).all():
        if not ref.created_at:
            continue
        # Only count referrals for children in this MOH area
        child = db.session.get(Child, ref.child_id)
        if not child or child.moh_area_id not in moh_area_ids:
            continue
        y, m = ref.created_at.year, ref.created_at.month
        key = (y, m)
        monthly[key]["year"] = y
        monthly[key]["month"] = m
        monthly[key]["to_nutritionist"] += 1

    monthly_trend = []
    for (y, m), row in sorted(monthly.items(), key=lambda x: (x[0][0], x[0][1])):
        monthly_trend.append(
            {
                "year": y,
                "month": m,
                "label": f"{y}-{m:02d}",
                "escalations": row["escalations"],
                "to_nutritionist": row["to_nutritionist"],
            }
        )

    # Get predicted risk counts from the latest measurement per child
    predicted_sam_count = 0
    predicted_mam_count = 0
    child_ids = [c.id for c in children]
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

    # Prepare compact high-risk children (top 5)
    high_risk_output: list[dict] = []
    for entry in high_risk_children:
        c: Child = entry["child"]
        # Latest measurement date (if any)
        last_m = (
            db.session.query(Measurement)
            .filter(Measurement.child_id == c.id)
            .order_by(Measurement.measurement_date.desc())
            .first()
        )
        high_risk_output.append(
            {
                "id": c.id,
                "child_unique_id": c.child_unique_id or c.child_id,
                "name": c.name,
                "display_risk_level": _display_risk_level(c),
                "last_measurement_date": last_m.measurement_date.isoformat()
                if last_m and last_m.measurement_date
                else None,
            }
        )
    # Sort by last_measurement_date (most recent first), then created_at
    def _sort_key(row: dict):
        lm = row.get("last_measurement_date")
        try:
            lm_val = datetime.fromisoformat(lm) if lm else datetime.min
        except Exception:
            lm_val = datetime.min
        return (lm_val, row.get("id") or 0)

    high_risk_output = sorted(high_risk_output, key=_sort_key, reverse=True)[:5]

    return jsonify(
        {
            "status": "success",
            "dashboard": {
                "total_children": total_children,
                "normal_count": normal_count,
                "mam_count": mam_count,
                "sam_count": sam_count,
                "pending_escalations": pending_escalations,
                "referrals_to_nutritionist": referrals_to_nutritionist,
                "midwife_count": midwife_count,
                "monthly_trend": monthly_trend[-12:],
                "new_children_month": new_children_month,
                "new_escalations_month": new_escalations_month,
                "resolved_escalations_month": resolved_escalations_month,
                "high_risk_children": high_risk_output,
                "predicted_sam_count": predicted_sam_count,
                "predicted_mam_count": predicted_mam_count,
            },
        }
    ), 200
