"""Validation helpers for child growth measurement workflows."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from backend.utils.risk_status import muac_assessment, normalize_edema


VALID_MEASUREMENT_METHODS = {"recumbent_length", "standing_height"}


def _first_present(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


def _parse_float(value: Any, label: str) -> tuple[Optional[float], Optional[str]]:
    if value is None or value == "":
        return None, f"{label} is required."
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None, f"{label} must be a valid number."
    return parsed, None


def _parse_measurement_date(value: Any) -> tuple[Optional[datetime], Optional[str]]:
    if value in (None, ""):
        return datetime.now(), None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None), None
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()), None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.replace(tzinfo=None)
        return parsed, None
    except (TypeError, ValueError):
        return None, "Measurement date must be a valid date."


def normalize_gender_for_growth(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if raw in {"male", "m", "boy"}:
        return "M"
    if raw in {"female", "f", "girl"}:
        return "F"
    return None


def edema_assessment_strict(value: Any) -> tuple[Optional[bool], str, bool, Optional[str]]:
    """Return edema value, display status, clinical flag, and validation error."""
    if value in (None, ""):
        return None, "Not Recorded", False, None
    edema_present = normalize_edema(value)
    if edema_present is None:
        return None, "Invalid", False, "Edema must be yes/no or true/false."
    if edema_present:
        return True, "Bilateral Pitting Edema Recorded", True, None
    return False, "Not Present", False, None


def validate_measurement_payload(data: dict[str, Any], child: Any) -> dict[str, Any]:
    """Validate and normalize a child measurement payload.

    MUAC and edema are intentionally optional. Unrealistic but parseable values
    are returned as clinical-review warnings instead of blocking submission.
    """
    errors: list[str] = []
    review_reasons: list[str] = []

    child_dob = getattr(child, "dob", None)
    if not child_dob:
        errors.append("Child date of birth is required for measurement.")
    elif child_dob > date.today():
        errors.append("Date of birth cannot be in the future.")

    measurement_date, date_error = _parse_measurement_date(
        _first_present(data, "measurement_date", "visit_date", "date")
    )
    if date_error:
        errors.append(date_error)
    if child_dob and measurement_date and measurement_date.date() < child_dob:
        errors.append("Measurement date cannot be before date of birth.")

    age_days = (measurement_date.date() - child_dob).days if child_dob and measurement_date else None
    if age_days is not None and age_days < 0:
        errors.append("Age cannot be negative.")
    age_months = max(0, age_days // 30) if age_days is not None else None

    sex = normalize_gender_for_growth(getattr(child, "gender", None))
    if sex is None:
        errors.append("Gender must be Male or Female for WHO Z-score calculation.")

    weight_kg, weight_error = _parse_float(_first_present(data, "weight_kg", "weight"), "Weight")
    height_cm, height_error = _parse_float(_first_present(data, "height_cm", "height", "length_cm"), "Height/length")
    if weight_error:
        errors.append("weight_kg is required for WHO Z-score calculation." if weight_kg is None else weight_error)
    if height_error:
        errors.append("height_cm is required for WHO Z-score calculation." if height_cm is None else height_error)

    if weight_kg is not None:
        if weight_kg < 0:
            errors.append("Weight cannot be negative.")
        elif weight_kg == 0:
            errors.append("Weight must be greater than 0.")
        elif weight_kg < 1 or weight_kg > 40:
            review_reasons.append("Weight is outside the realistic range (1-40 kg).")

    if height_cm is not None:
        if height_cm < 0:
            errors.append("Height/length cannot be negative.")
        elif height_cm == 0:
            errors.append("Height/length must be greater than 0.")
        elif height_cm < 30 or height_cm > 130:
            review_reasons.append("Height/length is outside the realistic range (30-130 cm).")

    muac_value, muac_status, muac_needs_review, muac_error = muac_assessment(
        _first_present(data, "muac_cm", "muac")
    )
    if muac_error and muac_status == "Invalid":
        errors.append(muac_error)
    elif muac_needs_review:
        review_reasons.append(muac_error or f"MUAC status is {muac_status}.")

    edema_present, edema_status, edema_needs_review, edema_error = edema_assessment_strict(
        _first_present(data, "edema", "edema_present")
    )
    if edema_error:
        errors.append(edema_error)
    elif edema_needs_review:
        review_reasons.append("Bilateral pitting edema recorded.")

    measurement_method = _first_present(data, "measurement_method", "method")
    if measurement_method is not None:
        measurement_method = str(measurement_method).strip()
        if measurement_method not in VALID_MEASUREMENT_METHODS:
            errors.append("Measurement method must be recumbent_length or standing_height.")

    return {
        "ok": not errors,
        "error": " ".join(dict.fromkeys(errors)),
        "warnings": list(dict.fromkeys(review_reasons)),
        "clinical_review_required": bool(review_reasons),
        "clinical_review_reasons": list(dict.fromkeys(review_reasons)),
        "measurement_date": measurement_date,
        "age_days": age_days,
        "age_months": age_months,
        "sex": sex,
        "weight_kg": weight_kg,
        "height_cm": height_cm,
        "muac_cm": muac_value,
        "muac_status": muac_status,
        "edema_present": edema_present,
        "edema_status": edema_status,
        "measurement_method": measurement_method,
    }
