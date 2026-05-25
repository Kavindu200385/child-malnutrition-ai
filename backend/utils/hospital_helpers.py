"""
Hospital-specific utility functions
- Child ID generation
- SAM detection
- Risk level calculation
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Tuple
from backend.extensions import db
from backend.models_hierarchical import Hospital, Child, BirthRiskLevel


def generate_child_unique_id(hospital_id: int) -> str:
    """
    Generate unique child ID: HOS-{hospital_code}-{YYYY}-{6-digit-sequence}
    Example: HOS-CMBH-2026-000123
    
    Args:
        hospital_id: Hospital ID
        
    Returns:
        Unique child ID string
    """
    hospital = db.session.get(Hospital, hospital_id)
    if not hospital:
        raise ValueError(f"Hospital {hospital_id} not found")
    
    hospital_code = hospital.hospital_code.upper()
    current_year = datetime.now().year
    
    # Get count of children registered this year for this hospital
    year_start = datetime(current_year, 1, 1)
    count = db.session.query(Child).filter(
        Child.hospital_id == hospital_id,
        Child.registration_date >= year_start
    ).count()
    
    # Generate next sequence number (1-indexed, zero-padded to 6 digits)
    next_sequence = count + 1
    sequence_str = f"{next_sequence:06d}"
    
    child_id = f"HOS-{hospital_code}-{current_year}-{sequence_str}"
    
    # Double-check uniqueness (handle edge case)
    existing = db.session.query(Child).filter(Child.child_unique_id == child_id).first()
    if existing:
        # If exists, increment and try again (max 100 attempts)
        for attempt in range(100):
            next_sequence += 1
            sequence_str = f"{next_sequence:06d}"
            child_id = f"HOS-{hospital_code}-{current_year}-{sequence_str}"
            existing = db.session.query(Child).filter(Child.child_unique_id == child_id).first()
            if not existing:
                break
    
    return child_id


def calculate_birth_risk_level(
    birth_weight_kg: Optional[float],
    birth_height_cm: Optional[float],
    birth_muac_cm: Optional[float],
    age_days: int = 0
) -> Tuple[str, str]:
    """
    Calculate birth risk level based on WHO standards for newborns.
    
    SAM thresholds (for 0-6 months):
    - Weight-for-age Z-score < -3
    - MUAC < 11.5 cm (if available)
    - Weight < 2.5 kg (low birth weight indicator)
    
    MAM thresholds:
    - Weight-for-age Z-score -3 to -2
    - MUAC 11.5-12.5 cm
    
    Args:
        birth_weight_kg: Birth weight in kg
        birth_height_cm: Birth height in cm
        birth_muac_cm: Birth MUAC in cm (optional)
        age_days: Age in days (default 0 for newborn)
        
    Returns:
        Tuple of (risk_level, reason)
    """
    if not birth_weight_kg:
        return BirthRiskLevel.NORMAL.value, "Insufficient data"

    # Weight-based classification aligned with WHO WFA z-score thresholds:
    #   < 2.0 kg  → z < -3  → SAM
    #   2.0–2.6 kg → z ≈ -3 to -2 → MAM
    #   ≥ 2.6 kg  → Normal
    if birth_weight_kg < 2.0:
        risk = BirthRiskLevel.SAM.value
        reason = f"Very low birth weight ({birth_weight_kg} kg)"
    elif birth_weight_kg < 2.6:
        risk = BirthRiskLevel.MAM.value
        reason = f"Low birth weight ({birth_weight_kg} kg)"
    else:
        risk = BirthRiskLevel.NORMAL.value
        reason = "Normal birth weight"

    # MUAC override: if MUAC indicates a more severe level, upgrade risk
    if birth_muac_cm:
        if birth_muac_cm < 11.5:
            risk = BirthRiskLevel.SAM.value
            reason = f"MUAC < 11.5 cm ({birth_muac_cm} cm)"
        elif birth_muac_cm < 12.5 and risk == BirthRiskLevel.NORMAL.value:
            risk = BirthRiskLevel.MAM.value
            reason = f"MUAC 11.5–12.5 cm ({birth_muac_cm} cm)"

    return risk, reason


def is_sam_case(birth_risk_level: Optional[str]) -> bool:
    """Check if child is SAM case"""
    return birth_risk_level == BirthRiskLevel.SAM.value
