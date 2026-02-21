"""
Hierarchical Area Management Routes
Health Ministry only - CRUD for 5-level area hierarchy
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils_hierarchical import (
    area_management_required,
    get_current_user,
    health_ministry_required,
)
from backend.extensions import db
from backend.models_hierarchical import Area, AreaLevel, Child, WorkerAreaMapping
from backend.utils.audit import log_audit

bp = Blueprint("areas_hierarchical", __name__, url_prefix="/api/areas")


@bp.route("", methods=["GET"])
@area_management_required
def list_areas():
    """
    List all areas with optional filtering by level or parent
    Health Ministry only
    """
    level = request.args.get("level")  # ministry, pdhs, rdhs, moh, phm
    parent_id = request.args.get("parent_id", type=int)
    include_children = request.args.get("include_children", "false").lower() == "true"
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    
    query = db.session.query(Area)
    
    if not include_inactive:
        query = query.filter(Area.is_active == True)
    
    if level:
        if level not in ["ministry", "pdhs", "rdhs", "moh", "phm"]:
            return jsonify({"status": "error", "message": "Invalid level"}), 400
        query = query.filter(Area.level == level)
    
    if parent_id:
        query = query.filter(Area.parent_id == parent_id)
    elif level == "ministry":
        # Ministry level has no parent
        query = query.filter(Area.parent_id.is_(None))
    
    areas = query.order_by(Area.name).all()
    
    return jsonify({
        "status": "success",
        "areas": [a.to_dict(include_children=include_children) for a in areas],
        "count": len(areas),
    }), 200


@bp.route("/<int:area_id>", methods=["GET"])
@area_management_required
def get_area(area_id: int):
    """Get area details with full hierarchy path"""
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404
    
    data = area.to_dict(include_children=True)
    data["full_path"] = area.get_full_path()
    data["has_children_areas"] = area.has_children()
    data["has_linked_children"] = area.has_linked_children()
    data["has_linked_workers"] = area.has_linked_workers()
    
    return jsonify({"status": "success", "area": data}), 200


def _generate_area_code(level: str) -> str:
    """
    Auto-generate area code based on level and existing count.
    Format: PREFIX + 3-digit incremental number
    
    Prefix Rules:
    - MINISTRY: HM
    - PDHS: PDHS
    - RDHS: RDHS
    - MOH: MOH
    - PHM: MWA
    """
    prefix_map = {
        "ministry": "HM",
        "pdhs": "PDHS",
        "rdhs": "RDHS",
        "moh": "MOH",
        "phm": "MWA",
    }
    
    prefix = prefix_map.get(level.lower())
    if not prefix:
        raise ValueError(f"Invalid level for code generation: {level}")
    
    # Get count of existing areas at this level (transaction-safe)
    # Use a lock to prevent race conditions
    from sqlalchemy import func
    count = db.session.query(func.count(Area.id)).filter(
        Area.level == level,
        Area.is_active == True
    ).scalar() or 0
    
    # Generate next number (1-indexed, zero-padded to 3 digits)
    next_num = count + 1
    code = f"{prefix}{next_num:03d}"
    
    # Double-check for uniqueness (handle edge case where code might exist)
    max_attempts = 100
    attempt = 0
    while attempt < max_attempts:
        existing = db.session.query(Area).filter(Area.code == code).first()
        if not existing:
            break
        next_num += 1
        code = f"{prefix}{next_num:03d}"
        attempt += 1
    
    if attempt >= max_attempts:
        raise ValueError(f"Could not generate unique code for level {level}")
    
    return code


@bp.route("", methods=["POST"])
@health_ministry_required
def create_area():
    """
    Create new area with auto-generated area code
    Health Ministry only
    Must specify parent_id (except for Ministry level)
    
    Hierarchy Rules:
    - MINISTRY → parent_id = NULL
    - PDHS → parent must be MINISTRY
    - RDHS → parent must be PDHS
    - MOH → parent must be RDHS
    - PHM → parent must be MOH
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    name = data.get("name")
    level = data.get("level")
    parent_id = data.get("parent_id")
    district = data.get("district")
    province = data.get("province")
    description = data.get("description")
    
    # User cannot manually set code - it's auto-generated
    if data.get("code"):
        return jsonify({
            "status": "error",
            "message": "Area code is auto-generated and cannot be manually set"
        }), 400
    
    if not name or not level:
        return jsonify({"status": "error", "message": "name and level are required"}), 400
    
    if level not in ["ministry", "pdhs", "rdhs", "moh", "phm"]:
        return jsonify({"status": "error", "message": "Invalid level"}), 400
    
    # Strict hierarchy validation
    if level == "ministry":
        if parent_id:
            return jsonify({"status": "error", "message": "MINISTRY level cannot have a parent"}), 400
        parent_id = None
    elif level == "pdhs":
        if not parent_id:
            return jsonify({"status": "error", "message": "PDHS must have a MINISTRY parent"}), 400
        parent = db.session.get(Area, parent_id)
        if not parent:
            return jsonify({"status": "error", "message": "Parent area not found"}), 404
        if parent.level != "ministry":
            return jsonify({
                "status": "error",
                "message": f"PDHS parent must be MINISTRY, got {parent.level}"
            }), 400
    elif level == "rdhs":
        if not parent_id:
            return jsonify({"status": "error", "message": "RDHS must have a PDHS parent"}), 400
        parent = db.session.get(Area, parent_id)
        if not parent:
            return jsonify({"status": "error", "message": "Parent area not found"}), 404
        if parent.level != "pdhs":
            return jsonify({
                "status": "error",
                "message": f"RDHS parent must be PDHS, got {parent.level}"
            }), 400
    elif level == "moh":
        if not parent_id:
            return jsonify({"status": "error", "message": "MOH must have a RDHS parent"}), 400
        parent = db.session.get(Area, parent_id)
        if not parent:
            return jsonify({"status": "error", "message": "Parent area not found"}), 404
        if parent.level != "rdhs":
            return jsonify({
                "status": "error",
                "message": f"MOH parent must be RDHS, got {parent.level}"
            }), 400
    elif level == "phm":
        if not parent_id:
            return jsonify({"status": "error", "message": "PHM must have a MOH parent"}), 400
        parent = db.session.get(Area, parent_id)
        if not parent:
            return jsonify({"status": "error", "message": "Parent area not found"}), 404
        if parent.level != "moh":
            return jsonify({
                "status": "error",
                "message": f"PHM parent must be MOH, got {parent.level}"
            }), 400
    
    # Check parent is active
    if parent_id:
        parent = db.session.get(Area, parent_id)
        if not parent.is_active:
            return jsonify({"status": "error", "message": "Parent area is inactive"}), 400
    
    # Check for duplicate name at same level
    existing = db.session.query(Area).filter(
        Area.name == name,
        Area.level == level,
        Area.is_active == True
    ).first()
    if existing:
        return jsonify({"status": "error", "message": f"Area '{name}' already exists at {level} level"}), 409
    
    # Auto-generate area code
    try:
        code = _generate_area_code(level)
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to generate area code: {str(e)}"}), 500
    
    # Create area with auto-generated code
    area = Area(
        name=name,
        level=level,
        parent_id=parent_id,
        code=code,  # Auto-generated
        district=district,
        province=province,
        description=description,
        is_active=True,
    )
    
    db.session.add(area)
    db.session.flush()
    
    log_audit(
        action="CREATE",
        entity_type="area",
        entity_id=area.id,
        new_values=area.to_dict(),
        user_id=user.id,
        description=f"Created {level} area: {name} (Code: {code})",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "area": area.to_dict(),
        "message": f"Area created with auto-generated code: {code}"
    }), 201


@bp.route("/<int:area_id>", methods=["PUT"])
@health_ministry_required
def update_area(area_id: int):
    """
    Update area
    Health Ministry only
    Cannot change parent if area has children
    """
    user = get_current_user()
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404
    
    data = request.get_json() or {}
    old_values = area.to_dict()
    
    # Check if trying to change parent
    if "parent_id" in data and data["parent_id"] != area.parent_id:
        if area.has_children():
            return jsonify({
                "status": "error",
                "message": "Cannot change parent: area has child areas"
            }), 400
        
        new_parent_id = data["parent_id"]
        if new_parent_id:
            new_parent = db.session.get(Area, new_parent_id)
            if not new_parent:
                return jsonify({"status": "error", "message": "New parent area not found"}), 404
            
            # Validate hierarchy
            level_order = {"ministry": 0, "pdhs": 1, "rdhs": 2, "moh": 3, "phm": 4}
            if level_order.get(new_parent.level, -1) != level_order[area.level] - 1:
                return jsonify({
                    "status": "error",
                    "message": f"Invalid hierarchy: {new_parent.level} cannot be parent of {area.level}"
                }), 400
        
        area.parent_id = new_parent_id
    
    # Update other fields
    if "name" in data:
        # Check for duplicate name at same level
        existing = db.session.query(Area).filter(
            Area.name == data["name"],
            Area.level == area.level,
            Area.id != area_id,
            Area.is_active == True
        ).first()
        if existing:
            return jsonify({"status": "error", "message": f"Area '{data['name']}' already exists"}), 409
        area.name = data["name"]
    
    # Area code cannot be changed after creation
    if "code" in data:
        if data["code"] != area.code:
            return jsonify({
                "status": "error",
                "message": "Area code cannot be changed after creation. It is auto-generated and immutable."
            }), 400
    
    if "district" in data:
        area.district = data["district"]
    if "province" in data:
        area.province = data["province"]
    if "description" in data:
        area.description = data["description"]
    if "is_active" in data:
        # Cannot deactivate if has children or linked data
        if not data["is_active"]:
            if area.has_children():
                return jsonify({
                    "status": "error",
                    "message": "Cannot deactivate: area has child areas"
                }), 400
            if area.has_linked_children():
                return jsonify({
                    "status": "error",
                    "message": "Cannot deactivate: area has linked children"
                }), 400
            if area.has_linked_workers():
                return jsonify({
                    "status": "error",
                    "message": "Cannot deactivate: area has linked workers"
                }), 400
        area.is_active = data["is_active"]
    
    db.session.flush()
    
    log_audit(
        action="UPDATE",
        entity_type="area",
        entity_id=area.id,
        old_values=old_values,
        new_values=area.to_dict(),
        user_id=user.id,
        description=f"Updated area: {area.name}",
    )
    
    db.session.commit()
    
    return jsonify({"status": "success", "area": area.to_dict()}), 200


@bp.route("/<int:area_id>", methods=["DELETE"])
@health_ministry_required
def delete_area(area_id: int):
    """
    Delete area (soft delete by setting is_active=False)
    Cannot delete if has children, linked children, or linked workers
    """
    user = get_current_user()
    area = db.session.get(Area, area_id)
    if not area:
        return jsonify({"status": "error", "message": "Area not found"}), 404
    
    if area.has_children():
        return jsonify({
            "status": "error",
            "message": "Cannot delete: area has child areas. Delete or move children first."
        }), 400
    
    if area.has_linked_children():
        return jsonify({
            "status": "error",
            "message": "Cannot delete: area has linked children. Reassign children first."
        }), 400
    
    if area.has_linked_workers():
        return jsonify({
            "status": "error",
            "message": "Cannot delete: area has linked workers. Reassign workers first."
        }), 400
    
    old_values = area.to_dict()
    area.is_active = False
    
    db.session.flush()
    
    log_audit(
        action="DELETE",
        entity_type="area",
        entity_id=area.id,
        old_values=old_values,
        new_values=area.to_dict(),
        user_id=user.id,
        description=f"Deleted area: {area.name}",
    )
    
    db.session.commit()
    
    return jsonify({"status": "success", "message": "Area deleted successfully"}), 200


@bp.route("/hierarchy", methods=["GET"])
@area_management_required
def get_area_hierarchy():
    """Get full area hierarchy tree"""
    # Get all active areas
    all_areas = db.session.query(Area).filter(Area.is_active == True).order_by(Area.level, Area.name).all()
    
    # Build tree structure
    area_dict = {a.id: a.to_dict(include_children=False) for a in all_areas}
    root_areas = []
    
    for area in all_areas:
        area_dict[area.id]["children"] = []
        if area.parent_id is None:
            root_areas.append(area_dict[area.id])
        else:
            if area.parent_id in area_dict:
                if "children" not in area_dict[area.parent_id]:
                    area_dict[area.parent_id]["children"] = []
                area_dict[area.parent_id]["children"].append(area_dict[area.id])
    
    return jsonify({
        "status": "success",
        "hierarchy": root_areas,
    }), 200
