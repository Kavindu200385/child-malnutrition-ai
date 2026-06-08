"""
Shared risk-level classification helpers.

Used by admin_routes, pdhs, rdhs, and reporting to bucket child
current_risk_level values into SAM / MAM / Normal categories.
Recognises both the Measurement vocabulary (SAM, MAM, NORMAL) and
the Visit vocabulary (CRITICAL, HIGH, MODERATE, LOW).
"""
from __future__ import annotations


def is_sam(risk: str | None) -> bool:
    """Return True when risk maps to the SAM (severe) bucket."""
    return (risk or "").upper() in ("SAM", "CRITICAL")


def is_mam(risk: str | None) -> bool:
    """Return True when risk maps to the MAM (moderate) bucket."""
    return (risk or "").upper() in ("MAM", "MODERATE", "HIGH")


def is_normal(risk: str | None) -> bool:
    """Return True when risk maps to the Normal bucket."""
    return (risk or "").upper() in ("NORMAL", "LOW")


def display_risk_level(child) -> str:
    """
    Pick the risk level to show for a child:
    - if no clinic measurement yet (last_risk_update is None) and birth_risk_level is set → use birth_risk_level
    - otherwise → use current_risk_level
    - final fallback → "NORMAL"
    """
    birth = (getattr(child, "birth_risk_level", None) or "").upper()
    current = (getattr(child, "current_risk_level", None) or "").upper()
    if not getattr(child, "last_risk_update", None) and birth:
        return birth
    return current or birth or "NORMAL"
