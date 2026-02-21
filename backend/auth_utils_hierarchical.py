"""
Hierarchical RBAC System
Complete role-based access control with area hierarchy checks
"""
from functools import wraps
from typing import Optional, List

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from backend.extensions import db
from backend.models_hierarchical import User, Area, WorkerAreaMapping, Child, UserRole, AreaLevel


# ============================================================================
# ROLE CONSTANTS (7 roles)
# ============================================================================

ROLE_HEALTH_MINISTRY = "health_ministry"  # Super Admin
ROLE_PDHS = "pdhs"  # Provincial Admin
ROLE_RDHS = "rdhs"  # District Admin
ROLE_MOH = "moh"  # Medical Officer of Health
ROLE_AMOH = "amoh"  # Assistant MOH (same as MOH)
ROLE_MIDWIFE = "midwife"  # PHM
ROLE_NUTRITIONIST = "nutritionist"  # Hospital role
ROLE_HOSPITAL = "hospital"  # Hospital registration

# All valid roles
ALL_ROLES = {
    ROLE_HEALTH_MINISTRY,
    ROLE_PDHS,
    ROLE_RDHS,
    ROLE_MOH,
    ROLE_AMOH,
    ROLE_MIDWIFE,
    ROLE_NUTRITIONIST,
    ROLE_HOSPITAL,
}

# Role groups for permissions
ADMIN_ROLES = {ROLE_HEALTH_MINISTRY, ROLE_PDHS, ROLE_RDHS}
FIELD_ROLES = {ROLE_MOH, ROLE_AMOH, ROLE_MIDWIFE, ROLE_NUTRITIONIST}
REGISTRATION_ROLES = {ROLE_HOSPITAL, ROLE_HEALTH_MINISTRY}  # Only Hospital can register (Ministry for admin override)
MEASUREMENT_ROLES = {ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY}  # Hospital NOT included
TRANSFER_ROLES = {ROLE_MIDWIFE, ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST, ROLE_HEALTH_MINISTRY}  # Hospital NOT included
AREA_MANAGEMENT_ROLES = {ROLE_HEALTH_MINISTRY}  # Only Ministry can manage areas
HOSPITAL_ONLY_ROLES = {ROLE_HOSPITAL}  # Hospital-specific operations


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_current_user() -> Optional[User]:
    """Get current authenticated user from JWT"""
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        if not user_id:
            return None
        user_id_int = int(user_id) if user_id else None
        return db.session.get(User, user_id_int) if user_id_int else None
    except Exception:
        return None


def user_can_access_area(user: User, area_id: int) -> bool:
    """Check if user can access a specific area"""
    if user.role == ROLE_HEALTH_MINISTRY:
        return True  # Super admin can access all
    
    # Check user's assigned areas
    assigned_areas = db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == user.id,
        WorkerAreaMapping.is_active == True
    ).all()
    
    if not assigned_areas:
        return False
    
    assigned_area_ids = {wa.area_id for wa in assigned_areas}
    
    # Get target area and check hierarchy
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


def user_can_access_child(user: User, child: Child) -> bool:
    """Check if user can access a specific child based on area hierarchy"""
    if user.role == ROLE_HEALTH_MINISTRY:
        return True  # Super admin can access all
    
    if not child.current_assigned_area_id:
        # Unassigned children: only Hospital (who registered) and Midwife (who can assign) can see
        if user.role == ROLE_HOSPITAL:
            return child.registered_by_user_id == user.id
        if user.role == ROLE_MIDWIFE:
            return True  # Midwife can see unassigned to assign them
        return False
    
    return user_can_access_area(user, child.current_assigned_area_id)


def get_user_accessible_areas(user: User) -> List[Area]:
    """Get all areas user can access (including children)"""
    if user.role == ROLE_HEALTH_MINISTRY:
        return db.session.query(Area).filter(Area.is_active == True).all()
    
    assigned_areas = db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == user.id,
        WorkerAreaMapping.is_active == True
    ).all()
    
    if not assigned_areas:
        return []
    
    accessible_area_ids = set()
    for wa in assigned_areas:
        accessible_area_ids.add(wa.area_id)
        # Get all child areas recursively
        _get_child_area_ids(wa.area_id, accessible_area_ids)
    
    return db.session.query(Area).filter(
        Area.id.in_(accessible_area_ids),
        Area.is_active == True
    ).all()


def _get_child_area_ids(area_id: int, area_ids: set) -> None:
    """Recursively get all child area IDs"""
    children = db.session.query(Area).filter(
        Area.parent_id == area_id,
        Area.is_active == True
    ).all()
    for child in children:
        area_ids.add(child.id)
        _get_child_area_ids(child.id, area_ids)


# ============================================================================
# DECORATORS
# ============================================================================

def role_required(*allowed_roles: str):
    """Require a valid JWT and one of the allowed roles"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = get_current_user()
            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 401
            if not user.is_active:
                return jsonify({"status": "error", "message": "User account is inactive"}), 403
            if allowed_roles and user.role not in allowed_roles:
                return jsonify({"status": "error", "message": "Forbidden: Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def health_ministry_required(fn):
    """Require Health Ministry (Super Admin) role"""
    return role_required(ROLE_HEALTH_MINISTRY)(fn)


def admin_required(fn):
    """Require any admin role (Ministry, PDHS, RDHS)"""
    return role_required(*ADMIN_ROLES)(fn)


def hospital_required(fn):
    """Require Hospital role (for child registration)"""
    return role_required(ROLE_HOSPITAL, ROLE_HEALTH_MINISTRY)(fn)


def measurement_required(fn):
    """Require role that can enter measurements"""
    return role_required(*MEASUREMENT_ROLES)(fn)


def transfer_required(fn):
    """Require role that can transfer children"""
    return role_required(*TRANSFER_ROLES)(fn)


def area_management_required(fn):
    """Require Health Ministry role (for area management)"""
    return role_required(ROLE_HEALTH_MINISTRY)(fn)


# ============================================================================
# AREA-BASED ACCESS DECORATORS
# ============================================================================

def area_access_required(fn):
    """Require user to have access to the area specified in request"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"status": "error", "message": "User not found"}), 401
        
        # Get area_id from request (could be in URL params, body, or query)
        area_id = None
        if 'area_id' in kwargs:
            area_id = kwargs['area_id']
        elif request.is_json and request.json:
            area_id = request.json.get('area_id')
        else:
            area_id = request.args.get('area_id', type=int)
        
        if area_id and not user_can_access_area(user, area_id):
            return jsonify({"status": "error", "message": "Forbidden: No access to this area"}), 403
        
        return fn(*args, **kwargs)
    return wrapper


def child_access_required(fn):
    """Require user to have access to the child specified in request"""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"status": "error", "message": "User not found"}), 401
        
        # Get child_id from URL or request
        child_id = kwargs.get('child_id') or request.json.get('child_id') if request.is_json else None
        
        if child_id:
            # Try to get child by child_id (string) or id (int)
            if isinstance(child_id, str):
                child = db.session.query(Child).filter(Child.child_id == child_id).first()
            else:
                child = db.session.get(Child, child_id)
            
            if not child:
                return jsonify({"status": "error", "message": "Child not found"}), 404
            
            if not user_can_access_child(user, child):
                return jsonify({"status": "error", "message": "Forbidden: No access to this child"}), 403
        
        return fn(*args, **kwargs)
    return wrapper
