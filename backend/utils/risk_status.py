"""Normalize current nutrition status and future prediction values."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Optional


CURRENT_STATUS_VALUES = {
    "NORMAL",
    "UNDERWEIGHT",
    "SEVERE UNDERWEIGHT",
    "STUNTING",
    "SEVERE STUNTING",
    "MAM",
    "SAM",
    "NEEDS CLINICAL REVIEW",
}

FUTURE_RISK_VALUES = {
    "NO RISK",
    "LOW RISK",
    "MODERATE RISK",
    "HIGH RISK",
    "SEVERE RISK",
    "DECLINING",
    "NEEDS CLINICAL REVIEW",
    "NOT AVAILABLE",
}

CURRENT_MODEL_VERSION = os.environ.get("CURRENT_RISK_MODEL_VERSION", "current_risk_model:v1")
FUTURE_MODEL_VERSION = os.environ.get("FUTURE_RISK_MODEL_VERSION", "future_prediction_model:v1")
COMBINED_MODEL_VERSION = f"{CURRENT_MODEL_VERSION};{FUTURE_MODEL_VERSION}"


def normalize_current_status(value: Any) -> str:
    raw = str(value or "").replace("_", " ").strip().upper()
    if not raw:
        return "NORMAL"
    if raw in {"NONE", "NO RISK", "LOW", "LOW RISK", "NORMAL"}:
        return "NORMAL"
    if raw in {"UNDERWEIGHT", "SEVERE UNDERWEIGHT", "STUNTING", "SEVERE STUNTING", "MAM", "SAM"}:
        return raw
    if raw in {"MODERATE", "MODERATE RISK"}:
        return "MAM"
    if raw in {"SEVERE", "SEVERE RISK", "CRITICAL"}:
        return "SAM"
    if "DECLIN" in raw:
        return "NEEDS CLINICAL REVIEW"
    if "REVIEW" in raw:
        return "NEEDS CLINICAL REVIEW"
    if "SEVERE" in raw and "UNDER" in raw:
        return "SEVERE UNDERWEIGHT"
    if "UNDER" in raw:
        return "UNDERWEIGHT"
    if "SEVERE" in raw and "STUNT" in raw:
        return "SEVERE STUNTING"
    if "STUNT" in raw:
        return "STUNTING"
    return raw if raw in CURRENT_STATUS_VALUES else "NEEDS CLINICAL REVIEW"


def normalize_future_risk(value: Any) -> str:
    if value is None:
        return "NOT AVAILABLE"
    raw = str(value).replace("_", " ").strip().upper()
    if not raw:
        return "NOT AVAILABLE"
    if raw in {"NORMAL", "NONE", "NO", "NO RISK"}:
        return "NO RISK"
    if raw in {"LOW", "LOW RISK"}:
        return "LOW RISK"
    if raw in {"MODERATE", "MAM", "MODERATE RISK"}:
        return "MODERATE RISK"
    if raw in {"HIGH", "HIGH RISK"}:
        return "HIGH RISK"
    if raw in {"SEVERE", "SAM", "CRITICAL", "SEVERE RISK"}:
        return "SEVERE RISK"
    if "DECLIN" in raw:
        return "DECLINING"
    if "REVIEW" in raw:
        return "NEEDS CLINICAL REVIEW"
    return raw if raw in FUTURE_RISK_VALUES else "NEEDS CLINICAL REVIEW"


def current_status_severity(value: Any) -> int:
    status = normalize_current_status(value)
    if status in {"SAM", "SEVERE STUNTING", "SEVERE UNDERWEIGHT", "NEEDS CLINICAL REVIEW"}:
        return 4
    if status in {"MAM", "UNDERWEIGHT", "STUNTING"}:
        return 2
    return 0


def future_risk_severity(value: Any) -> int:
    risk = normalize_future_risk(value)
    if risk in {"SEVERE RISK", "NEEDS CLINICAL REVIEW"}:
        return 4
    if risk in {"HIGH RISK", "DECLINING"}:
        return 3
    if risk == "MODERATE RISK":
        return 2
    if risk == "LOW RISK":
        return 1
    return 0


def clinical_review_summary(
    *,
    current_status: Any,
    future_risk: Any,
    future_confidence: Any = None,
    prediction_warning: Optional[str] = None,
) -> tuple[bool, str]:
    current = normalize_current_status(current_status)
    future = normalize_future_risk(future_risk)

    if future == "NOT AVAILABLE":
        if current_status_severity(current) >= 4:
            return True, f"Current nutritional status is {current}; clinical review is required."
        return False, "2-month future risk prediction is not available."

    try:
        confidence = float(future_confidence) if future_confidence is not None else None
    except (TypeError, ValueError):
        confidence = None

    if confidence is not None and confidence < 0.60:
        return True, "Future prediction confidence is low; clinical review is recommended."
    if prediction_warning:
        return False, prediction_warning
    if current_status_severity(current) >= 4:
        return True, f"Current nutritional status is {current}; clinical review is required."
    if future_risk_severity(future) >= 3:
        return True, f"2-month predicted risk is {future}; early intervention and closer follow-up are recommended."
    if future_risk_severity(future) > current_status_severity(current):
        return True, "Future predicted risk is worse than current nutritional status."
    return False, "Routine monitoring recommended."


def prediction_time() -> datetime:
    return datetime.utcnow()


def normalize_edema(value: Any) -> Optional[bool]:
    if value is None or value == "":
        return None
    raw = str(value).strip().lower()
    if raw in {"yes", "y", "true", "1", "present", "positive"}:
        return True
    if raw in {"no", "n", "false", "0", "absent", "negative"}:
        return False
    return None


def muac_assessment(value: Any) -> tuple[Optional[float], str, bool, Optional[str]]:
    """Return parsed MUAC, status, clinical flag, and validation error."""
    if value is None or value == "":
        return None, "Not Recorded", False, None
    try:
        muac = float(value)
    except (TypeError, ValueError):
        return None, "Invalid", True, "MUAC must be a valid number."
    if muac < 0:
        return None, "Invalid", True, "MUAC cannot be negative."
    if muac < 5 or muac > 30:
        return muac, "Unrealistic", True, "MUAC value is outside the realistic range."
    if muac < 11.5:
        return muac, "Severe Low", True, None
    if muac < 12.5:
        return muac, "Low", True, None
    return muac, "Normal", False, None


def edema_assessment(value: Any) -> tuple[Optional[bool], str, bool]:
    edema_present = normalize_edema(value)
    if edema_present is None:
        return None, "Not Recorded", False
    if edema_present:
        return True, "Bilateral Pitting Edema Recorded", True
    return False, "Not Recorded" if str(value).strip() == "" else "Not Present", False
