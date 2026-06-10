from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity
from datetime import datetime

from backend.auth_utils import visit_required
from backend.extensions import db
from backend.models import Child, Visit
from backend.utils.audit import log_audit

from backend.ai.predictor import build_future_prediction_payload, predict_current_risk, predict_future_risk, compare_models

bp = Blueprint("analysis_jwt", __name__, url_prefix="/api/analysis")


@bp.route("/compare", methods=["POST"])
@visit_required
def compare_model_results():
    """
    Compare the primary current-risk model vs Logistic Regression predictions side-by-side.
    Useful for model evaluation and report generation.

    Expected JSON: age, sex, weight, height
    """
    data = request.get_json() or {}
    required = ["age", "sex", "weight", "height"]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"status": "error", "message": f"Missing: {', '.join(missing)}"}), 400

    result = compare_models({
        "age_months": int(data["age"]),
        "sex": str(data["sex"]),
        "weight_kg": float(data["weight"]),
        "height_cm": float(data["height"]),
    })
    return jsonify({"status": "success", "data": result}), 200




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
    if user_id:
        log_audit(
            action_type="CURRENT_RISK_PREDICTION_GENERATED",
            action_category="AI_ML",
            entity_type="prediction",
            user_id=int(user_id),
            status="SUCCESS",
            description="Current malnutrition risk prediction generated.",
            metadata={
                "age_months": age,
                "sex": sex.upper(),
                "model_prediction": current_label,
                "confidence": current.get("confidence"),
            },
        )

    # Map to overall risk level (for DB + UI consistency)
    overall_risk_level = {
        "normal": "LOW",
        "mam": "HIGH",
        "underweight": "HIGH",
        "sam": "CRITICAL",
        "severe_stunting": "CRITICAL",
    }.get(current_label.strip().lower(), "MODERATE")

    child_id = data.get("child_id")
    child = None
    future = {"ok": False, "predicted_risk_next_2_months": None, "confidence": None}
    prediction_warning = "Future prediction requires an existing child profile and measurement history."
    prediction_history_source = None

    if child_id:
        child = (
            Child.query.filter_by(child_id=str(child_id)).first()
            or Child.query.filter_by(child_unique_id=str(child_id)).first()
        )
        if child:
            future_payload = build_future_prediction_payload(
                child=child,
                weight_kg=weight,
                height_cm=height,
                measurement_date=datetime.utcnow(),
                history_source="both",
            )
            prediction_warning = future_payload.get("warning")
            prediction_history_source = future_payload.get("history_source")
            if future_payload.get("ok"):
                future = predict_future_risk(future_payload["payload"])
                if not future.get("ok"):
                    prediction_warning = future.get("error", "Future risk prediction failed")
                elif user_id:
                    log_audit(
                        action_type="FUTURE_RISK_PREDICTION_GENERATED",
                        action_category="AI_ML",
                        entity_type="prediction",
                        entity_id=child.id,
                        user_id=int(user_id),
                        status="SUCCESS",
                        description="Future malnutrition risk prediction generated.",
                        metadata={
                            "child_id": child.id,
                            "predicted_risk_next_2_months": future.get("predicted_risk_next_2_months"),
                            "confidence": future.get("confidence"),
                            "history_source": prediction_history_source,
                        },
                    )
            if prediction_warning and user_id:
                log_audit(
                    action_type="MODEL_CONFIDENCE_WARNING",
                    action_category="AI_ML",
                    entity_type="prediction",
                    entity_id=child.id,
                    user_id=int(user_id),
                    status="SUCCESS",
                    description=prediction_warning,
                    metadata={"child_id": child.id, "history_source": prediction_history_source},
                )

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
            "warning": prediction_warning,
            "history_source": prediction_history_source,
        },
    }

    # Optional persistence
    if child_id:
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
            predicted_risk_next_2_months=(
                str(future.get("predicted_risk_next_2_months"))
                if future.get("predicted_risk_next_2_months") is not None else None
            ),
            model_confidence=float(future.get("confidence")) if future.get("confidence") is not None else None,
            created_by_user_id=int(user_id) if user_id is not None else None,
        )
        db.session.add(visit)
        db.session.flush()
        log_audit(
            action="CREATE",
            entity_type="visit",
            entity_id=visit.id,
            new_values=visit.to_dict(),
            user_id=int(user_id) if user_id is not None else None,
            description=f"Saved analysis measurement for child {child.child_id or child.child_unique_id or child.id}.",
        )
        db.session.commit()

    return jsonify({"status": "success", "data": result}), 200
