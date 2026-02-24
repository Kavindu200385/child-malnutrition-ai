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

from backend.auth_utils_hierarchical import get_current_user, nutritionist_required, user_can_access_child
from backend.extensions import db
from backend.models_hierarchical import (
    User, Child, Measurement, ChildReferral, ChildEscalation,
    UserRole, RiskLevel, EscalationStatus, ReferralStatus,
)
from backend.ai.predictor import predict_current_risk, compute_z_scores
from backend.utils.audit import log_audit

bp = Blueprint("nutritionist", __name__, url_prefix="/api/nutritionist")


def _nutritionist_can_access_child(user, child):
    """Strict: child must be referred to this nutritionist's hospital."""
    if not user or user.role != UserRole.NUTRITIONIST.value or not user.hospital_id:
        return False
    ref = db.session.query(ChildReferral).filter(
        ChildReferral.child_id == child.id,
        ChildReferral.hospital_id == user.hospital_id,
        ChildReferral.referred_to_role == "nutritionist",
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
        )
        .order_by(ChildReferral.created_at.desc())
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
        out.append({
            "child": child.to_dict(),
            "referral": ref.to_dict(),
            "current_risk_level": child.current_risk_level,
            "escalation_status": child.escalation_status,
            "last_measurement_date": last_m.measurement_date.isoformat() if last_m and last_m.measurement_date else None,
            "last_measurement_confidence": float(last_m.model_confidence) if last_m and last_m.model_confidence else None,
        })
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

    return jsonify({
        "status": "success",
        "child": child.to_dict(),
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
    if not _nutritionist_can_access_child(user, child):
        return jsonify({"status": "error", "message": "Access denied"}), 403

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
        refs = (
            db.session.query(ChildReferral)
            .filter(
                ChildReferral.child_id == child.id,
                ChildReferral.hospital_id == user.hospital_id,
                ChildReferral.referred_to_role == "nutritionist",
                ChildReferral.status == ReferralStatus.PENDING.value,
            )
            .all()
        )
        child.current_risk_level = RiskLevel.NORMAL.value
        child.escalation_status = EscalationStatus.NONE.value
        for r in refs:
            r.status = ReferralStatus.REVIEWED.value
            r.reviewed_by_user_id = user.id
            r.reviewed_at = datetime.utcnow()

        db.session.commit()
        log_audit(
            action="UPDATE",
            entity_type="child",
            entity_id=child.id,
            new_values={"escalation_status": "NONE", "current_risk_level": "NORMAL"},
            user_id=user.id,
            description=f"Nutritionist returned child {child_id} to MOH",
        )
        return jsonify({
            "status": "success",
            "message": "Child returned to MOH",
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

    refs = (
        db.session.query(ChildReferral)
        .filter(
            ChildReferral.hospital_id == hospital_id,
            ChildReferral.referred_to_role == "nutritionist",
        )
        .all()
    )
    child_ids = [r.child_id for r in refs]
    if not child_ids:
        return jsonify({
            "status": "success",
            "dashboard": {
                "total_referred": 0,
                "pending_cases": 0,
                "reviewed_cases": 0,
                "normal_count": 0,
                "mam_count": 0,
                "sam_count": 0,
                "monthly_referrals": [],
                "improvement_stats": {"improved": 0, "not_improved": 0, "pending_review": 0},
            },
        }), 200

    children = db.session.query(Child).filter(Child.id.in_(child_ids)).all()
    child_map = {c.id: c for c in children}

    pending_cases = sum(1 for r in refs if r.status == ReferralStatus.PENDING.value)
    reviewed_cases = sum(1 for r in refs if r.status == ReferralStatus.REVIEWED.value)
    normal_count = sum(1 for c in children if (c.current_risk_level or "").upper() == "NORMAL")
    mam_count = sum(1 for c in children if (c.current_risk_level or "").upper() == "MAM")
    sam_count = sum(1 for c in children if (c.current_risk_level or "").upper() == "SAM")

    monthly_referrals = []
    by_month = defaultdict(int)
    for r in refs:
        key = (r.created_at.year, r.created_at.month) if r.created_at else (datetime.now().year, datetime.now().month)
        by_month[key] += 1
    for (y, m), cnt in sorted(by_month.items(), key=lambda x: (x[0][0], x[0][1])):
        monthly_referrals.append({"year": y, "month": m, "count": cnt, "label": f"{y}-{m:02d}"})

    improved = 0
    not_improved = 0
    pending_review = 0
    for r in refs:
        if r.status == ReferralStatus.REVIEWED.value:
            c = child_map.get(r.child_id)
            if c and (c.current_risk_level or "").upper() == "NORMAL":
                improved += 1
            else:
                not_improved += 1
        else:
            pending_review += 1

    return jsonify({
        "status": "success",
        "dashboard": {
            "total_referred": len(refs),
            "pending_cases": pending_cases,
            "reviewed_cases": reviewed_cases,
            "normal_count": normal_count,
            "mam_count": mam_count,
            "sam_count": sam_count,
            "monthly_referrals": monthly_referrals[-12:],
            "improvement_stats": {
                "improved": improved,
                "not_improved": not_improved,
                "pending_review": pending_review,
            },
        },
    }), 200
