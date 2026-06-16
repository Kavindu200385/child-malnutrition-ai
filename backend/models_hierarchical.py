"""
Hierarchical Area System Models
Complete redesign with 5-level hierarchy and strict RBAC
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from enum import Enum

from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import ForeignKey, CheckConstraint, Index, Numeric, event, or_
from sqlalchemy.orm import relationship

from backend.extensions import db
from backend.services.encryption_service import (
    EncryptedDate,
    EncryptedDecimal,
    EncryptedFloat,
    EncryptedJSON,
    EncryptedText,
)


# ============================================================================
# ENUMS
# ============================================================================

class AreaLevel(str, Enum):
    """Area hierarchy levels"""
    MINISTRY = "ministry"
    PDHS = "pdhs"
    RDHS = "rdhs"
    MOH = "moh"
    PHM = "phm"


class UserRole(str, Enum):
    """User roles in the system"""
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    HEALTH_MINISTRY = "health_ministry"  # Ministry (Admin) or System Developer (superadmin)
    PDHS = "pdhs"  # Provincial Admin
    RDHS = "rdhs"  # District Admin
    MOH = "moh"  # Medical Officer of Health
    AMOH = "amoh"  # Assistant MOH (same permissions as MOH)
    MIDWIFE = "midwife"  # PHM
    NUTRITIONIST = "nutritionist"  # Hospital role
    HOSPITAL = "hospital"  # Hospital registration


class RiskLevel(str, Enum):
    """Child risk levels"""
    NORMAL = "NORMAL"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    MAM = "MAM"  # Moderate Acute Malnutrition
    SAM = "SAM"  # Severe Acute Malnutrition


class BirthRiskLevel(str, Enum):
    """Birth risk levels for hospital registration"""
    NORMAL = "NORMAL"
    MAM = "MAM"
    SAM = "SAM"


class TransferStatus(str, Enum):
    """Child transfer status for hospital"""
    NONE = "NONE"
    TRANSFERRED_TO_NUTRITIONIST = "TRANSFERRED_TO_NUTRITIONIST"


class EscalationStatus(str, Enum):
    """Child escalation status"""
    NONE = "NONE"
    ESCALATED_TO_MOH = "ESCALATED_TO_MOH"
    ESCALATED_TO_NUTRITIONIST = "ESCALATED_TO_NUTRITIONIST"


class EscalationRecordStatus(str, Enum):
    """Escalation record status"""
    PENDING = "PENDING"
    REVIEWED = "REVIEWED"
    REJECTED = "REJECTED"


class ReferralStatus(str, Enum):
    """Referral status"""
    PENDING = "PENDING"
    REVIEWED = "REVIEWED"
    REJECTED = "REJECTED"


class ChildTransferStatus(str, Enum):
    """Child transfer status for area transfers"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class AreaChangeStatus(str, Enum):
    """Area change request status"""
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class OTPPurpose(str, Enum):
    """OTP use cases."""
    LOGIN_2FA = "login_2fa"
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFICATION = "email_verification"


# ============================================================================
# AREA HIERARCHY MODEL
# ============================================================================

class Area(db.Model):
    """
    Hierarchical Area System
    Ministry → PDHS → RDHS → Hospital (Nutritionist) → MOH → PHM → Hospital (Birth)
    Each area must have exactly one parent (except Ministry which has no parent)
    """
    __tablename__ = "areas"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False, index=True)
    code = db.Column(db.String(50), unique=True, nullable=True, index=True)  # Unique area code
    level = db.Column(db.String(20), nullable=False, index=True)  # ministry, pdhs, rdhs, moh, phm
    parent_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)
    
    # Additional metadata
    district = db.Column(db.String(120), nullable=True)
    province = db.Column(db.String(120), nullable=True)
    description = db.Column(db.Text, nullable=True)
    
    # Soft delete
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    parent = relationship("Area", remote_side=[id], backref="children")
    
    # Constraints
    __table_args__ = (
        CheckConstraint("level IN ('ministry', 'pdhs', 'rdhs', 'moh', 'phm')", name="check_area_level"),
        Index("idx_area_level_parent", "level", "parent_id"),
    )

    def to_dict(self, include_children: bool = False) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "level": self.level,
            "parent_id": self.parent_id,
            "district": self.district,
            "province": self.province,
            "description": self.description,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_children and self.children:
            data["children"] = [c.to_dict() for c in self.children if c.is_active]
        return data

    def get_full_path(self) -> str:
        """Get full hierarchical path (e.g., 'Ministry > Western > Colombo > MOH Area 1 > PHM Area A')"""
        path = [self.name]
        current = self.parent
        while current:
            path.insert(0, current.name)
            current = current.parent
        return " > ".join(path)

    def has_children(self) -> bool:
        """Check if area has active child areas"""
        return db.session.query(Area).filter(
            Area.parent_id == self.id,
            Area.is_active == True
        ).count() > 0

    def has_linked_children(self) -> bool:
        """Check if area is referenced by any child assignment field."""
        return db.session.query(Child).filter(
            or_(
                Child.current_assigned_area_id == self.id,
                Child.phm_area_id == self.id,
                Child.moh_area_id == self.id,
            )
        ).count() > 0

    def has_linked_workers(self) -> bool:
        """Check if area has linked workers"""
        return db.session.query(WorkerAreaMapping).filter(
            WorkerAreaMapping.area_id == self.id,
            WorkerAreaMapping.is_active == True
        ).count() > 0


# ============================================================================
# USER MODEL (Updated with new roles)
# ============================================================================

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), nullable=True, unique=True, index=True)
    phone = db.Column(db.String(40), nullable=True)
    
    # Role (one of the 7 roles)
    role = db.Column(db.String(32), nullable=False, index=True)
    
    # Legacy fields (kept for backward compatibility during migration)
    clinic = db.Column(db.String(120), nullable=True)
    district = db.Column(db.String(120), nullable=True)
    hospital_id = db.Column(db.Integer, ForeignKey("hospitals.id"), nullable=True, index=True)  # For hospital-linked roles (e.g. nutritionist)

    # Midwife/MOH assignment (for transfer management)
    staff_id = db.Column(db.String(64), nullable=True, index=True)  # Staff ID for search
    phm_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)  # Assigned PHM area
    moh_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)  # MOH user who manages this worker
    assignment_status = db.Column(db.String(32), nullable=True, default="ACTIVE", index=True)  # ACTIVE | UNASSIGNED
    
    # Soft delete
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    
    # Protected user (cannot be deleted) - for system developer (superadmin)
    is_protected = db.Column(db.Boolean, nullable=False, default=False, index=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)

    # Relationships (foreign_keys required: User has two self-FKs: created_by_id, moh_id)
    created_by = relationship("User", remote_side=[id], foreign_keys=[created_by_id])
    managed_by_moh = relationship("User", remote_side=[id], foreign_keys=[moh_id])
    assigned_phm_area = relationship("Area", foreign_keys=[phm_area_id])
    assigned_hospital = relationship("Hospital", foreign_keys=[hospital_id])
    worker_areas = relationship("WorkerAreaMapping", foreign_keys="WorkerAreaMapping.user_id", back_populates="user", lazy=True)
    created_children = relationship("Child", foreign_keys="Child.registered_by_user_id", back_populates="registered_by_user")
    created_visits = relationship("Visit", back_populates="created_by_user")
    created_measurements = relationship("Measurement", foreign_keys="Measurement.measured_by_user_id", back_populates="measured_by")
    created_escalations = relationship("ChildEscalation", foreign_keys="ChildEscalation.escalated_by_user_id", back_populates="escalated_by")
    created_clinic_reports = relationship("ClinicReport", foreign_keys="ClinicReport.created_by_user_id", back_populates="created_by")
    transfer_requests = relationship("ChildTransfer", foreign_keys="ChildTransfer.requested_by_user_id", back_populates="requested_by_user")
    transfer_approvals = relationship("ChildTransfer", foreign_keys="ChildTransfer.approved_by_user_id", back_populates="approved_by_user")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self, include_areas: bool = False) -> dict:
        data = {
            "id": self.id,
            "username": self.username,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "role": self.role,
            "clinic": self.clinic,
            "district": self.district,
            "hospital_id": self.hospital_id,
            "is_active": self.is_active,
            "is_protected": self.is_protected,
            "staff_id": self.staff_id,
            "phm_area_id": self.phm_area_id,
            "moh_id": self.moh_id,
            "assignment_status": self.assignment_status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if self.assigned_hospital:
            data["hospital"] = self.assigned_hospital.to_dict()
        if include_areas:
            data["assigned_areas"] = [wa.area.to_dict() for wa in self.worker_areas if wa.is_active]
        return data

    def can_access_area(self, area_id: int) -> bool:
        """Check if user can access a specific area based on their assigned areas"""
        if self.role == UserRole.HEALTH_MINISTRY:
            return True  # Super admin can access all
        
        # Check if user is assigned to this area or any parent area
        assigned_area_ids = [wa.area_id for wa in self.worker_areas if wa.is_active]
        if not assigned_area_ids:
            return False
        
        # Get area and check hierarchy
        area = db.session.get(Area, area_id)
        if not area:
            return False
        
        # Check if user's area is parent/ancestor of target area
        current = area
        while current:
            if current.id in assigned_area_ids:
                return True
            current = current.parent
        
        return False


# ============================================================================
# WORKER AREA MAPPING
# ============================================================================

class WorkerAreaMapping(db.Model):
    """
    Maps workers to their assigned areas
    A worker can be assigned to multiple areas (e.g., MOH can manage multiple MOH areas)
    """
    __tablename__ = "worker_area_mapping"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)
    
    # Soft delete
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    created_by_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="worker_areas")
    area = relationship("Area", foreign_keys=[area_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("idx_worker_area_unique", "user_id", "area_id", unique=True),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "area_id": self.area_id,
            "area": self.area.to_dict() if self.area else None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# HOSPITAL MODEL
# ============================================================================

class Hospital(db.Model):
    """Hospital master table"""
    __tablename__ = "hospitals"

    id = db.Column(db.Integer, primary_key=True)
    hospital_name = db.Column(db.String(200), nullable=False, index=True)
    hospital_code = db.Column(db.String(20), unique=True, nullable=False, index=True)  # e.g., CMBH, GMPH
    district = db.Column(db.String(120), nullable=True, index=True)
    province = db.Column(db.String(120), nullable=True)
    address = db.Column(db.Text, nullable=True)
    contact_phone = db.Column(db.String(40), nullable=True)
    
    # Soft delete
    is_active = db.Column(db.Boolean, nullable=False, default=True, index=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    children = relationship("Child", back_populates="hospital")
    # users relationship removed - users are linked via WorkerAreaMapping instead

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "hospital_name": self.hospital_name,
            "hospital_code": self.hospital_code,
            "district": self.district,
            "province": self.province,
            "address": self.address,
            "contact_phone": self.contact_phone,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# CHILD MODEL (Updated with hospital fields)
# ============================================================================

class Child(db.Model):
    __tablename__ = "children"

    id = db.Column(db.Integer, primary_key=True)
    child_unique_id = db.Column(db.String(64), unique=True, nullable=True, index=True)  # HOS-{code}-{YYYY}-{seq}
    child_id = db.Column(db.String(64), unique=True, nullable=True, index=True)  # Legacy field, kept for compatibility (nullable for hospital registration)
    name = db.Column(EncryptedText, nullable=True)
    dob = db.Column(EncryptedDate, nullable=True)
    gender = db.Column(db.String(16), nullable=True)  # 'male' | 'female'
    
    # Birth measurements (for hospital registration)
    birth_weight_kg = db.Column(EncryptedDecimal(scale=2), nullable=True)
    birth_height_cm = db.Column(EncryptedDecimal(scale=1), nullable=True)
    
    # Parent/Guardian details
    guardian_name = db.Column(EncryptedText, nullable=True)
    mother_name = db.Column(EncryptedText, nullable=True)  # Added for hospital
    guardian_phone = db.Column(EncryptedText, nullable=True)
    guardian_email = db.Column(EncryptedText, nullable=True)
    guardian_nic = db.Column(EncryptedText, nullable=True)
    address = db.Column(EncryptedText, nullable=True)
    
    # Hospital registration (REQUIRED for hospital role)
    hospital_id = db.Column(db.Integer, ForeignKey("hospitals.id"), nullable=True, index=True)
    registered_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    registered_by_clinic = db.Column(db.String(120), nullable=True)  # Legacy field
    registration_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    # Birth risk assessment
    birth_risk_level = db.Column(db.String(20), nullable=True, index=True)  # NORMAL, MAM, SAM
    
    # Transfer status (for hospital → nutritionist)
    transfer_status = db.Column(db.String(50), nullable=False, default=TransferStatus.NONE.value, index=True)
    is_transferred = db.Column(db.Boolean, nullable=False, default=False, index=True)
    
    # Current assignment (for area-based roles)
    current_assigned_role = db.Column(db.String(32), nullable=True, index=True)  # Current role managing child
    current_assigned_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)
    current_assigned_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    
    # Area assignments (for MIDWIFE role - hierarchical mapping)
    phm_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)  # PHM area (midwife's area)
    moh_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)  # MOH area (parent of PHM)
    district_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)  # RDHS area (parent of MOH)
    province_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)  # PDHS area (parent of RDHS)
    assigned_date = db.Column(db.DateTime, nullable=True, index=True)  # When child was assigned to PHM area
    
    # Escalation status
    escalation_status = db.Column(db.String(50), nullable=False, default=EscalationStatus.NONE.value, index=True)
    
    # Area assignments (legacy fields for backward compatibility)
    assigned_to_clinic = db.Column(db.String(120), nullable=True)
    midwife_area = db.Column(db.String(120), nullable=True)
    moh_area = db.Column(db.String(120), nullable=True)
    
    # Risk status (for ongoing monitoring)
    current_risk_level = db.Column(db.String(32), nullable=True, default=RiskLevel.NORMAL.value, index=True)
    last_risk_update = db.Column(db.DateTime, nullable=True)
    
    # Draft flag
    is_draft = db.Column(db.Boolean, nullable=False, default=False, index=True)
    
    # Status
    status = db.Column(db.String(32), nullable=False, default="ACTIVE", index=True)  # ACTIVE, TRANSFERRED, INACTIVE
    
    # Birth registration data (JSON)
    birth_registration = db.Column(EncryptedJSON, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    hospital = relationship("Hospital", foreign_keys=[hospital_id], back_populates="children")
    registered_by_user = relationship("User", foreign_keys=[registered_by_user_id], back_populates="created_children")
    current_assigned_area = relationship("Area", foreign_keys=[current_assigned_area_id])
    current_assigned_user = relationship("User", foreign_keys=[current_assigned_user_id])
    phm_area = relationship("Area", foreign_keys=[phm_area_id], post_update=True)
    moh_area = relationship("Area", foreign_keys=[moh_area_id], post_update=True)
    district_area = relationship("Area", foreign_keys=[district_id], post_update=True)
    province_area = relationship("Area", foreign_keys=[province_id], post_update=True)
    midwife_area_rel = relationship("Area", foreign_keys=[phm_area_id], overlaps="phm_area")  # Legacy - same as phm_area
    moh_area_rel = relationship("Area", foreign_keys=[moh_area_id], overlaps="moh_area")  # Legacy
    visits = relationship("Visit", backref="child", lazy=True, cascade="all, delete-orphan", order_by="Visit.visit_date.desc()")
    transfers = relationship("ChildTransfer", back_populates="child", lazy=True, order_by="ChildTransfer.created_at.desc()")
    referrals = relationship("ChildReferral", back_populates="child", lazy=True, order_by="ChildReferral.created_at.desc()")
    escalations = relationship("ChildEscalation", back_populates="child", lazy=True, order_by="ChildEscalation.created_at.desc()")
    measurements = relationship("Measurement", back_populates="child", lazy=True, order_by="Measurement.measurement_date.desc()")

    def to_dict(self, include_visits: bool = False, include_transfers: bool = False, include_referrals: bool = False, include_escalations: bool = False) -> dict:
        data = {
            "id": self.id,
            "child_unique_id": self.child_unique_id or self.child_id,  # Use new field, fallback to legacy
            "child_id": self.child_id,  # Legacy field
            "name": self.name,
            "dob": self.dob.isoformat() if self.dob else None,
            "gender": self.gender,
            "birth_weight_kg": float(self.birth_weight_kg) if self.birth_weight_kg else None,
            "birth_height_cm": float(self.birth_height_cm) if self.birth_height_cm else None,
            "guardian_name": self.guardian_name,
            "mother_name": self.mother_name,
            "guardian_phone": self.guardian_phone,
            "guardian_email": self.guardian_email,
            "guardian_nic": self.guardian_nic,
            "address": self.address,
            "hospital_id": self.hospital_id,
            "hospital": self.hospital.to_dict() if self.hospital else None,
            "registered_by_user_id": self.registered_by_user_id,
            "registered_by_clinic": self.registered_by_clinic,
            "registration_date": self.registration_date.isoformat() if self.registration_date else None,
            "birth_risk_level": self.birth_risk_level,
            "transfer_status": self.transfer_status,
            "is_transferred": self.is_transferred,
            "phm_area_id": self.phm_area_id,
            "phm_area": self.phm_area.to_dict() if self.phm_area else None,
            "moh_area_id": self.moh_area_id,
            "moh_area": self.moh_area.to_dict() if self.moh_area else None,
            "district_id": self.district_id,
            "province_id": self.province_id,
            "assigned_date": self.assigned_date.isoformat() if self.assigned_date else None,
            "escalation_status": self.escalation_status,
            "current_assigned_role": self.current_assigned_role,
            "current_assigned_area_id": self.current_assigned_area_id,
            "current_assigned_area": self.current_assigned_area.to_dict() if self.current_assigned_area else None,
            "current_assigned_user_id": self.current_assigned_user_id,
            "current_risk_level": self.current_risk_level,
            "last_risk_update": self.last_risk_update.isoformat() if self.last_risk_update else None,
            "is_draft": self.is_draft,
            "status": self.status,
            "birth_registration": self.birth_registration,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_visits:
            data["visits"] = [v.to_dict() for v in self.visits]
            data["measurements"] = [m.to_dict() for m in self.measurements]
        if include_transfers:
            data["transfers"] = [t.to_dict() for t in self.transfers]
        if include_referrals:
            data["referrals"] = [r.to_dict() for r in self.referrals]
        if include_escalations:
            data["escalations"] = [e.to_dict() for e in self.escalations]
        return data


# ============================================================================
# MEASUREMENT MODEL (MIDWIFE Clinic Visit Data)
# ============================================================================

class Measurement(db.Model):
    """
    Clinic visit measurements taken by MIDWIFE during clinic visits.
    This stores the actual clinic visit data collected at the clinic.
    """
    __tablename__ = "measurements"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    
    # Measurement data (collected at clinic)
    measurement_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    weight_kg = db.Column(EncryptedDecimal(scale=2), nullable=False)
    height_cm = db.Column(EncryptedDecimal(scale=1), nullable=False)
    muac_cm = db.Column(EncryptedDecimal(scale=1), nullable=True)
    
    # Calculated Z-scores
    z_score_wfa = db.Column(EncryptedDecimal(scale=2), nullable=True)  # Weight-for-age
    z_score_hfa = db.Column(EncryptedDecimal(scale=2), nullable=True)  # Height-for-age
    z_score_wfh = db.Column(EncryptedDecimal(scale=2), nullable=True)  # Weight-for-height
    
    # AI analysis results
    risk_level = db.Column(db.String(20), nullable=True, index=True)  # NORMAL, MAM, SAM
    predicted_risk_next_2_months = db.Column(db.String(20), nullable=True)
    model_confidence = db.Column(EncryptedDecimal(scale=2), nullable=True)
    
    # Measured by (midwife who collected the clinic data)
    measured_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Notes
    notes = db.Column(EncryptedText, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    child = relationship("Child", foreign_keys=[child_id], back_populates="measurements")
    measured_by = relationship("User", foreign_keys=[measured_by_user_id], back_populates="created_measurements")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id,
            "measurement_date": self.measurement_date.isoformat() if self.measurement_date else None,
            "weight_kg": float(self.weight_kg) if self.weight_kg else None,
            "height_cm": float(self.height_cm) if self.height_cm else None,
            "muac_cm": float(self.muac_cm) if self.muac_cm else None,
            "z_score_wfa": float(self.z_score_wfa) if self.z_score_wfa else None,
            "z_score_hfa": float(self.z_score_hfa) if self.z_score_hfa else None,
            "z_score_wfh": float(self.z_score_wfh) if self.z_score_wfh else None,
            "risk_level": self.risk_level,
            "predicted_risk_next_2_months": self.predicted_risk_next_2_months,
            "model_confidence": float(self.model_confidence) if self.model_confidence else None,
            "measured_by_user_id": self.measured_by_user_id,
            "measured_by": self.measured_by.to_dict() if self.measured_by else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# CHILD ESCALATION MODEL
# ============================================================================

class ChildEscalation(db.Model):
    """
    Escalations from MIDWIFE to MOH when risk increases during clinic visits.
    """
    __tablename__ = "child_escalations"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    
    # Escalation details
    escalated_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    from_role = db.Column(db.String(32), nullable=False, default="midwife")
    to_role = db.Column(db.String(32), nullable=False, default="moh")
    moh_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)  # MOH area ID
    
    # Escalation reason
    reason = db.Column(EncryptedText, nullable=True)
    previous_risk_level = db.Column(db.String(20), nullable=True)
    new_risk_level = db.Column(db.String(20), nullable=True)
    
    # Status
    status = db.Column(db.String(20), nullable=False, default=EscalationRecordStatus.PENDING.value, index=True)
    reviewed_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    review_notes = db.Column(EncryptedText, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    child = relationship("Child", foreign_keys=[child_id], back_populates="escalations")
    escalated_by = relationship("User", foreign_keys=[escalated_by_user_id], back_populates="created_escalations")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])
    moh_area = relationship("Area", foreign_keys=[moh_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id,
            "child": self.child.to_dict() if self.child else None,
            "escalated_by_user_id": self.escalated_by_user_id,
            "escalated_by": self.escalated_by.to_dict() if self.escalated_by else None,
            "from_role": self.from_role,
            "to_role": self.to_role,
            "moh_id": self.moh_id,
            "moh_area": self.moh_area.to_dict() if self.moh_area else None,
            "reason": self.reason,
            "previous_risk_level": self.previous_risk_level,
            "new_risk_level": self.new_risk_level,
            "status": self.status,
            "reviewed_by_user_id": self.reviewed_by_user_id,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_notes": self.review_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# CLINIC REPORT MODEL
# ============================================================================

class ClinicReport(db.Model):
    """
    Monthly clinic reports submitted by MIDWIFE to MOH.
    Aggregates clinic visit data for reporting.
    """
    __tablename__ = "clinic_reports"

    id = db.Column(db.Integer, primary_key=True)
    phm_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)
    
    # Report period
    report_month = db.Column(db.Integer, nullable=False)  # 1-12
    report_year = db.Column(db.Integer, nullable=False, index=True)
    
    # Statistics (aggregated from clinic visits)
    total_children_seen = db.Column(db.Integer, nullable=False, default=0)
    normal_count = db.Column(db.Integer, nullable=False, default=0)
    mam_count = db.Column(db.Integer, nullable=False, default=0)
    sam_count = db.Column(db.Integer, nullable=False, default=0)
    escalated_cases = db.Column(db.Integer, nullable=False, default=0)
    
    # Submission status
    submitted_to_moh = db.Column(db.Boolean, nullable=False, default=False, index=True)
    submitted_at = db.Column(db.DateTime, nullable=True)
    
    # Created by
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    phm_area = relationship("Area", foreign_keys=[phm_area_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id], back_populates="created_clinic_reports")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "phm_area_id": self.phm_area_id,
            "phm_area": self.phm_area.to_dict() if self.phm_area else None,
            "report_month": self.report_month,
            "report_year": self.report_year,
            "total_children_seen": self.total_children_seen,
            "normal_count": self.normal_count,
            "mam_count": self.mam_count,
            "sam_count": self.sam_count,
            "escalated_cases": self.escalated_cases,
            "submitted_to_moh": self.submitted_to_moh,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "created_by_user_id": self.created_by_user_id,
            "created_by": self.created_by.to_dict() if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    __table_args__ = (
        Index("idx_clinic_report_unique", "phm_area_id", "report_month", "report_year", unique=True),
    )


# ============================================================================
# MOH REPORT MODEL (MOH → RDHS monthly reports)
# ============================================================================

class MohReport(db.Model):
    """
    Monthly area reports generated by MOH, can be sent to RDHS.
    """
    __tablename__ = "moh_reports"

    id = db.Column(db.Integer, primary_key=True)
    moh_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)  # MOH user who created report
    moh_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)  # MOH area

    total_children = db.Column(db.Integer, nullable=False, default=0)
    normal_count = db.Column(db.Integer, nullable=False, default=0)
    mam_count = db.Column(db.Integer, nullable=False, default=0)
    sam_count = db.Column(db.Integer, nullable=False, default=0)
    total_escalations = db.Column(db.Integer, nullable=False, default=0)

    month = db.Column(db.Integer, nullable=False)  # 1-12
    report_year = db.Column(db.Integer, nullable=False, index=True)
    sent_to_rdhs = db.Column(db.Boolean, nullable=False, default=False, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    moh_user = relationship("User", foreign_keys=[moh_id])
    moh_area = relationship("Area", foreign_keys=[moh_area_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "moh_id": self.moh_id,
            "moh_area_id": self.moh_area_id,
            "moh_area": self.moh_area.to_dict() if self.moh_area else None,
            "total_children": self.total_children,
            "normal_count": self.normal_count,
            "mam_count": self.mam_count,
            "sam_count": self.sam_count,
            "total_escalations": self.total_escalations,
            "month": self.month,
            "report_year": self.report_year,
            "sent_to_rdhs": self.sent_to_rdhs,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# RDHS REPORT MODEL (District monthly reports, can be sent to PDHS)
# ============================================================================

class RdhsReport(db.Model):
    """
    District-level monthly reports generated by RDHS. Can be sent to PDHS.
    """
    __tablename__ = "rdhs_reports"

    id = db.Column(db.Integer, primary_key=True)
    district_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)  # RDHS area ID
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)

    total_children = db.Column(db.Integer, nullable=False, default=0)
    normal_count = db.Column(db.Integer, nullable=False, default=0)
    mam_count = db.Column(db.Integer, nullable=False, default=0)
    sam_count = db.Column(db.Integer, nullable=False, default=0)
    total_escalations = db.Column(db.Integer, nullable=False, default=0)
    total_returns = db.Column(db.Integer, nullable=False, default=0)  # returns from nutritionist to MOH

    month = db.Column(db.Integer, nullable=False)  # 1-12
    report_year = db.Column(db.Integer, nullable=False, index=True)
    sent_to_pdhs = db.Column(db.Boolean, nullable=False, default=False, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    district_area = relationship("Area", foreign_keys=[district_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "district_id": self.district_id,
            "district": self.district_area.to_dict() if self.district_area else None,
            "created_by_user_id": self.created_by_user_id,
            "total_children": self.total_children,
            "normal_count": self.normal_count,
            "mam_count": self.mam_count,
            "sam_count": self.sam_count,
            "total_escalations": self.total_escalations,
            "total_returns": self.total_returns,
            "month": self.month,
            "report_year": self.report_year,
            "sent_to_pdhs": self.sent_to_pdhs,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# RDHS PERIOD REPORT (Daily/Weekly/Monthly – full details, can be sent to PDHS)
# ============================================================================

class RdhsPeriodReport(db.Model):
    """
    RDHS report for a period (daily, weekly, monthly). Full snapshot stored as JSON.
    Can be sent to PDHS so they can view the same report.
    """
    __tablename__ = "rdhs_period_reports"

    id = db.Column(db.Integer, primary_key=True)
    district_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)

    period_type = db.Column(db.String(20), nullable=False, index=True)  # daily, weekly, monthly
    start_date = db.Column(db.Date, nullable=False, index=True)
    end_date = db.Column(db.Date, nullable=False, index=True)
    period_label = db.Column(db.String(80), nullable=True)
    district_name = db.Column(db.String(120), nullable=True)

    payload = db.Column(EncryptedJSON, nullable=True)  # full report: summary, moh_areas, etc.

    sent_to_pdhs = db.Column(db.Boolean, nullable=False, default=False, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    district_area = relationship("Area", foreign_keys=[district_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "district_id": self.district_id,
            "district": self.district_area.to_dict() if self.district_area else None,
            "created_by_user_id": self.created_by_user_id,
            "period_type": self.period_type,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "period_label": self.period_label,
            "district_name": self.district_name,
            "payload": self.payload,
            "sent_to_pdhs": self.sent_to_pdhs,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# PDHS REPORT MODEL (Provincial monthly reports, can be sent to Health Ministry)
# ============================================================================

class PdhsReport(db.Model):
    """
    Province-level monthly reports generated by PDHS. Can be sent to Health Ministry.
    """
    __tablename__ = "pdhs_reports"

    id = db.Column(db.Integer, primary_key=True)
    province_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False, index=True)  # PDHS area ID
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)

    total_children = db.Column(db.Integer, nullable=False, default=0)
    normal_count = db.Column(db.Integer, nullable=False, default=0)
    mam_count = db.Column(db.Integer, nullable=False, default=0)
    sam_count = db.Column(db.Integer, nullable=False, default=0)
    escalations = db.Column(db.Integer, nullable=False, default=0)

    month = db.Column(db.Integer, nullable=False)  # 1-12
    report_year = db.Column(db.Integer, nullable=False, index=True)
    sent_to_ministry = db.Column(db.Boolean, nullable=False, default=False, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    province_area = relationship("Area", foreign_keys=[province_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "province_id": self.province_id,
            "province": self.province_area.to_dict() if self.province_area else None,
            "created_by_user_id": self.created_by_user_id,
            "total_children": self.total_children,
            "normal_count": self.normal_count,
            "mam_count": self.mam_count,
            "sam_count": self.sam_count,
            "escalations": self.escalations,
            "month": self.month,
            "report_year": self.report_year,
            "sent_to_ministry": self.sent_to_ministry,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# SYSTEM MESSAGE MODEL (Admin broadcast / targeted messages)
# ============================================================================

class SystemMessage(db.Model):
    """
    System-wide or targeted messages from Admin (Health Ministry).
    """
    __tablename__ = "system_messages"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    target_role = db.Column(db.String(32), nullable=True, index=True)  # null = all
    province_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)
    district_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)
    created_by_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
    province_area = relationship("Area", foreign_keys=[province_id])
    district_area = relationship("Area", foreign_keys=[district_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "target_role": self.target_role,
            "province_id": self.province_id,
            "district_id": self.district_id,
            "created_by_id": self.created_by_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# SYSTEM SETTINGS MODEL (Key-value config: risk thresholds, notifications, etc.)
# ============================================================================

class SystemSetting(db.Model):
    """
    System configuration (risk thresholds, notification settings, reporting frequency).
    """
    __tablename__ = "system_settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)  # JSON string or plain value
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "key": self.key,
            "value": self.value,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# USER OTP MODEL
# ============================================================================

class UserOTPCode(db.Model):
    """
    Hashed one-time passwords for login 2FA and future account verification flows.
    Plaintext OTP values must never be stored.
    """
    __tablename__ = "user_otp_codes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    otp_hash = db.Column(db.String(255), nullable=False)
    purpose = db.Column(db.String(40), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    used_at = db.Column(db.DateTime, nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)

    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint(
            "purpose IN ('login_2fa', 'password_reset', 'email_verification')",
            name="check_otp_purpose",
        ),
        Index("idx_user_otp_lookup", "user_id", "purpose", "used_at", "expires_at"),
    )

    def set_otp(self, otp_code: str) -> None:
        self.otp_hash = generate_password_hash(otp_code)

    def check_otp(self, otp_code: str) -> bool:
        return check_password_hash(self.otp_hash, otp_code)

    def is_expired(self) -> bool:
        return datetime.utcnow() >= self.expires_at


# ============================================================================
# SIGN PAGE UPLOAD MODEL
# ============================================================================

class SignPageRecord(db.Model):
    """
    Stores uploaded sign page images (front/back) by Health Ministry users.
    """
    __tablename__ = "sign_page_records"

    id = db.Column(db.Integer, primary_key=True)
    front_image_path = db.Column(db.String(500), nullable=False)
    back_image_path = db.Column(db.String(500), nullable=False)
    role = db.Column(db.String(32), nullable=False, index=True)
    uploaded_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "front_image_path": self.front_image_path,
            "back_image_path": self.back_image_path,
            "role": self.role,
            "uploaded_by_user_id": self.uploaded_by_user_id,
            "uploaded_by_name": self.uploaded_by.name if self.uploaded_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# VISIT MODEL (Legacy - for backward compatibility)
# ============================================================================

class Visit(db.Model):
    __tablename__ = "visits"

    id = db.Column(db.Integer, primary_key=True)
    child_id_fk = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    visit_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    age_months = db.Column(db.Integer, nullable=False)
    sex = db.Column(db.String(2), nullable=False)  # 'M' | 'F'
    weight_kg = db.Column(EncryptedFloat, nullable=False)
    height_cm = db.Column(EncryptedFloat, nullable=False)

    # Z-scores
    z_wfa = db.Column(EncryptedFloat, nullable=True)
    z_hfa = db.Column(EncryptedFloat, nullable=True)
    z_wfh = db.Column(EncryptedFloat, nullable=True)

    # Risk assessment
    current_risk = db.Column(db.String(32), nullable=True)  # NORMAL/MODERATE/HIGH/CRITICAL
    predicted_risk_next_2_months = db.Column(db.String(16), nullable=True)  # Low/Moderate/High/Severe
    model_confidence = db.Column(EncryptedFloat, nullable=True)

    # Additional notes
    notes = db.Column(EncryptedText, nullable=True)

    # Audit
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    created_by_user = relationship("User", foreign_keys=[created_by_user_id], back_populates="created_visits")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id_fk,
            "visit_date": self.visit_date.isoformat() if self.visit_date else None,
            "age_months": self.age_months,
            "sex": self.sex,
            "weight_kg": self.weight_kg,
            "height_cm": self.height_cm,
            "z_wfa": self.z_wfa,
            "z_hfa": self.z_hfa,
            "z_wfh": self.z_wfh,
            "current_risk": self.current_risk,
            "predicted_risk_next_2_months": self.predicted_risk_next_2_months,
            "model_confidence": self.model_confidence,
            "notes": self.notes,
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# CHILD REFERRAL MODEL (Hospital → Nutritionist)
# ============================================================================

class ChildReferral(db.Model):
    """
    Tracks referrals from Hospital to Nutritionist for SAM cases
    """
    __tablename__ = "child_referrals"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    referred_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    referred_to_role = db.Column(db.String(32), nullable=False, default="nutritionist")  # Always nutritionist for now
    hospital_id = db.Column(db.Integer, ForeignKey("hospitals.id"), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default=ReferralStatus.PENDING.value, index=True)
    referral_reason = db.Column(EncryptedText, nullable=True)
    reviewed_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    child = relationship("Child", foreign_keys=[child_id], back_populates="referrals")
    referred_by = relationship("User", foreign_keys=[referred_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])
    hospital = relationship("Hospital", foreign_keys=[hospital_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id,
            "child": self.child.to_dict() if self.child else None,
            "referred_by_user_id": self.referred_by_user_id,
            "referred_by": self.referred_by.to_dict() if self.referred_by else None,
            "referred_to_role": self.referred_to_role,
            "hospital_id": self.hospital_id,
            "hospital": self.hospital.to_dict() if self.hospital else None,
            "status": self.status,
            "referral_reason": self.referral_reason,
            "reviewed_by_user_id": self.reviewed_by_user_id,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# CHILD TRANSFER MODEL
# ============================================================================

class ChildTransfer(db.Model):
    """
    Tracks child transfers between roles/areas
    Workflow: Hospital → Midwife → MOH → Nutritionist (and back)
    """
    __tablename__ = "child_transfers"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    
    # Transfer details
    from_role = db.Column(db.String(32), nullable=False)
    to_role = db.Column(db.String(32), nullable=False)
    from_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True)
    to_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False)
    from_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)
    to_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True)
    
    # Status and approval
    status = db.Column(db.String(32), nullable=False, default=ChildTransferStatus.PENDING.value, index=True)
    reason = db.Column(EncryptedText, nullable=True)
    transfer_date = db.Column(db.DateTime, nullable=True)
    
    # Approval workflow
    requested_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    approved_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    approval_date = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(EncryptedText, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    child = relationship("Child", back_populates="transfers")
    from_area = relationship("Area", foreign_keys=[from_area_id])
    to_area = relationship("Area", foreign_keys=[to_area_id])
    requested_by_user = relationship("User", foreign_keys=[requested_by_user_id], back_populates="transfer_requests")
    approved_by_user = relationship("User", foreign_keys=[approved_by_user_id], back_populates="transfer_approvals")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id,
            "from_role": self.from_role,
            "to_role": self.to_role,
            "from_area_id": self.from_area_id,
            "from_area": self.from_area.to_dict() if self.from_area else None,
            "to_area_id": self.to_area_id,
            "to_area": self.to_area.to_dict() if self.to_area else None,
            "from_user_id": self.from_user_id,
            "to_user_id": self.to_user_id,
            "status": self.status,
            "reason": self.reason,
            "transfer_date": self.transfer_date.isoformat() if self.transfer_date else None,
            "requested_by_user_id": self.requested_by_user_id,
            "approved_by_user_id": self.approved_by_user_id,
            "approval_date": self.approval_date.isoformat() if self.approval_date else None,
            "rejection_reason": self.rejection_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# AREA CHANGE REQUEST MODEL
# ============================================================================

class AreaChangeRequest(db.Model):
    """
    MOH can request area reassignment for a child
    Health Ministry must approve/reject
    """
    __tablename__ = "area_change_requests"

    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=False, index=True)
    
    # Request details
    from_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False)
    to_area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=False)
    reason = db.Column(EncryptedText, nullable=True)
    
    # Status
    status = db.Column(db.String(32), nullable=False, default=AreaChangeStatus.PENDING, index=True)
    
    # Request workflow
    requested_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    approved_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    approval_date = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(EncryptedText, nullable=True)
    
    # Audit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    child = relationship("Child")
    from_area = relationship("Area", foreign_keys=[from_area_id])
    to_area = relationship("Area", foreign_keys=[to_area_id])
    requested_by_user = relationship("User", foreign_keys=[requested_by_user_id])
    approved_by_user = relationship("User", foreign_keys=[approved_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "child_id": self.child_id,
            "child": self.child.to_dict() if self.child else None,
            "from_area_id": self.from_area_id,
            "from_area": self.from_area.to_dict() if self.from_area else None,
            "to_area_id": self.to_area_id,
            "to_area": self.to_area.to_dict() if self.to_area else None,
            "reason": self.reason,
            "status": self.status,
            "requested_by_user_id": self.requested_by_user_id,
            "approved_by_user_id": self.approved_by_user_id,
            "approval_date": self.approval_date.isoformat() if self.approval_date else None,
            "rejection_reason": self.rejection_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# NOTIFICATION MODEL
# ============================================================================

class Notification(db.Model):
    """
    Per-user notifications for workflow events.
    Role is stored as a recipient-role snapshot so read/unread stays per user.
    """
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(50), nullable=False, index=True)
    priority = db.Column(db.String(20), nullable=False, default="normal", index=True)

    user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = db.Column(db.String(32), nullable=True, index=True)
    actor_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)

    related_child_id = db.Column(db.Integer, ForeignKey("children.id"), nullable=True, index=True)
    related_referral_id = db.Column(db.Integer, ForeignKey("child_referrals.id"), nullable=True, index=True)
    related_escalation_id = db.Column(db.Integer, ForeignKey("child_escalations.id"), nullable=True, index=True)
    related_transfer_id = db.Column(db.Integer, ForeignKey("child_transfers.id"), nullable=True, index=True)
    related_report_id = db.Column(db.Integer, nullable=True, index=True)

    metadata_json = db.Column("metadata", db.JSON, nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", foreign_keys=[user_id])
    actor = relationship("User", foreign_keys=[actor_user_id])
    related_child = relationship("Child", foreign_keys=[related_child_id])
    related_referral = relationship("ChildReferral", foreign_keys=[related_referral_id])
    related_escalation = relationship("ChildEscalation", foreign_keys=[related_escalation_id])
    related_transfer = relationship("ChildTransfer", foreign_keys=[related_transfer_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "priority": self.priority,
            "user_id": self.user_id,
            "role": self.role,
            "actor_user_id": self.actor_user_id,
            "actor": self.actor.to_dict() if self.actor else None,
            "related_child_id": self.related_child_id,
            "related_referral_id": self.related_referral_id,
            "related_escalation_id": self.related_escalation_id,
            "related_transfer_id": self.related_transfer_id,
            "related_report_id": self.related_report_id,
            "metadata": self.metadata_json,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# AUDIT LOG MODEL
# ============================================================================

class AuditLog(db.Model):
    """
    System-wide audit log for tracking all changes
    """
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=True, index=True)  # Legacy compatibility
    user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=True, index=True)
    username = db.Column(db.String(80), nullable=True)
    role = db.Column(db.String(32), nullable=True, index=True)
    
    action = db.Column(db.String(50), nullable=True, index=True)  # Legacy compatibility
    action_type = db.Column(db.String(50), nullable=False, index=True)
    action_category = db.Column(db.String(50), nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    
    entity_type = db.Column(db.String(50), nullable=True, index=True)
    entity_id = db.Column(db.Integer, nullable=True, index=True)
    
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="SUCCESS")
    old_values = db.Column(db.JSON, nullable=True)  # Legacy compatibility
    new_values = db.Column(db.JSON, nullable=True)  # Legacy compatibility
    metadata_json = db.Column("metadata", db.JSON, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "user_id": self.user_id,
            "username": self.username,
            "role": self.role,
            "action": self.action,
            "action_type": self.action_type,
            "action_category": self.action_category,
            "description": self.description,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "status": self.status,
            "metadata": self.metadata_json,
        }


@event.listens_for(AuditLog, "before_update")
def _prevent_audit_log_update(mapper, connection, target):
    raise ValueError("Audit logs are immutable and cannot be updated")


@event.listens_for(AuditLog, "before_delete")
def _prevent_audit_log_delete(mapper, connection, target):
    raise ValueError("Audit logs are immutable and cannot be deleted")


# ============================================================================
# REPORT MODEL (for generated reports)
# ============================================================================

class Report(db.Model):
    """
    Generated reports for RDHS, PDHS, Ministry
    """
    __tablename__ = "reports"

    id = db.Column(db.Integer, primary_key=True)
    
    # Report details
    report_type = db.Column(db.String(50), nullable=False, index=True)  # district, provincial, national
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    
    # Scope
    area_id = db.Column(db.Integer, ForeignKey("areas.id"), nullable=True, index=True)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    
    # Report data (JSON)
    report_data = db.Column(EncryptedJSON, nullable=True)
    
    # File storage (if exported)
    file_path = db.Column(db.String(500), nullable=True)
    file_format = db.Column(db.String(20), nullable=True)  # PDF, EXCEL, CSV
    
    # Audit
    created_by_user_id = db.Column(db.Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    area = relationship("Area", foreign_keys=[area_id])
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "report_type": self.report_type,
            "title": self.title,
            "description": self.description,
            "area_id": self.area_id,
            "area": self.area.to_dict() if self.area else None,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "report_data": self.report_data,
            "file_path": self.file_path,
            "file_format": self.file_format,
            "created_by_user_id": self.created_by_user_id,
            "created_by_name": self.created_by_user.name if self.created_by_user else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
