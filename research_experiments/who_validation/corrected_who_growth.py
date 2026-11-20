"""Isolated WHO 2006 growth-standard calculator used only for research validation.

The calculator reads immutable, sex-specific WHO LMS workbooks in ``references/``.
It deliberately does not import or alter the application calculator.
"""
from __future__ import annotations

from functools import lru_cache
import math
from pathlib import Path
from typing import Literal

from research_experiments.who_validation.scripts.who_reference import read_xlsx

REFERENCE_DIR = Path(__file__).resolve().parent / "references"
MAX_AGE_DAYS = 1856
MIN_AGE_MONTHS = 0
MAX_AGE_MONTHS = 60
LENGTH_METHOD = "recumbent_length"
HEIGHT_METHOD = "standing_height"
MeasurementMethod = Literal["recumbent_length", "standing_height"]

_FILES = {
    ("WFA", "M"): "wfa_boys_0_5_zscores.xlsx",
    ("WFA", "F"): "wfa_girls_0_5_zscores.xlsx",
    ("LHFA", "M"): "lhfa_boys_expanded.xlsx",
    ("LHFA", "F"): "lhfa_girls_expanded.xlsx",
    ("WFL", "M"): "wfl_boys_expanded.xlsx",
    ("WFL", "F"): "wfl_girls_expanded.xlsx",
    ("WFH", "M"): "wfh_boys_expanded.xlsx",
    ("WFH", "F"): "wfh_girls_expanded.xlsx",
}
_KEYS = {"WFA": "Month", "LHFA": "Day", "WFL": "Length", "WFH": "Height"}


class WHOInputError(ValueError):
    """Raised when a value cannot be matched to an official WHO reference row."""


def normalize_sex(sex: str) -> str:
    value = str(sex).strip().lower()
    if value in {"m", "male", "boy"}:
        return "M"
    if value in {"f", "female", "girl"}:
        return "F"
    raise WHOInputError("sex must be one of: M, F, male, female, boy, or girl")


def _positive(value: float, name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise WHOInputError(f"{name} must be numeric") from exc
    if not math.isfinite(parsed) or parsed <= 0:
        raise WHOInputError(f"{name} must be finite and greater than zero")
    return parsed


def _integer(value: int, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise WHOInputError(f"{name} must be an integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise WHOInputError(f"{name} must be an integer") from exc
    if parsed != value or not minimum <= parsed <= maximum:
        raise WHOInputError(f"{name} must be an integer in [{minimum}, {maximum}]")
    return parsed


@lru_cache(maxsize=None)
def _rows(indicator: str, sex: str) -> dict[float, dict[str, float]]:
    filename = _FILES[(indicator, sex)]
    key = _KEYS[indicator]
    rows = read_xlsx(REFERENCE_DIR / filename)
    return {float(row[key]): row for row in rows}


def _exact_row(indicator: str, sex: str, point: float) -> dict[str, float]:
    rows = _rows(indicator, sex)
    if point not in rows:
        minimum, maximum = min(rows), max(rows)
        raise WHOInputError(
            f"{indicator} reference is unavailable at {point}; supported exact keys are "
            f"within [{minimum}, {maximum}]"
        )
    return rows[point]


def _extended_lms_z(value: float, row: dict[str, float]) -> float:
    """WHO LMS z-score with WHO's ±3-SD extension; no arbitrary clipping."""
    l_value, median, sigma = row["L"], row["M"], row["S"]
    z_score = math.log(value / median) / sigma if l_value == 0 else ((value / median) ** l_value - 1) / (l_value * sigma)
    if z_score > 3:
        return 3 + (value - row["SD3"]) / (row["SD3"] - row["SD2"])
    if z_score < -3:
        return -3 + (value - row["SD3neg"]) / (row["SD2neg"] - row["SD3neg"])
    return z_score


def calculate_waz(*, age_months: int, sex: str, weight_kg: float) -> float:
    """Calculate weight-for-age z-score from the official monthly WFA table."""
    age = _integer(age_months, "age_months", MIN_AGE_MONTHS, MAX_AGE_MONTHS)
    return _extended_lms_z(_positive(weight_kg, "weight_kg"), _exact_row("WFA", normalize_sex(sex), float(age)))


def _adjust_length_height(*, age_days: int, length_height_cm: float, measurement_method: MeasurementMethod) -> tuple[float, str]:
    age = _integer(age_days, "age_days", 0, MAX_AGE_DAYS)
    value = _positive(length_height_cm, "length_height_cm")
    if measurement_method not in {LENGTH_METHOD, HEIGHT_METHOD}:
        raise WHOInputError("measurement_method must be recumbent_length or standing_height")
    # WHO recommends recumbent length before 731 days. A standing record below
    # nine months is treated as an invalid position rather than auto-corrected.
    if age < 274 and measurement_method == HEIGHT_METHOD:
        raise WHOInputError("standing_height is unsupported for children younger than 9 months")
    if age < 731:
        return (value + 0.7 if measurement_method == HEIGHT_METHOD else value), "WFL"
    return (value - 0.7 if measurement_method == LENGTH_METHOD else value), "WFH"


def calculate_haz(*, age_days: int, sex: str, length_height_cm: float, measurement_method: MeasurementMethod) -> float:
    """Calculate length/height-for-age after the official 0.7-cm adjustment."""
    age = _integer(age_days, "age_days", 0, MAX_AGE_DAYS)
    adjusted, _ = _adjust_length_height(
        age_days=age, length_height_cm=length_height_cm, measurement_method=measurement_method
    )
    return _extended_lms_z(adjusted, _exact_row("LHFA", normalize_sex(sex), float(age)))


def calculate_wlz(*, sex: str, weight_kg: float, recumbent_length_cm: float) -> float:
    """Calculate weight-for-recumbent-length z-score from the official WFL table."""
    length = _positive(recumbent_length_cm, "recumbent_length_cm")
    return _extended_lms_z(_positive(weight_kg, "weight_kg"), _exact_row("WFL", normalize_sex(sex), length))


def calculate_whz(*, sex: str, weight_kg: float, standing_height_cm: float) -> float:
    """Calculate weight-for-standing-height z-score from the official WFH table."""
    height = _positive(standing_height_cm, "standing_height_cm")
    return _extended_lms_z(_positive(weight_kg, "weight_kg"), _exact_row("WFH", normalize_sex(sex), height))


def calculate_growth_z_scores(
    *, age_months: int, age_days: int, sex: str, weight_kg: float,
    length_height_cm: float, measurement_method: MeasurementMethod,
) -> dict[str, float | str | None]:
    """Calculate WAZ, HAZ and the age-appropriate WFL or WFH indicator.

    The monthly WFA and daily LHFA keys are intentionally explicit. The function
    rejects unsupported values instead of interpolating, extrapolating, or clipping.
    """
    age = _integer(age_days, "age_days", 0, MAX_AGE_DAYS)
    normalized_sex = normalize_sex(sex)
    adjusted, indicator = _adjust_length_height(
        age_days=age, length_height_cm=length_height_cm, measurement_method=measurement_method
    )
    result: dict[str, float | str | None] = {
        "waz": calculate_waz(age_months=age_months, sex=normalized_sex, weight_kg=weight_kg),
        "haz": calculate_haz(age_days=age, sex=normalized_sex, length_height_cm=length_height_cm, measurement_method=measurement_method),
        "wlz": None,
        "whz": None,
        "length_height_indicator": indicator,
        "adjusted_length_height_cm": adjusted,
    }
    if indicator == "WFL":
        result["wlz"] = calculate_wlz(sex=normalized_sex, weight_kg=weight_kg, recumbent_length_cm=adjusted)
    else:
        result["whz"] = calculate_whz(sex=normalized_sex, weight_kg=weight_kg, standing_height_cm=adjusted)
    return result


def classify_anthropometric_indicators(*, waz: float | None, haz: float | None, wlz: float | None = None, whz: float | None = None) -> dict[str, str]:
    """Return independent screening categories; this does not diagnose MAM or SAM."""
    if wlz is not None and whz is not None:
        raise WHOInputError("provide either wlz or whz, not both")
    wasting_z = wlz if wlz is not None else whz

    def status(value: float | None, moderate: str, severe: str) -> str:
        if value is None:
            return "not_available"
        if value < -3:
            return severe
        if value < -2:
            return moderate
        return "normal"

    return {
        "underweight": status(waz, "underweight", "severe_underweight"),
        "stunting": status(haz, "stunting", "severe_stunting"),
        "wasting": status(wasting_z, "wasting", "severe_wasting"),
    }
