"""
MIDWIFE-specific utility functions
- Area hierarchy mapping
- Z-score calculations
- Risk escalation logic
"""
from datetime import datetime
from typing import Optional, Tuple, Dict
from decimal import Decimal
from backend.extensions import db
from backend.models_hierarchical import Area, AreaLevel, Child, RiskLevel, UserRole


def get_area_hierarchy(phm_area_id: int) -> Dict[str, Optional[int]]:
    """
    Get full hierarchy for a PHM area:
    PHM → MOH → RDHS → PDHS
    
    Returns dict with: phm_area_id, moh_id, district_id, province_id
    """
    phm_area = db.session.get(Area, phm_area_id)
    if not phm_area or phm_area.level != AreaLevel.PHM.value:
        raise ValueError(f"Invalid PHM area ID: {phm_area_id}")
    
    hierarchy = {
        "phm_area_id": phm_area_id,
        "moh_id": None,
        "district_id": None,
        "province_id": None,
    }
    
    # Walk up the hierarchy
    current = phm_area.parent
    while current:
        if current.level == AreaLevel.MOH.value:
            hierarchy["moh_id"] = current.id
        elif current.level == AreaLevel.RDHS.value:
            hierarchy["district_id"] = current.id
        elif current.level == AreaLevel.PDHS.value:
            hierarchy["province_id"] = current.id
        current = current.parent
    
    return hierarchy


def calculate_z_scores(
    age_months: int,
    sex: str,
    weight_kg: float,
    height_cm: float
) -> Dict[str, Optional[float]]:
    """
    Calculate Z-scores using WHO growth standards.
    Simplified implementation - in production, use WHO anthro package.
    
    Returns: {z_wfa, z_hfa, z_wfh}
    """
    # This is a simplified placeholder
    # In production, use proper WHO growth reference tables
    # For now, return None to indicate calculation needed via AI model
    
    # TODO: Implement proper WHO Z-score calculation
    # Using WHO Anthro package or lookup tables
    
    return {
        "z_wfa": None,  # Weight-for-age Z-score
        "z_hfa": None,  # Height-for-age Z-score
        "z_wfh": None,  # Weight-for-height Z-score
    }


def determine_risk_level_from_z_scores(
    z_wfa: Optional[float],
    z_hfa: Optional[float],
    z_wfh: Optional[float]
) -> Tuple[str, str]:
    """
    Determine risk level from Z-scores based on WHO standards.
    
    SAM: Z-score < -3
    MAM: Z-score -3 to -2
    NORMAL: Z-score >= -2
    
    Returns: (risk_level, reason)
    """
    if z_wfa is not None:
        if z_wfa < -3:
            return RiskLevel.SAM.value, f"Severe underweight (Z-score: {z_wfa:.2f})"
        elif z_wfa < -2:
            return RiskLevel.MAM.value, f"Moderate underweight (Z-score: {z_wfa:.2f})"
    
    if z_wfh is not None:
        if z_wfh < -3:
            return RiskLevel.SAM.value, f"Severe wasting (Z-score: {z_wfh:.2f})"
        elif z_wfh < -2:
            return RiskLevel.MAM.value, f"Moderate wasting (Z-score: {z_wfh:.2f})"
    
    if z_hfa is not None:
        if z_hfa < -3:
            return RiskLevel.SAM.value, f"Severe stunting (Z-score: {z_hfa:.2f})"
        elif z_hfa < -2:
            return RiskLevel.MAM.value, f"Moderate stunting (Z-score: {z_hfa:.2f})"
    
    return RiskLevel.NORMAL.value, "Normal growth indicators"


def should_escalate_to_moh(
    previous_risk: Optional[str],
    new_risk: str
) -> bool:
    """
    Determine if child should be escalated to MOH.
    
    Escalate if:
    - Previous risk was NORMAL and new risk is MAM or SAM
    - Previous risk was MAM and new risk is SAM
    """
    if not previous_risk or previous_risk == RiskLevel.NORMAL.value:
        return new_risk in [RiskLevel.MAM.value, RiskLevel.SAM.value]
    
    if previous_risk == RiskLevel.MAM.value:
        return new_risk == RiskLevel.SAM.value
    
    return False


def can_midwife_access_child(midwife_user, child: Child) -> bool:
    """
    Check if midwife can access a child.
    Midwife can access children assigned to her PHM area.
    Looks up PHM area via WorkerAreaMapping (authoritative) then falls back to User.phm_area_id.
    """
    from backend.models_hierarchical import WorkerAreaMapping, Area, AreaLevel

    # Resolve midwife's PHM area from WorkerAreaMapping (authoritative source)
    phm_mapping = db.session.query(WorkerAreaMapping).join(Area).filter(
        WorkerAreaMapping.user_id == midwife_user.id,
        WorkerAreaMapping.is_active == True,
        Area.level == AreaLevel.PHM.value
    ).first()

    midwife_phm_area_id = phm_mapping.area_id if phm_mapping else getattr(midwife_user, "phm_area_id", None)

    if not midwife_phm_area_id:
        return False

    return child.phm_area_id == midwife_phm_area_id
