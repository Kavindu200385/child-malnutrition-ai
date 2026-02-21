from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils import visit_required
from backend.extensions import db
from backend.models import Child, Visit

from backend.ai.predictor import predict_current_risk, predict_future_risk

bp = Blueprint("analysis_jwt", __name__, url_prefix="/api/analysis")


@bp.route("/analyze", methods=["POST"])
@visit_required
def analyze():
    """
    Analyze and create visit (Midwife, MOH Doctor, Nutritionist only - not Hospital).
    Hospital can only register children, not create visits.
    """
    # Block hospital role from accessing this endpoint
    from flask_jwt_extended import get_jwt_identity
    from backend.models_hierarchical import User
    user_id = get_jwt_identity()
    if user_id:
        user = db.session.get(User, int(user_id))
        if user and user.role == "hospital":
            return jsonify({
                "status": "error",
                "message": "Hospital role cannot create visits. Use /api/hospital/child/register for birth registration."
            }), 403
        # For midwife, ensure they can only analyze children in their area
        if user and user.role == "midwife":
            data = request.get_json() or {}
            child_id = data.get("child_id")
            if child_id:
                from backend.models_hierarchical import Child
                child = db.session.get(Child, child_id)
                if child and child.phm_area_id != user.phm_area_id:
                    return jsonify({
                        "status": "error",
                        "message": "Access denied. Child is not in your PHM area."
                    }), 403
    """
    Analyze current visit and optionally persist as a Visit record.

    Expected JSON:
    - child_id (optional, if provided we upsert child and save visit)
    - age (months), sex ('M'/'F'), weight (kg), height (cm)
    """
    data = request.get_json() or {}

    required_fields = ["age", "sex", "weight", "height"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({"status": "error", "message": f"Missing required field(s): {', '.join(missing)}"}), 400

    age = int(data["age"])
    sex = str(data["sex"])
    weight = float(data["weight"])
    height = float(data["height"])

    # Current situation model (0-24 vs 24-60)
    current = predict_current_risk(
        {
            "age_months": age,
            "sex": sex,
            "weight_kg": weight,
            "height_cm": height,
        }
    )
    if not current.get("ok"):
        return jsonify({"status": "error", "message": current.get("error", "Current risk prediction failed")}), 500

    z = current["z_scores"]
    current_label = str(current.get("model_prediction", "Normal"))

    # Map to overall risk level (for DB + UI consistency)
    overall_risk_level = {
        "normal": "LOW",
        "mam": "HIGH",
        "sam": "CRITICAL",
        "severe_stunting": "CRITICAL",
    }.get(current_label.strip().lower(), "MODERATE")

    # Future 2-month prediction model
    future = predict_future_risk(
        {
            "age_months": age,
            "sex": sex,
            "weight_kg": weight,
            "height_cm": height,
            "z_wfa": float(z["WFA_Z"]),
            "z_hfa": float(z["HFA_Z"]),
            "z_wfh": float(z["WFH_Z"]),
        }
    )
    if not future.get("ok"):
        return jsonify({"status": "error", "message": future.get("error", "Future risk prediction failed")}), 500

    # Response shape compatible with frontend
    result = {
        "basic_info": {
            "age_months": age,
            "sex": sex.upper(),
            "weight_kg": weight,
            "height_cm": height,
        },
        "z_scores": z,
        "classifications": {
            "model_prediction": current_label,
            "final_decision": current_label,
        },
        "risk_assessment": {
            "overall_risk_level": overall_risk_level,
            "model_confidence": current.get("confidence"),
            "class_probabilities": current.get("class_probabilities"),
        },
        "prediction_next_2_months": {
            "predicted_risk_next_2_months": future.get("predicted_risk_next_2_months"),
            "confidence": future.get("confidence"),
        },
    }

    # Optional persistence
    child_id = data.get("child_id")
    if child_id:
        child = Child.query.filter_by(child_id=str(child_id)).first()
        if not child:
            child = Child(child_id=str(child_id))
            db.session.add(child)
            db.session.flush()

        user_id = get_jwt_identity()
        visit = Visit(
            child_id_fk=child.id,
            age_months=age,
            sex=sex.upper(),
            weight_kg=weight,
            height_cm=height,
            z_wfa=float(z["WFA_Z"]),
            z_hfa=float(z["HFA_Z"]),
            z_wfh=float(z["WFH_Z"]),
            current_risk=str(overall_risk_level),
            predicted_risk_next_2_months=str(future.get("predicted_risk_next_2_months")),
            model_confidence=float(future.get("confidence")) if future.get("confidence") is not None else None,
            created_by_user_id=int(user_id) if user_id is not None else None,
        )
        db.session.add(visit)
        db.session.commit()

    return jsonify({"status": "success", "data": result}), 200

