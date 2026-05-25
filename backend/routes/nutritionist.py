"""
NUTRITIONIST Role Routes
Strict specialist-level clinical reviewer:
- View children referred from MOH only (hospital-based)
- View full child history, add measurements, run AI, add notes
- Return child to MOH when risk = NORMAL only
- Dashboard with charts
"""
from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict

from flask import Blueprint, jsonify, request

from sqlalchemy import desc, case

from backend.auth_utils_hierarchical import get_current_user, nutritionist_required, user_can_access_child
from backend.extensions import db
from backend.models_hierarchical import (
    User,
    Child,
    Measurement,
    Visit,
    ChildReferral,
    ChildEscalation,
    AuditLog,
    UserRole,
    RiskLevel,
    EscalationStatus,
    ReferralStatus,
)
from backend.ai.predictor import predict_current_risk, predict_future_risk, compute_z_scores
from backend.utils.audit import log_audit

bp = Blueprint("nutritionist", __name__, url_prefix="/api/nutritionist")


def _display_risk_level(child: Child) -> str:
    """
    Unified risk value for all nutritionist views.
    Rule:
    - If there is NO clinic measurement yet (last_risk_update is null) but birth_risk_level exists,
      then use birth_risk_level (so SAM-at-birth shows as SAM until first visit).
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


def _nutritionist_can_access_child(user, child):
    """View access: child was ever referred to this nutritionist's hospital (any status)."""
    if not user or user.role != UserRole.NUTRITIONIST.value or not user.hospital_id:
        return False
    ref = db.session.query(ChildReferral).filter(
        ChildReferral.child_id == child.id,
        ChildReferral.hospital_id == user.hospital_id,
        ChildReferral.referred_to_role == "nutritionist",
    ).first()
    return ref is not None


def _nutritionist_can_add_measurement(user, child):
    """Write access: only allowed while child is actively under nutritionist care."""
    if not user or user.role != UserRole.NUTRITIONIST.value or not user.hospital_id:
        return False
    if (child.escalation_status or "") != EscalationStatus.ESCALATED_TO_NUTRITIONIST.value:
        return False
    ref = db.session.query(ChildReferral).filter(
        ChildReferral.child_id == child.id,
        ChildReferral.hospital_id == user.hospital_id,
        ChildReferral.referred_to_role == "nutritionist",
        ChildReferral.status == ReferralStatus.REVIEWED.value,
    ).first()
    return ref is not None


def _map_ai_risk(pred: str) -> str:
    """Map AI model_prediction to RiskLevel enum value."""
    s = (pred or "").strip().upper()
    if s in ("NORMAL", "NORM"):
        return RiskLevel.NORMAL.value
    if s == "MAM":
        return RiskLevel.MAM.value
    if s in ("SAM", "SEVERE_STUNTING", "SEVERE"):
        return RiskLevel.SAM.value
    return RiskLevel.NORMAL.value


# ---------------------------------------------------------------------------
# GET /api/nutritionist/referred-children
# ---------------------------------------------------------------------------
@bp.route("/referred-children", methods=["GET"])
@nutritionist_required
def referred_children():
    """
    List children referred to this nutritionist (hospital_id filter).
    Only ChildReferral with referred_to_role='nutritionist' and hospital_id=user.hospital_id.
    """
    user = get_current_user()
    refs = (
        db.session.query(ChildReferral, Child)
        .join(Child, Child.id == ChildReferral.child_id)
        .filter(
            ChildReferral.hospital_id == user.hospital_id,
            ChildReferral.referred_to_role == "nutritionist",
            ChildReferral.status == ReferralStatus.REVIEWED.value,
        )
        .order_by(
            desc(ChildReferral.created_at),
        )
        .all()
    )
    out = []
    for ref, child in refs:
        last_m = (
            db.session.query(Measurement)
            .filter(Measurement.child_id == child.id)
            .order_by(Measurement.measurement_date.desc())
            .first()
        )
        display_risk = _display_risk_level(child)
        is_escalated = (child.escalation_status or "") == EscalationStatus.ESCALATED_TO_NUTRITIONIST.value
        pending_return = db.session.query(ChildEscalation).filter(
            ChildEscalation.child_id == child.id,
            ChildEscalation.from_role == "nutritionist",
            ChildEscalation.to_role == "moh",
            ChildEscalation.status == "PENDING",
        ).first() is not None
        is_active = is_escalated and not pending_return
        out.append({
            "child": child.to_dict(),
            "referral": ref.to_dict(),
            "current_risk_level": child.current_risk_level,
            "birth_risk_level": child.birth_risk_level,
            "display_risk_level": display_risk,
            "escalation_status": child.escalation_status,
            "is_active": is_active,
            "pending_moh_return": pending_return,
            "last_measurement_date": last_m.measurement_date.isoformat() if last_m and last_m.measurement_date else None,
            "last_measurement_confidence": float(last_m.model_confidence) if last_m and last_m.model_confidence else None,
        })
    # Active cases first, then returned-to-MOH cases
    out.sort(key=lambda x: (0 if x["is_active"] else 1))
    return jsonify({"status": "success", "children": out}), 200


# ---------------------------------------------------------------------------
# GET /api/nutritionist/child/<child_id>
# ---------------------------------------------------------------------------
@bp.route("/child/<int:child_id>", methods=["GET"])
@nutritionist_required
def get_child(child_id: int):
    """
    Full child history for a referred child. Strict hospital_id filter.
    """
    user = get_current_user()
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _nutritionist_can_access_child(user, child):
        return jsonify({"status": "error", "message": "Access denied. Child not referred to your hospital."}), 403

    measurements = (
        db.session.query(Measurement)
        .filter(Measurement.child_id == child.id)
        .order_by(Measurement.measurement_date.desc())
        .all()
    )
    referrals = (
        db.session.query(ChildReferral)
        .filter(ChildReferral.child_id == child.id, ChildReferral.hospital_id == user.hospital_id)
        .order_by(ChildReferral.created_at.desc())
        .all()
    )
    escalations = (
        db.session.query(ChildEscalation)
        .filter(ChildEscalation.child_id == child.id)
        .order_by(ChildEscalation.created_at.desc())
        .all()
    )

    # Log this review so it appears in child history and counts toward nutritionist performance
    log_audit(
        action="NUTRITIONIST_REVIEW",
        entity_type="child",
        entity_id=child.id,
        user_id=user.id,
        description=f"Nutritionist {user.name} reviewed child record",
    )
    db.session.commit()

    # Fetch review history for this child (most recent 20)
    review_logs = (
        db.session.query(AuditLog)
        .filter(
            AuditLog.action == "NUTRITIONIST_REVIEW",
            AuditLog.entity_id == child.id,
            AuditLog.entity_type == "child",
        )
        .order_by(AuditLog.created_at.desc())
        .limit(20)
        .all()
    )

    is_escalated = (child.escalation_status or "") == EscalationStatus.ESCALATED_TO_NUTRITIONIST.value
    pending_return = db.session.query(ChildEscalation).filter(
        ChildEscalation.child_id == child.id,
        ChildEscalation.from_role == "nutritionist",
        ChildEscalation.to_role == "moh",
        ChildEscalation.status == "PENDING",
    ).first() is not None
    is_active = is_escalated and not pending_return

    return jsonify({
        "status": "success",
        "child": child.to_dict(),
        "is_active": is_active,
        "pending_moh_return": pending_return,
        "measurements": [m.to_dict() for m in measurements],
        "referrals": [r.to_dict() for r in referrals],
        "escalations": [e.to_dict() for e in escalations],
        "z_scores_history": [
            {
                "measurement_id": m.id,
                "date": m.measurement_date.isoformat() if m.measurement_date else None,
                "z_wfa": float(m.z_score_wfa) if m.z_score_wfa else None,
                "z_hfa": float(m.z_score_hfa) if m.z_score_hfa else None,
                "z_wfh": float(m.z_score_wfh) if m.z_score_wfh else None,
                "risk_level": m.risk_level,
            }
            for m in measurements
        ],
        "review_logs": [
            {
                "id": log.id,
                "reviewed_by_user_id": log.user_id,
                "reviewed_by_name": log.user.name if log.user else "Unknown",
                "reviewed_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in review_logs
        ],
    }), 200


# ---------------------------------------------------------------------------
# POST /api/nutritionist/measurement/add
# ---------------------------------------------------------------------------
@bp.route("/measurement/add", methods=["POST"])
@nutritionist_required
def add_measurement():
    """
    Add specialist measurement. Calculates Z-scores, runs AI, updates child risk.
    No UPDATE/DELETE of old measurements.
    """
    user = get_current_user()
    data = request.get_json() or {}

    child_id = data.get("child_id")
    if not child_id:
        return jsonify({"status": "error", "message": "child_id is required"}), 400

    child = db.session.get(Child, int(child_id))
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _nutritionist_can_add_measurement(user, child):
        return jsonify({
            "status": "error",
            "message": "Cannot add measurement. This child has been returned to MOH and is no longer under nutritionist care."
        }), 403

    weight_kg = data.get("weight_kg") or data.get("weight")
    height_cm = data.get("height_cm") or data.get("height")
    muac_cm = data.get("muac_cm") or data.get("muac")
    measurement_date = data.get("measurement_date")
    specialist_notes = data.get("specialist_notes") or data.get("notes")

    if not weight_kg or not height_cm:
        return jsonify({"status": "error", "message": "weight_kg and height_cm are required"}), 400

    if not child.dob:
        return jsonify({"status": "error", "message": "Child DOB required"}), 400

    try:
        weight_kg = float(weight_kg)
        height_cm = float(height_cm)
        muac_cm = float(muac_cm) if muac_cm is not None else None
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Invalid numeric values"}), 400

    age_days = (datetime.now().date() - child.dob).days
    age_months = max(0, age_days // 30)
    sex = "M" if (child.gender or "").lower() == "male" else "F"

    try:
        z_wfa, z_hfa, z_wfh = compute_z_scores(age_months=age_months, sex=sex, weight_kg=weight_kg, height_cm=height_cm)
    except Exception:
        z_wfa = z_hfa = z_wfh = None

    try:
        ai_result = predict_current_risk({
            "age_months": age_months,
            "sex": sex,
            "weight_kg": weight_kg,
            "height_cm": height_cm,
        })
        if not ai_result.get("ok"):
            return jsonify({"status": "error", "message": ai_result.get("error", "AI analysis failed")}), 500
        current_risk = _map_ai_risk(ai_result.get("model_prediction", ""))
        confidence = ai_result.get("confidence") or 0.0
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    m_date = datetime.now()
    if measurement_date:
        try:
            m_date = datetime.fromisoformat(measurement_date.replace("Z", "+00:00"))
            if m_date.tzinfo:
                m_date = m_date.replace(tzinfo=None)
        except Exception:
            pass

    measurement = Measurement(
        child_id=child.id,
        measurement_date=m_date,
        weight_kg=Decimal(str(weight_kg)),
        height_cm=Decimal(str(height_cm)),
        muac_cm=Decimal(str(muac_cm)) if muac_cm is not None else None,
        z_score_wfa=Decimal(str(z_wfa)) if z_wfa is not None else None,
        z_score_hfa=Decimal(str(z_hfa)) if z_hfa is not None else None,
        z_score_wfh=Decimal(str(z_wfh)) if z_wfh is not None else None,
        risk_level=current_risk,
        predicted_risk_next_2_months=ai_result.get("model_prediction"),
        model_confidence=Decimal(str(confidence)),
        measured_by_user_id=user.id,
        notes=specialist_notes,
    )
    db.session.add(measurement)
    db.session.flush()

    child.current_risk_level = current_risk
    child.last_risk_update = datetime.now()

    # ── Create Visit record so visit history is populated ──────────────────
    try:
        future_result = predict_future_risk({
            "age_months": age_months,
            "sex": sex,
            "weight_kg": weight_kg,
            "height_cm": height_cm,
        })
        predicted_risk = future_result.get("predicted_risk_next_2_months") if future_result.get("ok") else None
    except Exception:
        predicted_risk = None

    visit = Visit(
        child_id_fk=child.id,
        visit_date=m_date,
        age_months=age_months,
        sex=sex,
        weight_kg=weight_kg,
        height_cm=height_cm,
        z_wfa=z_wfa,
        z_hfa=z_hfa,
        z_wfh=z_wfh,
        current_risk=current_risk,
        predicted_risk_next_2_months=predicted_risk,
        model_confidence=float(confidence) if confidence else None,
        notes=specialist_notes,
        created_by_user_id=user.id,
    )
    db.session.add(visit)
    # ───────────────────────────────────────────────────────────────────────

    db.session.commit()
    log_audit(
        action="CREATE",
        entity_type="measurement",
        entity_id=measurement.id,
        new_values=measurement.to_dict(),
        user_id=user.id,
        description=f"Nutritionist added measurement for child {child.id}",
    )

    return jsonify({
        "status": "success",
        "message": "Measurement recorded",
        "measurement": measurement.to_dict(),
        "child": child.to_dict(),
        "new_risk": current_risk,
        "confidence": confidence,
    }), 201


# ---------------------------------------------------------------------------
# POST /api/nutritionist/return-to-moh/<child_id>
# ---------------------------------------------------------------------------
@bp.route("/return-to-moh/<int:child_id>", methods=["POST"])
@nutritionist_required
def return_to_moh(child_id: int):
    """
    Return child to MOH only when current_risk_level = NORMAL.
    Updates child, referral status, escalation status. Transaction.
    """
    user = get_current_user()
    child = db.session.get(Child, child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    if not _nutritionist_can_access_child(user, child):
        return jsonify({"status": "error", "message": "Access denied"}), 403

    if (child.current_risk_level or "").upper() not in ("NORMAL",):
        return jsonify({
            "status": "error",
            "message": "Return to MOH only allowed when risk is NORMAL. Current risk: " + (child.current_risk_level or "unknown"),
        }), 400

    try:
        # Don't change escalation_status yet — MOH must accept first.
        # Create a pending escalation record so MOH sees this in their "Incoming Transfers" queue.
        moh_area_id = child.moh_area_id

        # Fallback: derive MOH area from the nutritionist's hospital district if not already set
        if not moh_area_id and user.hospital_id:
            from backend.models_hierarchical import Hospital, Area as _Area
            hospital = db.session.get(Hospital, user.hospital_id)
            if hospital and hospital.district:
                moh_fallback = db.session.query(_Area).filter(
                    _Area.level == "moh",
                    _Area.district == hospital.district,
                    _Area.is_active == True,
                ).first()
                if moh_fallback:
                    moh_area_id = moh_fallback.id
                    child.moh_area_id = moh_area_id  # persist for future use

        if not moh_area_id:
            return jsonify({"status": "error", "message": "Child has no MOH area set and none could be derived from your hospital"}), 400

        # Prevent duplicate pending returns
        existing = db.session.query(ChildEscalation).filter(
            ChildEscalation.child_id == child.id,
            ChildEscalation.from_role == "nutritionist",
            ChildEscalation.to_role == "moh",
            ChildEscalation.status == "PENDING",
        ).first()
        if existing:
            return jsonify({"status": "error", "message": "A return request is already pending MOH review"}), 400

        escalation = ChildEscalation(
            child_id=child.id,
            escalated_by_user_id=user.id,
            from_role="nutritionist",
            to_role="moh",
            moh_id=moh_area_id,
            reason=request.get_json(silent=True, force=True).get("reason", "Child recovered — ready for PHM monitoring") if request.is_json else "Child recovered — ready for PHM monitoring",
            previous_risk_level=child.current_risk_level,
            new_risk_level=RiskLevel.NORMAL.value,
            status="PENDING",
        )
        db.session.add(escalation)
        db.session.flush()
        log_audit(
            action="CREATE",
            entity_type="escalation",
            entity_id=escalation.id,
            new_values=escalation.to_dict(),
            user_id=user.id,
            description=f"Nutritionist sent return request for child {child_id} to MOH",
        )
        db.session.commit()
        return jsonify({
            "status": "success",
            "message": "Return request sent to MOH. Child will be assigned once MOH reviews.",
            "child": child.to_dict(),
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500


# ---------------------------------------------------------------------------
# GET /api/nutritionist/dashboard-summary
# ---------------------------------------------------------------------------
@bp.route("/dashboard-summary", methods=["GET"])
@nutritionist_required
def dashboard_summary():
    """
    Dashboard stats for charts: total referred, pending, reviewed, risk distribution,
    monthly referrals, improvement stats.
    """
    user = get_current_user()
    hospital_id = user.hospital_id
    if not hospital_id:
        return jsonify({"status": "error", "message": "Hospital not linked"}), 403

    all_refs = (
        db.session.query(ChildReferral)
        .filter(
            ChildReferral.hospital_id == hospital_id,
            ChildReferral.referred_to_role == "nutritionist",
        )
        .all()
    )

    # Only accepted (REVIEWED) referrals count as "saved to your DB"
    accepted_refs = [r for r in all_refs if r.status == ReferralStatus.REVIEWED.value]
    pending_transfers = sum(1 for r in all_refs if r.status == ReferralStatus.PENDING.value)

    accepted_child_ids = list({r.child_id for r in accepted_refs})
    if not accepted_child_ids:
        return jsonify({
            "status": "success",
            "dashboard": {
                "total_referred": len(accepted_refs),
                "pending_transfers": pending_transfers,
                "pending_cases": 0,
                "reviewed_cases": 0,
                "normal_count": 0,
                "mam_count": 0,
                "sam_count": 0,
                "monthly_referrals": [],
                "improvement_stats": {"improved": 0, "not_improved": 0, "pending_review": 0},
            },
        }), 200

    children = db.session.query(Child).filter(Child.id.in_(accepted_child_ids)).all()
    child_map = {c.id: c for c in children}

    # Among accepted referrals, count pending (not yet acted on by nutritionist) vs reviewed
    pending_cases = sum(1 for r in accepted_refs if (child_map.get(r.child_id) and
                        (child_map[r.child_id].escalation_status or "") == EscalationStatus.ESCALATED_TO_NUTRITIONIST.value))
    reviewed_cases = sum(1 for r in accepted_refs if (child_map.get(r.child_id) and
                         (child_map[r.child_id].current_risk_level or "").upper() == "NORMAL"))

    # Risk buckets based on unified display risk (birth SAM until first visit)
    normal_count = 0
    mam_count = 0
    sam_count = 0
    display_risks: dict[int, str] = {}
    for c in children:
        r = _display_risk_level(c)
        display_risks[c.id] = r
        if r == RiskLevel.NORMAL.value:
            normal_count += 1
        elif r == RiskLevel.MAM.value:
            mam_count += 1
        elif r == RiskLevel.SAM.value:
            sam_count += 1

    # Monthly accepted referrals trend
    monthly_referrals = []
    by_month = defaultdict(int)
    for r in accepted_refs:
        key = (r.created_at.year, r.created_at.month) if r.created_at else (datetime.now().year, datetime.now().month)
        by_month[key] += 1
    for (y, m), cnt in sorted(by_month.items(), key=lambda x: (x[0][0], x[0][1])):
        monthly_referrals.append({"year": y, "month": m, "count": cnt, "label": f"{y}-{m:02d}"})

    improved = 0
    not_improved = 0
    still_active = 0
    for r in accepted_refs:
        c = child_map.get(r.child_id)
        if not c:
            continue
        risk = display_risks.get(c.id, (c.current_risk_level or "").upper())
        if risk == RiskLevel.NORMAL.value:
            improved += 1
        elif risk in (RiskLevel.MAM.value, RiskLevel.SAM.value):
            not_improved += 1
        else:
            still_active += 1

    return jsonify({
        "status": "success",
        "dashboard": {
            "total_referred": len(accepted_refs),
            "pending_transfers": pending_transfers,
            "pending_cases": pending_cases,
            "reviewed_cases": reviewed_cases,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "monthly_referrals": monthly_referrals[-12:],
            "improvement_stats": {
                "improved": improved,
                "not_improved": not_improved,
                "pending_review": still_active,
            },
        },
    }), 200


# ---------------------------------------------------------------------------
# GET /api/nutritionist/transfer-requests
# ---------------------------------------------------------------------------
@bp.route("/transfer-requests", methods=["GET"])
@nutritionist_required
def transfer_requests():
    """
    List PENDING referral/transfer requests sent to this nutritionist from hospital (Pediatric Unit).
    These are ChildReferral records with status=PENDING for this hospital.
    """
    user = get_current_user()
    if not user.hospital_id:
        return jsonify({"status": "error", "message": "Hospital not linked"}), 403

    status_filter = request.args.get("status")  # PENDING, REVIEWED, all

    query = db.session.query(ChildReferral, Child).join(
        Child, Child.id == ChildReferral.child_id
    ).filter(
        ChildReferral.hospital_id == user.hospital_id,
        ChildReferral.referred_to_role == "nutritionist",
    )

    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(ChildReferral.status == status_filter.upper())
    else:
        # Default: show PENDING only
        query = query.filter(ChildReferral.status == ReferralStatus.PENDING.value)

    refs = query.order_by(desc(ChildReferral.created_at)).all()

    out = []
    for ref, child in refs:
        last_m = (
            db.session.query(Measurement)
            .filter(Measurement.child_id == child.id)
            .order_by(Measurement.measurement_date.desc())
            .first()
        )
        referred_by_user = db.session.get(User, ref.referred_by_user_id)
        out.append({
            "referral_id": ref.id,
            "child": child.to_dict(),
            "referral": ref.to_dict(),
            "current_risk_level": child.current_risk_level,
            "birth_risk_level": child.birth_risk_level,
            "escalation_status": child.escalation_status,
            "last_measurement_date": last_m.measurement_date.isoformat() if last_m and last_m.measurement_date else None,
            "referred_by": referred_by_user.to_dict() if referred_by_user else None,
            "transfer_reason": ref.referral_reason,
            "transferred_at": ref.created_at.isoformat() if ref.created_at else None,
        })

    return jsonify({
        "status": "success",
        "transfer_requests": out,
        "count": len(out),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/nutritionist/transfer-requests/badge-count
# ---------------------------------------------------------------------------
@bp.route("/transfer-requests/badge-count", methods=["GET"])
@nutritionist_required
def transfer_requests_badge_count():
    """
    Returns count of PENDING transfer requests for the red dot notification badge.
    """
    user = get_current_user()
    if not user.hospital_id:
        return jsonify({"status": "success", "pending_count": 0}), 200

    count = db.session.query(ChildReferral).filter(
        ChildReferral.hospital_id == user.hospital_id,
        ChildReferral.referred_to_role == "nutritionist",
        ChildReferral.status == ReferralStatus.PENDING.value,
    ).count()

    return jsonify({
        "status": "success",
        "pending_count": count,
    }), 200


# ---------------------------------------------------------------------------
# POST /api/nutritionist/transfer-requests/<referral_id>/accept
# ---------------------------------------------------------------------------
@bp.route("/transfer-requests/<int:referral_id>/accept", methods=["POST"])
@nutritionist_required
def accept_transfer_request(referral_id: int):
    """
    Nutritionist accepts a transfer request (ChildReferral) from hospital.
    Marks referral as REVIEWED and updates child status.
    """
    user = get_current_user()
    if not user.hospital_id:
        return jsonify({"status": "error", "message": "Hospital not linked"}), 403

    referral = db.session.get(ChildReferral, referral_id)
    if not referral:
        return jsonify({"status": "error", "message": "Transfer request not found"}), 404

    if referral.hospital_id != user.hospital_id:
        return jsonify({"status": "error", "message": "Access denied. This referral is not for your hospital."}), 403

    if referral.referred_to_role != "nutritionist":
        return jsonify({"status": "error", "message": "This is not a nutritionist referral"}), 400

    if referral.status != ReferralStatus.PENDING.value:
        return jsonify({
            "status": "error",
            "message": f"Transfer request is already {referral.status}"
        }), 400

    data = request.get_json() or {}
    notes = data.get("notes", "")

    referral.status = ReferralStatus.REVIEWED.value
    referral.reviewed_by_user_id = user.id
    referral.reviewed_at = datetime.utcnow()

    # Update child escalation status and area hierarchy so RDHS/PDHS see the child
    child = db.session.get(Child, referral.child_id)
    if child:
        child.escalation_status = EscalationStatus.ESCALATED_TO_NUTRITIONIST.value
        # Resolve RDHS/MOH by walking UP from nutritionist's assigned areas (PHM -> MOH -> RDHS).
        # Preserve existing moh_area_id — only fill in if missing — so the child stays linked to
        # the MOH that originally escalated them (overwriting it would break return-to-MOH routing).
        from backend.auth_utils_hierarchical import get_moh_and_rdhs_for_user
        from backend.models_hierarchical import Area
        moh_area, rdhs_area = get_moh_and_rdhs_for_user(user)
        if moh_area and not child.moh_area_id:
            child.moh_area_id = moh_area.id
        if rdhs_area:
            if not child.district_id:
                child.district_id = rdhs_area.id
            pdhs_area = rdhs_area.parent
            if pdhs_area and not child.province_id:
                child.province_id = pdhs_area.id
        elif moh_area and moh_area.parent:
            rdhs_area = moh_area.parent
            if not child.district_id:
                child.district_id = rdhs_area.id
            if rdhs_area.parent and not child.province_id:
                child.province_id = rdhs_area.parent.id

    db.session.commit()

    log_audit(
        action="TRANSFER_ACCEPT",
        entity_type="child_referral",
        entity_id=referral.id,
        old_values={"status": "PENDING"},
        new_values={"status": "REVIEWED"},
        user_id=user.id,
        description=f"Nutritionist accepted transfer request for child {referral.child_id}",
    )

    return jsonify({
        "status": "success",
        "message": "Transfer request accepted. Child is now under your care.",
        "referral": referral.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# POST /api/nutritionist/transfer-requests/<referral_id>/reject
# ---------------------------------------------------------------------------
@bp.route("/transfer-requests/<int:referral_id>/reject", methods=["POST"])
@nutritionist_required
def reject_transfer_request(referral_id: int):
    """
    Nutritionist rejects a transfer request from hospital.
    Marks referral as REJECTED and reverts child transfer status.
    """
    user = get_current_user()
    if not user.hospital_id:
        return jsonify({"status": "error", "message": "Hospital not linked"}), 403

    referral = db.session.get(ChildReferral, referral_id)
    if not referral:
        return jsonify({"status": "error", "message": "Transfer request not found"}), 404

    if referral.hospital_id != user.hospital_id:
        return jsonify({"status": "error", "message": "Access denied."}), 403

    if referral.status != ReferralStatus.PENDING.value:
        return jsonify({
            "status": "error",
            "message": f"Transfer request is already {referral.status}"
        }), 400

    data = request.get_json() or {}
    rejection_reason = data.get("rejection_reason", "No reason provided")

    referral.status = ReferralStatus.REJECTED.value
    referral.reviewed_by_user_id = user.id
    referral.reviewed_at = datetime.utcnow()
    referral.referral_reason = (referral.referral_reason or "") + f"\n[REJECTED by nutritionist: {rejection_reason}]"

    # Revert child transfer status
    child = db.session.get(Child, referral.child_id)
    if child:
        child.is_transferred = False
        from backend.models_hierarchical import TransferStatus
        child.transfer_status = TransferStatus.NONE.value
        child.escalation_status = EscalationStatus.NONE.value

    db.session.commit()

    log_audit(
        action="TRANSFER_REJECT",
        entity_type="child_referral",
        entity_id=referral.id,
        old_values={"status": "PENDING"},
        new_values={"status": "REVIEWED", "rejection_reason": rejection_reason},
        user_id=user.id,
        description=f"Nutritionist rejected transfer request for child {referral.child_id}: {rejection_reason}",
    )

    return jsonify({
        "status": "success",
        "message": "Transfer request rejected.",
        "referral": referral.to_dict(),
    }), 200
