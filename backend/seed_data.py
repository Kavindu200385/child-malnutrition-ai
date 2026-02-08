import os
from typing import Optional

import pandas as pd

from backend.extensions import db
from backend.models import Child, Visit


def _safe_str(v) -> Optional[str]:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except Exception:
        pass
    s = str(v).strip()
    return s if s else None


def seed_visits_from_children_records_csv_if_empty() -> int:
    """
    Migrate legacy CSV data (backend/data/children_records.csv) into the SQL database.

    Runs only if the visits table is empty.
    Returns: number of Visit rows inserted.
    """
    if Visit.query.count() > 0:
        return 0

    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "data", "children_records.csv")
    if not os.path.exists(csv_path):
        return 0

    df = pd.read_csv(csv_path)
    if df.empty:
        return 0

    # Normalize expected columns
    required_cols = {"Child_ID", "Age_months", "Sex", "Weight_kg", "Height_cm"}
    if not required_cols.issubset(set(df.columns)):
        return 0

    # Drop exact duplicate rows (your CSV currently contains some)
    df = df.drop_duplicates()

    inserted = 0
    for _, row in df.iterrows():
        child_id = _safe_str(row.get("Child_ID"))
        if not child_id:
            continue

        child = Child.query.filter_by(child_id=child_id).first()
        if not child:
            child = Child(child_id=child_id)
            db.session.add(child)
            db.session.flush()

        # Build visit
        try:
            age_months = int(row.get("Age_months"))
            sex = _safe_str(row.get("Sex")) or "M"
            weight_kg = float(row.get("Weight_kg"))
            height_cm = float(row.get("Height_cm"))
        except Exception:
            continue

        # Lightweight dedupe: don't insert if same (child, age, weight, height) already exists
        existing = (
            Visit.query.filter_by(child_id_fk=child.id, age_months=age_months)
            .filter(Visit.weight_kg == weight_kg, Visit.height_cm == height_cm)
            .first()
        )
        if existing:
            continue

        visit = Visit(
            child_id_fk=child.id,
            age_months=age_months,
            sex=sex.upper()[:1],
            weight_kg=weight_kg,
            height_cm=height_cm,
            z_wfa=float(row.get("WFA_Z")) if _safe_str(row.get("WFA_Z")) is not None else None,
            z_hfa=float(row.get("HFA_Z")) if _safe_str(row.get("HFA_Z")) is not None else None,
            z_wfh=float(row.get("WFH_Z")) if _safe_str(row.get("WFH_Z")) is not None else None,
            current_risk=_safe_str(row.get("Risk_Level")),
            model_confidence=float(row.get("Confidence")) if _safe_str(row.get("Confidence")) is not None else None,
        )

        db.session.add(visit)
        inserted += 1

    db.session.commit()
    return inserted

