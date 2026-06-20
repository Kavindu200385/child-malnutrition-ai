from __future__ import annotations

from datetime import datetime
import json
from typing import Optional

from backend.extensions import db
from backend.models import Visit
from backend.models_hierarchical import Child, Measurement
from backend.utils.gender import normalize_gender
from backend.utils.current_status import assess_current_nutritional_status

from backend.ai.predictor import build_future_prediction_payload, predict_future_risk, compute_z_scores
import json


def _map_current_risk_for_next_model(current_level: str) -> str:
    # The next-2-month model expects: Low/Moderate/High/Severe.
    return {
        "LOW": "Low",
        "MODERATE": "Moderate",
        "HIGH": "High",
        "CRITICAL": "Severe",
    }.get(str(current_level).upper(), "Moderate")


def recompute_all_visits(batch_size: int = 500) -> dict:
    """
    Recompute:
    - z_wfa/z_hfa/z_wfh
    - current_risk
    - predicted_risk_next_2_months + model_confidence

    for every Visit in the DB.
    """
    # Predictor functions are always available if models exist.

    total = Visit.query.count()
    updated = 0

    # Iterate in id order for stable batching
    last_id: Optional[int] = None
    while True:
        q = Visit.query.order_by(Visit.id.asc())
        if last_id is not None:
            q = q.filter(Visit.id > last_id)
        chunk = q.limit(batch_size).all()
        if not chunk:
            break

        for v in chunk:
            try:
                z_wfa, z_hfa, z_wfh = compute_z_scores(
                    age_months=int(v.age_months),
                    sex=str(v.sex),
                    weight_kg=float(v.weight_kg),
                    height_cm=float(v.height_cm),
                )
            except Exception:
                updated += 1
                continue

            v.z_wfa = float(z_wfa)
            v.z_hfa = float(z_hfa)
            v.z_wfh = float(z_wfh)

            current = assess_current_nutritional_status(
                z_score_wfa=float(z_wfa),
                z_score_hfa=float(z_hfa),
                z_score_wfh=float(z_wfh),
                muac_status=getattr(v, "muac_status", None),
                edema_status=getattr(v, "edema_status", None),
            )
            v.current_risk = current["legacy_risk_level"]
            v.current_nutritional_status = current["current_nutritional_status"]
            v.underweight_status = current["underweight_status"]
            v.stunting_status = current["stunting_status"]
            v.wasting_status = current["wasting_status"]
            v.current_status_breakdown = json.dumps(current["current_status_breakdown"])

            child = db.session.get(Child, v.child_id_fk)
            future_payload = build_future_prediction_payload(
                child=child,
                weight_kg=float(v.weight_kg),
                height_cm=float(v.height_cm),
                measurement_date=v.visit_date,
                history_source="both",
                exclude_visit_id=v.id,
            )
            if future_payload.get("ok"):
                future_payload["payload"].update(
                    {
                        "z_score_wfa": float(z_wfa),
                        "z_score_wfh": float(z_wfh),
                        "muac_status": getattr(v, "muac_status", None),
                        "edema_status": getattr(v, "edema_status", None),
                    }
                )
                future = predict_future_risk(future_payload["payload"])
                if future.get("ok"):
                    v.predicted_risk_next_2_months = str(future.get("predicted_risk_next_2_months"))
                    v.model_confidence = float(future.get("confidence")) if future.get("confidence") is not None else None
                    v.future_predicted_risk = str(future.get("predicted_risk_next_2_months"))
                    v.future_risk_confidence = float(future.get("confidence")) if future.get("confidence") is not None else None
                    v.model_version = future.get("model_version")
                    v.training_dataset_version = future.get("training_dataset_version")
                    v.explanation_factors = json.dumps(future.get("explanation_factors")) if future.get("explanation_factors") is not None else None
                    ts = future.get("prediction_timestamp")
                    v.prediction_timestamp = datetime.fromisoformat(ts) if ts else None
            else:
                v.predicted_risk_next_2_months = None
                v.model_confidence = None
                v.future_predicted_risk = None
                v.future_risk_confidence = None

            updated += 1

        last_id = chunk[-1].id
        db.session.commit()

    return {"total": int(total), "updated": int(updated)}


def recompute_all_measurements(batch_size: int = 200) -> dict:
    """
    Recompute predicted_risk_next_2_months (and z-scores) for every Measurement
    in the hierarchical schema. Uses the child's dob + gender to derive age at
    measurement time. Z-scores are clamped to [-6, 6] before feature engineering.
    """
    total = db.session.query(Measurement).count()
    updated = 0
    errors = 0

    last_id: Optional[int] = None
    while True:
        q = (
            db.session.query(Measurement)
            .order_by(Measurement.id.asc())
        )
        if last_id is not None:
            q = q.filter(Measurement.id > last_id)
        chunk = q.limit(batch_size).all()
        if not chunk:
            break

        for m in chunk:
            try:
                child = db.session.get(Child, m.child_id)
                if not child or not child.dob:
                    errors += 1
                    continue

                mdate = m.measurement_date or datetime.utcnow()
                age_months = (mdate.date() - child.dob).days // 30
                sex = normalize_gender(child.gender) or "male"

                z_wfa, z_hfa, z_wfh = compute_z_scores(
                    age_months=age_months,
                    sex=sex,
                    weight_kg=float(m.weight_kg),
                    height_cm=float(m.height_cm),
                )
                z_wfa = max(-5.0, min(5.0, float(z_wfa)))
                z_hfa = max(-5.0, min(5.0, float(z_hfa)))
                z_wfh = max(-5.0, min(5.0, float(z_wfh)))

                m.z_score_wfa = z_wfa
                m.z_score_hfa = z_hfa
                m.z_score_wfh = z_wfh
                current = assess_current_nutritional_status(
                    z_score_wfa=z_wfa,
                    z_score_hfa=z_hfa,
                    z_score_wfh=z_wfh,
                    muac_status=getattr(m, "muac_status", None),
                    edema_status=getattr(m, "edema_status", None),
                )
                m.risk_level = current["legacy_risk_level"]
                m.current_nutritional_status = current["current_nutritional_status"]
                m.underweight_status = current["underweight_status"]
                m.stunting_status = current["stunting_status"]
                m.wasting_status = current["wasting_status"]
                m.current_status_breakdown = json.dumps(current["current_status_breakdown"])

                future_payload = build_future_prediction_payload(
                    child=child,
                    weight_kg=float(m.weight_kg),
                    height_cm=float(m.height_cm),
                    measurement_date=mdate,
                    history_source="measurements",
                    exclude_measurement_id=m.id,
                )
                if future_payload.get("ok"):
                    future_payload["payload"].update(
                        {
                            "z_score_wfa": float(z_wfa),
                            "z_score_wfh": float(z_wfh),
                            "muac_status": getattr(m, "muac_status", None),
                            "edema_status": getattr(m, "edema_status", None),
                        }
                    )
                    future = predict_future_risk(future_payload["payload"])
                    if future.get("ok"):
                        m.predicted_risk_next_2_months = str(future.get("predicted_risk_next_2_months"))
                        conf = future.get("confidence")
                        m.model_confidence = float(conf) if conf is not None else None
                        m.future_predicted_risk = str(future.get("predicted_risk_next_2_months"))
                        m.future_risk_confidence = float(conf) if conf is not None else None
                        m.model_version = future.get("model_version")
                        m.training_dataset_version = future.get("training_dataset_version")
                        m.explanation_factors = json.dumps(future.get("explanation_factors")) if future.get("explanation_factors") is not None else None
                        ts = future.get("prediction_timestamp")
                        m.prediction_timestamp = datetime.fromisoformat(ts) if ts else None
                else:
                    m.predicted_risk_next_2_months = None
                    m.model_confidence = None
                    m.future_predicted_risk = None
                    m.future_risk_confidence = None

                updated += 1
            except Exception:
                errors += 1

        last_id = chunk[-1].id
        db.session.commit()

    return {"total": int(total), "updated": int(updated), "errors": int(errors)}
