from __future__ import annotations

from typing import Optional

from backend.extensions import db
from backend.models import Visit

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

