"""Rule-based current nutritional status assessment using WHO Z-scores."""
from __future__ import annotations

from typing import Any, Optional


def underweight_status_from_wfa(z_score: Optional[float]) -> str:
    if z_score is None:
        return "NOT AVAILABLE"
    if z_score < -3:
        return "SEVERE UNDERWEIGHT"
    if z_score < -2:
        return "UNDERWEIGHT"
    return "NORMAL"


def stunting_status_from_hfa(z_score: Optional[float]) -> str:
    if z_score is None:
        return "NOT AVAILABLE"
    if z_score < -3:
        return "SEVERE STUNTING"
    if z_score < -2:
        return "STUNTING"
    return "NORMAL"


def wasting_status_from_wfh(z_score: Optional[float]) -> str:
    if z_score is None:
        return "NOT AVAILABLE"
    if z_score < -3:
        return "SAM"
    if z_score < -2:
        return "MAM"
    return "NORMAL"


def _legacy_risk_from_current_status(current_status: str) -> str:
    return current_status if current_status in {"SAM", "MAM"} else "NORMAL"


def assess_current_nutritional_status(
    *,
    z_score_wfa: Optional[float],
    z_score_hfa: Optional[float],
    z_score_wfh: Optional[float],
    muac_status: Optional[str],
    edema_status: Optional[str],
) -> dict[str, Any]:
    underweight_status = underweight_status_from_wfa(z_score_wfa)
    stunting_status = stunting_status_from_hfa(z_score_hfa)
    wasting_status = wasting_status_from_wfh(z_score_wfh)
    muac_status_value = str(muac_status or "Not Recorded")
    edema_status_value = str(edema_status or "Not Recorded")

    if edema_status_value == "Edema Present":
        current_status = "SAM"
    elif wasting_status == "SAM" or muac_status_value == "SAM Warning":
        current_status = "SAM"
    elif wasting_status == "MAM" or muac_status_value == "MAM Warning":
        current_status = "MAM"
    elif stunting_status == "SEVERE STUNTING":
        current_status = "SEVERE STUNTING"
    elif stunting_status == "STUNTING":
        current_status = "STUNTING"
    elif underweight_status == "SEVERE UNDERWEIGHT":
        current_status = "SEVERE UNDERWEIGHT"
    elif underweight_status == "UNDERWEIGHT":
        current_status = "UNDERWEIGHT"
    else:
        current_status = "NORMAL"

    breakdown = {
        "underweight_status": underweight_status,
        "stunting_status": stunting_status,
        "wasting_status": wasting_status,
        "muac_status": muac_status_value,
        "edema_status": edema_status_value,
        "z_scores": {
            "wfa": z_score_wfa,
            "hfa": z_score_hfa,
            "wfh": z_score_wfh,
        },
    }

    reasons: list[str] = []
    if edema_status_value == "Edema Present":
        reasons.append("Bilateral pitting edema recorded.")
    if wasting_status == "SAM":
        reasons.append("WFH/WFL Z-score indicates SAM.")
    elif wasting_status == "MAM":
        reasons.append("WFH/WFL Z-score indicates MAM.")
    if muac_status_value == "SAM Warning":
        reasons.append("MUAC indicates SAM warning.")
    elif muac_status_value == "MAM Warning":
        reasons.append("MUAC indicates MAM warning.")
    if stunting_status == "SEVERE STUNTING":
        reasons.append("HFA Z-score indicates severe stunting.")
    elif stunting_status == "STUNTING":
        reasons.append("HFA Z-score indicates stunting.")
    if underweight_status == "SEVERE UNDERWEIGHT":
        reasons.append("WFA Z-score indicates severe underweight.")
    elif underweight_status == "UNDERWEIGHT":
        reasons.append("WFA Z-score indicates underweight.")

    return {
        "current_nutritional_status": current_status,
        "underweight_status": underweight_status,
        "stunting_status": stunting_status,
        "wasting_status": wasting_status,
        "muac_status": muac_status_value,
        "edema_status": edema_status_value,
        "current_status_breakdown": breakdown,
        "legacy_risk_level": _legacy_risk_from_current_status(current_status),
        "clinical_action_required": current_status != "NORMAL" or edema_status_value == "Edema Present",
        "clinical_review_reason": " ".join(dict.fromkeys(reasons)) if reasons else None,
    }
