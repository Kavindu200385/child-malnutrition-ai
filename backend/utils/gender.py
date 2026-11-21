"""Reusable gender normalization helpers."""
from __future__ import annotations

from typing import Any, Optional


MALE_VALUES = {"male", "m", "boy"}
FEMALE_VALUES = {"female", "f", "girl"}


def normalize_gender(value: Any) -> Optional[str]:
    raw = str(value or "").strip().lower()
    if raw in MALE_VALUES:
        return "male"
    if raw in FEMALE_VALUES:
        return "female"
    return None


def normalize_gender_to_sex(value: Any) -> Optional[str]:
    normalized = normalize_gender(value)
    if normalized == "male":
        return "M"
    if normalized == "female":
        return "F"
    return None


def validate_gender(value: Any) -> tuple[Optional[str], Optional[str]]:
    normalized = normalize_gender(value)
    if normalized is None:
        return None, "Gender must be one of: male, female, M, F, boy, or girl."
    return normalized, None
