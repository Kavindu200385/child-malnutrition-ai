"""
Worker Management Routes
Health Ministry can create/update/delete workers and assign them to areas
"""
from flask import Blueprint, jsonify, request

from backend.auth_utils_hierarchical import (
    health_ministry_required,
    admin_required,
    get_current_user,
    get_user_accessible_areas,
    ROLE_HEALTH_MINISTRY,
    ROLE_PDHS,
    ROLE_RDHS,
)
from backend.extensions import db
from backend.models_hierarchical import User, WorkerAreaMapping, Area, UserRole
from backend.utils.audit import log_audit

bp = Blueprint("worker_management", __name__, url_prefix="/api/workers")


@bp.route("", methods=["GET"])
@admin_required
def list_workers():
    """
    List workers with optional filtering by role or area.
    Health Ministry sees all, PDHS/RDHS see workers in their areas.
    """
    user = get_current_user()
    role = request.args.get("role")
    area_id = request.args.get("area_id", type=int)
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    
    query = db.session.query(User)
    
    if not include_inactive:
        query = query.filter(User.is_active == True)
    
    # Filter by role
    if role:
        if role not in ["health_ministry", "pdhs", "rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital"]:
            return jsonify({"status": "error", "message": "Invalid role"}), 400
        query = query.filter(User.role == role)
    
    # Filter by area access
    if user.role == ROLE_HEALTH_MINISTRY:
        # Super admin sees all
        pass
    elif user.role in [ROLE_PDHS, ROLE_RDHS]:
        # PDHS/RDHS see workers in their accessible areas
        accessible_areas = get_user_accessible_areas(user)
        accessible_area_ids = [a.id for a in accessible_areas]
        if not accessible_area_ids:
            return jsonify({"status": "success", "workers": [], "count": 0}), 200
        
        # Get workers assigned to these areas
        worker_ids = db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id.in_(accessible_area_ids),
            WorkerAreaMapping.is_active == True
        ).distinct().all()
        worker_ids = [w[0] for w in worker_ids]
        if not worker_ids:
            return jsonify({"status": "success", "workers": [], "count": 0}), 200
        query = query.filter(User.id.in_(worker_ids))
    else:
        return jsonify({"status": "error", "message": "Insufficient permissions"}), 403
    
    # Filter by specific area
    if area_id:
        worker_ids = db.session.query(WorkerAreaMapping.user_id).filter(
            WorkerAreaMapping.area_id == area_id,
            WorkerAreaMapping.is_active == True
        ).distinct().all()
        worker_ids = [w[0] for w in worker_ids]
        if not worker_ids:
            return jsonify({"status": "success", "workers": [], "count": 0}), 200
        query = query.filter(User.id.in_(worker_ids))
    
    workers = query.order_by(User.name).all()
    
    return jsonify({
        "status": "success",
        "workers": [w.to_dict(include_areas=True) for w in workers],
        "count": len(workers),
    }), 200


@bp.route("/<int:worker_id>", methods=["GET"])
@admin_required
def get_worker(worker_id: int):
    """Get worker details with assigned areas"""
    user = get_current_user()
    worker = db.session.get(User, worker_id)
    if not worker:
        return jsonify({"status": "error", "message": "Worker not found"}), 404
    
    # Check access
    if user.role != ROLE_HEALTH_MINISTRY:
        accessible_areas = get_user_accessible_areas(user)
        accessible_area_ids = {a.id for a in accessible_areas}
        worker_area_ids = {wa.area_id for wa in worker.worker_areas if wa.is_active}
        if not worker_area_ids or not accessible_area_ids:
            return jsonify({"status": "error", "message": "No access to this worker"}), 403
        if not worker_area_ids.intersection(accessible_area_ids):
            return jsonify({"status": "error", "message": "No access to this worker"}), 403
    
    return jsonify({
        "status": "success",
        "worker": worker.to_dict(include_areas=True),
    }), 200


@bp.route("", methods=["POST"])
@health_ministry_required
def create_worker():
    """
    Create new worker (Health Ministry only).
    Must specify role, and optionally assign to areas.
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    username = data.get("username")
    password = data.get("password")
    name = data.get("name")
    role = data.get("role")
    email = data.get("email")
    phone = data.get("phone")
    area_ids = data.get("area_ids", [])  # List of area IDs to assign worker to
    hospital_id = data.get("hospital_id")  # For nutritionist: assign to hospital
    
    if not username or not password or not name or not role:
        return jsonify({
            "status": "error",
            "message": "username, password, name, and role are required"
        }), 400
    
    if role not in ["health_ministry", "pdhs", "rdhs", "moh", "amoh", "midwife", "nutritionist", "hospital"]:
        return jsonify({"status": "error", "message": "Invalid role"}), 400
    
    # Check if username exists
    existing = db.session.query(User).filter(User.username == username).first()
    if existing:
        return jsonify({"status": "error", "message": "Username already exists"}), 409
    
    # Check if email exists (if provided)
    if email:
        existing_email = db.session.query(User).filter(User.email == email).first()
        if existing_email:
            return jsonify({"status": "error", "message": "Email already exists"}), 409
    
    # Create worker
    worker = User(
        username=username,
        name=name,
        role=role,
        email=email,
        phone=phone,
        is_active=True,
        created_by_id=user.id,
    )
    if role in ("nutritionist", "hospital") and hospital_id:
        worker.hospital_id = int(hospital_id)
    worker.set_password(password)
    
    db.session.add(worker)
    db.session.flush()
    
    # Assign to areas
    if area_ids:
        for area_id in area_ids:
            area = db.session.get(Area, area_id)
            if not area:
                continue
            if not area.is_active:
                continue
            
            # Validate area level matches role
            role_area_levels = {
                "midwife": "phm",
                "moh": "moh",
                "amoh": "moh",
                "nutritionist": "moh",
                "rdhs": "rdhs",
                "pdhs": "pdhs",
            }
            expected_level = role_area_levels.get(role)
            if expected_level and area.level != expected_level:
                continue  # Skip invalid area
            
            mapping = WorkerAreaMapping(
                user_id=worker.id,
                area_id=area_id,
                is_active=True,
                created_by_id=user.id,
            )
            db.session.add(mapping)
    
    db.session.flush()
    
    log_audit(
        action="CREATE",
        entity_type="user",
        entity_id=worker.id,
        new_values=worker.to_dict(include_areas=True),
        user_id=user.id,
        description=f"Created worker: {name} ({role})",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "worker": worker.to_dict(include_areas=True),
    }), 201


@bp.route("/<int:worker_id>", methods=["PUT"])
@health_ministry_required
def update_worker(worker_id: int):
    """
    Update worker (Health Ministry only).
    Can update details and reassign areas.
    """
    user = get_current_user()
    worker = db.session.get(User, worker_id)
    if not worker:
        return jsonify({"status": "error", "message": "Worker not found"}), 404
    
    data = request.get_json() or {}
    old_values = worker.to_dict(include_areas=True)
    
    # Prevent modification of protected users (superadmin)
    if worker.is_protected:
        # Allow password change but prevent role/status changes
        if "password" in data and data["password"]:
            worker.set_password(data["password"])
        if "name" in data:
            worker.name = data["name"]
        if "email" in data:
            if data["email"]:
                existing = db.session.query(User).filter(
                    User.email == data["email"],
                    User.id != worker_id
                ).first()
                if existing:
                    return jsonify({"status": "error", "message": "Email already exists"}), 409
            worker.email = data["email"]
        if "phone" in data:
            worker.phone = data["phone"]
        # Skip role and is_active changes for protected users
        db.session.flush()
        log_audit(
            action="UPDATE",
            entity_type="user",
            entity_id=worker.id,
            old_values=old_values,
            new_values=worker.to_dict(include_areas=True),
            user_id=user.id,
            description=f"Updated protected user: {worker.name}",
        )
        db.session.commit()
        return jsonify({
            "status": "success",
            "worker": worker.to_dict(include_areas=True),
            "message": "Protected user updated (role and status cannot be changed)"
        }), 200
    
    # Update fields for non-protected users
    if "name" in data:
        worker.name = data["name"]
    if "email" in data:
        if data["email"]:
            existing = db.session.query(User).filter(
                User.email == data["email"],
                User.id != worker_id
            ).first()
            if existing:
                return jsonify({"status": "error", "message": "Email already exists"}), 409
        worker.email = data["email"]
    if "phone" in data:
        worker.phone = data["phone"]
    if "is_active" in data:
        worker.is_active = bool(data["is_active"])
    if "password" in data and data["password"]:
        worker.set_password(data["password"])
    
    # Update area assignments
    if "area_ids" in data:
        # Deactivate old mappings
        old_mappings = db.session.query(WorkerAreaMapping).filter(
            WorkerAreaMapping.user_id == worker_id,
            WorkerAreaMapping.is_active == True
        ).all()
        for mapping in old_mappings:
            mapping.is_active = False
        
        # Create new mappings
        area_ids = data["area_ids"]
        for area_id in area_ids:
            area = db.session.get(Area, area_id)
            if not area or not area.is_active:
                continue
            
            # Check if mapping already exists (reactivate it)
            existing_mapping = db.session.query(WorkerAreaMapping).filter(
                WorkerAreaMapping.user_id == worker_id,
                WorkerAreaMapping.area_id == area_id
            ).first()
            
            if existing_mapping:
                existing_mapping.is_active = True
            else:
                mapping = WorkerAreaMapping(
                    user_id=worker_id,
                    area_id=area_id,
                    is_active=True,
                    created_by_id=user.id,
                )
                db.session.add(mapping)
    
    # Nutritionist / Pediatric Unit (hospital role): assign to hospital
    if "hospital_id" in data:
        if worker.role in ("nutritionist", "hospital"):
            worker.hospital_id = int(data["hospital_id"]) if data["hospital_id"] else None
        else:
            worker.hospital_id = None
    
    db.session.flush()
    
    log_audit(
        action="UPDATE",
        entity_type="user",
        entity_id=worker.id,
        old_values=old_values,
        new_values=worker.to_dict(include_areas=True),
        user_id=user.id,
        description=f"Updated worker: {worker.name}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "worker": worker.to_dict(include_areas=True),
    }), 200


@bp.route("/<int:worker_id>", methods=["DELETE"])
@health_ministry_required
def delete_worker(worker_id: int):
    """
    Delete worker (soft delete by setting is_active=False).
    Health Ministry only.
    Protected users (superadmin) cannot be deleted.
    """
    user = get_current_user()
    worker = db.session.get(User, worker_id)
    if not worker:
        return jsonify({"status": "error", "message": "Worker not found"}), 404
    
    # Prevent deletion of protected users (superadmin)
    if worker.is_protected:
        return jsonify({
            "status": "error",
            "message": "Cannot delete protected system user (superadmin). This account is required for system administration."
        }), 403
    
    if worker.id == user.id:
        return jsonify({"status": "error", "message": "Cannot delete yourself"}), 400
    
    old_values = worker.to_dict(include_areas=True)
    worker.is_active = False
    
    # Deactivate all area mappings
    mappings = db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == worker_id,
        WorkerAreaMapping.is_active == True
    ).all()
    for mapping in mappings:
        mapping.is_active = False
    
    db.session.flush()
    
    log_audit(
        action="DELETE",
        entity_type="user",
        entity_id=worker.id,
        old_values=old_values,
        new_values=worker.to_dict(include_areas=True),
        user_id=user.id,
        description=f"Deleted worker: {worker.name}",
    )
    
    db.session.commit()
    
    return jsonify({"status": "success", "message": "Worker deleted successfully"}), 200


@bp.route("/<int:worker_id>/areas", methods=["POST"])
@health_ministry_required
def assign_worker_areas(worker_id: int):
    """
    Assign worker to areas (Health Ministry only).
    Replaces existing assignments.
    """
    user = get_current_user()
    worker = db.session.get(User, worker_id)
    if not worker:
        return jsonify({"status": "error", "message": "Worker not found"}), 404
    
    data = request.get_json() or {}
    area_ids = data.get("area_ids", [])
    
    if not area_ids:
        return jsonify({"status": "error", "message": "area_ids is required"}), 400
    
    # Validate areas
    areas = []
    for area_id in area_ids:
        area = db.session.get(Area, area_id)
        if not area or not area.is_active:
            return jsonify({"status": "error", "message": f"Area {area_id} not found or inactive"}), 404
        
        # Validate area level matches role
        role_area_levels = {
            "midwife": "phm",
            "moh": "moh",
            "amoh": "moh",
            "nutritionist": "moh",
            "rdhs": "rdhs",
            "pdhs": "pdhs",
        }
        expected_level = role_area_levels.get(worker.role)
        if expected_level and area.level != expected_level:
            return jsonify({
                "status": "error",
                "message": f"Area {area.name} is {area.level} level, but worker role {worker.role} requires {expected_level} level"
            }), 400
        
        areas.append(area)
    
    # Deactivate old mappings
    old_mappings = db.session.query(WorkerAreaMapping).filter(
        WorkerAreaMapping.user_id == worker_id,
        WorkerAreaMapping.is_active == True
    ).all()
    for mapping in old_mappings:
        mapping.is_active = False
    
    # Create new mappings
    for area in areas:
        existing = db.session.query(WorkerAreaMapping).filter(
            WorkerAreaMapping.user_id == worker_id,
            WorkerAreaMapping.area_id == area.id
        ).first()
        
        if existing:
            existing.is_active = True
        else:
            mapping = WorkerAreaMapping(
                user_id=worker_id,
                area_id=area.id,
                is_active=True,
                created_by_id=user.id,
            )
            db.session.add(mapping)
    
    db.session.flush()
    
    log_audit(
        action="UPDATE",
        entity_type="user",
        entity_id=worker.id,
        new_values=worker.to_dict(include_areas=True),
        user_id=user.id,
        description=f"Assigned worker {worker.name} to {len(areas)} areas",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": f"Worker assigned to {len(areas)} areas",
        "worker": worker.to_dict(include_areas=True),
    }), 200
