from __future__ import annotations

from datetime import datetime
from typing import Optional

from backend.extensions import db
from backend.models import Visit
from backend.models_hierarchical import Child, Measurement

from backend.ai.predictor import predict_current_risk, predict_future_risk


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
            current = predict_current_risk(
                {
                    "age_months": int(v.age_months),
                    "sex": str(v.sex),
                    "weight_kg": float(v.weight_kg),
                    "height_cm": float(v.height_cm),
                }
            )

            if current.get("ok"):
                z = current["z_scores"]
                v.z_wfa = float(z["WFA_Z"])
                v.z_hfa = float(z["HFA_Z"])
                v.z_wfh = float(z["WFH_Z"])

                current_label = str(current.get("model_prediction", "Normal"))
                current_level = {
                    "normal": "LOW",
                    "mam": "HIGH",
                    "sam": "CRITICAL",
                    "severe_stunting": "CRITICAL",
                }.get(current_label.strip().lower(), "MODERATE")
                v.current_risk = current_level

                future = predict_future_risk(
                    {
                        "age_months": int(v.age_months),
                        "sex": str(v.sex),
                        "weight_kg": float(v.weight_kg),
                        "height_cm": float(v.height_cm),
                        "z_wfa": float(v.z_wfa),
                        "z_hfa": float(v.z_hfa),
                        "z_wfh": float(v.z_wfh),
                    }
                )
                if future.get("ok"):
                    v.predicted_risk_next_2_months = str(future.get("predicted_risk_next_2_months"))
                    v.model_confidence = float(future.get("confidence")) if future.get("confidence") is not None else None

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
                age_months = int(
                    (mdate.date() - child.dob).days / 30.44
                )
                sex = child.gender or "male"

                current = predict_current_risk({
                    "age_months": age_months,
                    "sex": sex,
                    "weight_kg": float(m.weight_kg),
                    "height_cm": float(m.height_cm),
                })

                if not current.get("ok"):
                    errors += 1
                    continue

                z = current["z_scores"]
                z_wfa = max(-5.0, min(5.0, float(z["WFA_Z"])))
                z_hfa = max(-5.0, min(5.0, float(z["HFA_Z"])))
                z_wfh = max(-5.0, min(5.0, float(z["WFH_Z"])))

                m.z_score_wfa = z_wfa
                m.z_score_hfa = z_hfa
                m.z_score_wfh = z_wfh

                future = predict_future_risk({
                    "age_months": age_months,
                    "sex": sex,
                    "weight_kg": float(m.weight_kg),
                    "height_cm": float(m.height_cm),
                    "z_wfa": z_wfa,
                    "z_hfa": z_hfa,
                    "z_wfh": z_wfh,
                })
                if future.get("ok"):
                    m.predicted_risk_next_2_months = str(future.get("predicted_risk_next_2_months"))
                    conf = future.get("confidence")
                    m.model_confidence = float(conf) if conf is not None else None

                updated += 1
            except Exception:
                errors += 1

        last_id = chunk[-1].id
        db.session.commit()

    return {"total": int(total), "updated": int(updated), "errors": int(errors)}

