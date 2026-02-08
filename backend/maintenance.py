from __future__ import annotations

from typing import Optional

from backend.extensions import db
from backend.models import Visit

from backend.ai.child_risk_analyzing import analyze_child
from backend.ai.prediction_next2months import get_next2months_predictor


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
    predictor = None
    try:
        predictor = get_next2months_predictor()
    except Exception:
        # If the next2months model isn't present, we still update current risk + z-scores.
        predictor = None

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
            # Recompute using your existing analyzer
            result = analyze_child(
                age=int(v.age_months),
                sex=str(v.sex),
                weight=float(v.weight_kg),
                height=float(v.height_cm),
            )

            z = result["z_scores"]
            v.z_wfa = float(z["WFA_Z"])
            v.z_hfa = float(z["HFA_Z"])
            v.z_wfh = float(z["WFH_Z"])

            current_level = str(result["risk_assessment"]["overall_risk_level"])
            v.current_risk = current_level

            if predictor is not None:
                current_risk_for_model = _map_current_risk_for_next_model(current_level)
                next_label, next_conf = predictor.predict(
                    age_months=int(v.age_months),
                    weight_kg=float(v.weight_kg),
                    height_cm=float(v.height_cm),
                    z_wfa=float(v.z_wfa),
                    z_hfa=float(v.z_hfa),
                    z_wfh=float(v.z_wfh),
                    current_risk=current_risk_for_model,
                )
                v.predicted_risk_next_2_months = next_label
                v.model_confidence = float(next_conf) if next_conf is not None else None

            updated += 1

        last_id = chunk[-1].id
        db.session.commit()

    return {"total": int(total), "updated": int(updated)}

