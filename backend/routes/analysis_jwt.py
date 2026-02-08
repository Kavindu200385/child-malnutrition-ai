from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils import child_monitoring_required
from backend.extensions import db
from backend.models import Child, Visit

from backend.ai.child_risk_analyzing import analyze_child  # current risk + z-scores
from backend.ai.prediction_next2months import get_next2months_predictor

bp = Blueprint("analysis_jwt", __name__, url_prefix="/api/analysis")


@bp.route("/analyze", methods=["POST"])
@child_monitoring_required
def analyze():
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

    result = analyze_child(age=age, sex=sex, weight=weight, height=height)

    # Map current risk for next-2-month model.
    # The next-2-month training expects: Low/Moderate/High/Severe.
    current_level = result["risk_assessment"]["overall_risk_level"]  # LOW/MODERATE/HIGH/CRITICAL
    current_risk_for_model = {
        "LOW": "Low",
        "MODERATE": "Moderate",
        "HIGH": "High",
        "CRITICAL": "Severe",
    }.get(str(current_level).upper(), "Moderate")

    z = result["z_scores"]
    predictor = get_next2months_predictor()
    next_label, next_conf = predictor.predict(
        age_months=age,
        weight_kg=weight,
        height_cm=height,
        z_wfa=float(z["WFA_Z"]),
        z_hfa=float(z["HFA_Z"]),
        z_wfh=float(z["WFH_Z"]),
        current_risk=current_risk_for_model,
    )

    # Attach next-2-month prediction to response
    result["prediction_next_2_months"] = {
        "predicted_risk_next_2_months": next_label,
        "confidence": round(next_conf, 3) if next_conf is not None else None,
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
            current_risk=str(current_level),
            predicted_risk_next_2_months=next_label,
            model_confidence=float(next_conf) if next_conf is not None else None,
            created_by_user_id=int(user_id) if user_id is not None else None,
        )
        db.session.add(visit)
        db.session.commit()

    return jsonify({"status": "success", "data": result}), 200

