"""
Child Transfer Routes
Handles child transfers between roles/areas with approval workflow
"""
from datetime import datetime
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from backend.auth_utils_hierarchical import (
    transfer_required,
    get_current_user,
    user_can_access_child,
    ROLE_MIDWIFE,
    ROLE_MOH,
    ROLE_AMOH,
    ROLE_NUTRITIONIST,
    ROLE_HEALTH_MINISTRY,
)
from backend.extensions import db
from backend.models_hierarchical import (
    Child,
    ChildTransfer,
    Area,
    User,
    WorkerAreaMapping,
    TransferStatus,
    RiskLevel,
    UserRole,
)
from backend.utils.audit import log_audit

bp = Blueprint("child_transfers", __name__, url_prefix="/api/transfers")


def _midwife_for_phm(phm_area_id: int) -> "User | None":
    """Return the active midwife assigned to a PHM area, or None."""
    mapping = (
        db.session.query(WorkerAreaMapping)
        .join(User, User.id == WorkerAreaMapping.user_id)
        .filter(
            WorkerAreaMapping.area_id == phm_area_id,
            WorkerAreaMapping.is_active == True,
            User.role == UserRole.MIDWIFE.value,
            User.is_active == True,
        )
        .first()
    )
    return db.session.get(User, mapping.user_id) if mapping else None


def _apply_child_assignment(child: Child, transfer: "ChildTransfer", approving_user: User) -> None:
    """Apply transfer assignment fields to child. Called on approve (or immediate MOH→midwife)."""
    child.current_assigned_role = transfer.to_role
    child.current_assigned_area_id = transfer.to_area_id
    child.assigned_date = datetime.utcnow()
    child.status = "ACTIVE"
    child.is_draft = False

    if transfer.to_role == ROLE_MIDWIFE:
        child.phm_area_id = transfer.to_area_id
        # Prefer an explicitly named midwife; otherwise look up the one covering
        # the PHM area; finally fall back to the approving user themselves.
        if transfer.to_user_id:
            child.current_assigned_user_id = transfer.to_user_id
        else:
            mw = _midwife_for_phm(transfer.to_area_id)
            child.current_assigned_user_id = mw.id if mw else approving_user.id
        phm_area = db.session.get(Area, transfer.to_area_id)
        if phm_area:
            parent = phm_area.parent  # MOH area
            if parent:
                child.moh_area_id = parent.id
                rdhs_area = parent.parent  # RDHS
                if rdhs_area:
                    child.district_id = rdhs_area.id
                    pdhs_area = rdhs_area.parent  # PDHS
                    if pdhs_area:
                        child.province_id = pdhs_area.id
    elif transfer.to_role in (ROLE_MOH, ROLE_AMOH, ROLE_NUTRITIONIST):
        child.current_assigned_user_id = transfer.to_user_id if transfer.to_user_id else approving_user.id
        child.moh_area_id = transfer.to_area_id
        moh_area = db.session.get(Area, transfer.to_area_id)
        if moh_area:
            rdhs_area = moh_area.parent
            if rdhs_area:
                child.district_id = rdhs_area.id
                pdhs_area = rdhs_area.parent
                if pdhs_area:
                    child.province_id = pdhs_area.id


def validate_transfer_flow(from_role: str, to_role: str) -> tuple[bool, str]:
    """
    Validate if transfer is allowed based on workflow:
    Hospital → Midwife → MOH → Nutritionist (and back)
    """
    valid_flows = {
        "hospital": ["midwife"],
        "midwife": ["moh", "amoh"],
        "moh": ["nutritionist", "midwife"],  # Can transfer to nutritionist or back to midwife
        "amoh": ["nutritionist", "midwife"],
        "nutritionist": ["moh", "amoh"],  # Can transfer back to MOH when stable
    }
    
    if from_role not in valid_flows:
        return False, f"Invalid from_role: {from_role}"
    
    if to_role not in valid_flows[from_role]:
        return False, f"Cannot transfer from {from_role} to {to_role}. Valid targets: {valid_flows[from_role]}"
    
    return True, ""


@bp.route("/children/<child_id>/request", methods=["POST"])
@transfer_required
def request_transfer(child_id: str):
    """
    Request child transfer
    Midwife, MOH, AMOH, Nutritionist can request transfers
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    # Get child
    child = db.session.query(Child).filter(Child.child_id == child_id).first()
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404
    
    # Check access
    if not user_can_access_child(user, child):
        return jsonify({"status": "error", "message": "No access to this child"}), 403
    
    # Validate child is not already in transfer
    pending_transfer = db.session.query(ChildTransfer).filter(
        ChildTransfer.child_id == child.id,
        ChildTransfer.status == TransferStatus.PENDING
    ).first()
    if pending_transfer:
        return jsonify({
            "status": "error",
            "message": "Child already has a pending transfer request"
        }), 400
    
    # Get transfer details
    to_role = data.get("to_role")
    to_area_id = data.get("to_area_id")
    to_user_id = data.get("to_user_id")  # Optional: specific user to transfer to
    reason = data.get("reason", "")
    
    if not to_role or not to_area_id:
        return jsonify({"status": "error", "message": "to_role and to_area_id are required"}), 400
    
    # Validate transfer flow
    from_role = child.current_assigned_role or user.role
    is_valid, error_msg = validate_transfer_flow(from_role, to_role)
    if not is_valid:
        return jsonify({"status": "error", "message": error_msg}), 400
    
    # Validate target area
    to_area = db.session.get(Area, to_area_id)
    if not to_area:
        return jsonify({"status": "error", "message": "Target area not found"}), 404
    if not to_area.is_active:
        return jsonify({"status": "error", "message": "Target area is inactive"}), 400
    
    # Validate target area level matches role
    role_area_levels = {
        ROLE_MIDWIFE: "phm",
        ROLE_MOH: "moh",
        ROLE_AMOH: "moh",
        ROLE_NUTRITIONIST: "moh",  # Nutritionist works at MOH level
    }
    expected_level = role_area_levels.get(to_role)
    if expected_level and to_area.level != expected_level:
        return jsonify({
            "status": "error",
            "message": f"Target area must be {expected_level} level for {to_role} role"
        }), 400
    
    # Validate target user if provided
    to_user = None
    if to_user_id:
        to_user = db.session.get(User, to_user_id)
        if not to_user:
            return jsonify({"status": "error", "message": "Target user not found"}), 404
        if to_user.role != to_role:
            return jsonify({
                "status": "error",
                "message": f"Target user must have role {to_role}"
            }), 400
    
    # MOH/AMOH → Midwife: auto-complete immediately so the child appears in the
    # midwife's list without requiring a separate approval step.
    moh_direct = from_role in (ROLE_MOH, ROLE_AMOH) and to_role == ROLE_MIDWIFE

    transfer = ChildTransfer(
        child_id=child.id,
        from_role=from_role,
        to_role=to_role,
        from_area_id=child.current_assigned_area_id,
        to_area_id=to_area_id,
        from_user_id=child.current_assigned_user_id,
        to_user_id=to_user_id,
        status=TransferStatus.APPROVED if moh_direct else TransferStatus.PENDING,
        reason=reason,
        requested_by_user_id=user.id,
    )
    if moh_direct:
        transfer.approved_by_user_id = user.id
        transfer.approval_date = datetime.utcnow()
        transfer.transfer_date = datetime.utcnow()

    db.session.add(transfer)
    db.session.flush()

    if moh_direct:
        _apply_child_assignment(child, transfer, approving_user=user)

    log_audit(
        action="TRANSFER_REQUEST",
        entity_type="child_transfer",
        entity_id=transfer.id,
        new_values=transfer.to_dict(),
        user_id=user.id,
        description=f"{'Directly assigned' if moh_direct else 'Requested transfer of'} child {child_id} from {from_role} to {to_role}",
    )

    db.session.commit()

    return jsonify({
        "status": "success",
        "message": "Child assigned to midwife" if moh_direct else "Transfer request created",
        "transfer": transfer.to_dict(),
        "child": child.to_dict() if moh_direct else None,
    }), 201


@bp.route("", methods=["GET"])
@transfer_required
def list_transfers():
    """
    List transfer requests
    Users see transfers for children they can access
    """
    user = get_current_user()
    status = request.args.get("status")  # PENDING, APPROVED, REJECTED, COMPLETED
    role = request.args.get("role")  # Filter by to_role or from_role
    
    query = db.session.query(ChildTransfer)
    
    # Filter by status
    if status:
        if status not in ["PENDING", "APPROVED", "REJECTED", "COMPLETED"]:
            return jsonify({"status": "error", "message": "Invalid status"}), 400
        query = query.filter(ChildTransfer.status == status)
    
    # Filter by role
    if role:
        query = query.filter(
            (ChildTransfer.from_role == role) | (ChildTransfer.to_role == role)
        )
    
    # Health Ministry sees all; others see transfers for children they currently hold
    # OR transfers that are targeted at their areas (so incoming transfers are visible).
    if user.role != ROLE_HEALTH_MINISTRY:
        user_area_ids = [wa.area_id for wa in user.worker_areas if wa.is_active]

        # Children currently in the user's area
        accessible_children = db.session.query(Child.id).filter(
            Child.current_assigned_area_id.in_(user_area_ids)
        ).all()
        accessible_child_ids = [c[0] for c in accessible_children]

        # Include transfers whose target area is one the user covers (incoming)
        query = query.filter(
            (ChildTransfer.child_id.in_(accessible_child_ids)) |
            (ChildTransfer.to_area_id.in_(user_area_ids))
        )
    
    transfers = query.order_by(ChildTransfer.created_at.desc()).limit(100).all()
    
    return jsonify({
        "status": "success",
        "transfers": [t.to_dict() for t in transfers],
        "count": len(transfers),
    }), 200


@bp.route("/<int:transfer_id>/approve", methods=["POST"])
@transfer_required
def approve_transfer(transfer_id: int):
    """
    Approve transfer request
    Receiving role (MOH/Nutritionist) must approve
    Health Ministry can approve any transfer
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    transfer = db.session.get(ChildTransfer, transfer_id)
    if not transfer:
        return jsonify({"status": "error", "message": "Transfer not found"}), 404
    
    if transfer.status != TransferStatus.PENDING:
        return jsonify({
            "status": "error",
            "message": f"Transfer is already {transfer.status}"
        }), 400
    
    # Check if user can approve
    # Health Ministry can approve any
    # Otherwise, user must be the receiving role
    if user.role != ROLE_HEALTH_MINISTRY:
        if user.role != transfer.to_role:
            return jsonify({
                "status": "error",
                "message": "Only the receiving role can approve this transfer"
            }), 403
        
        # Check user has access to target area
        from backend.auth_utils_hierarchical import user_can_access_area
        if not user_can_access_area(user, transfer.to_area_id):
            return jsonify({
                "status": "error",
                "message": "No access to target area"
            }), 403
    
    # Get child
    child = db.session.get(Child, transfer.child_id)
    if not child:
        return jsonify({"status": "error", "message": "Child not found"}), 404

    old_values = child.to_dict()
    _apply_child_assignment(child, transfer, approving_user=user)

    # Update transfer status
    transfer.status = TransferStatus.APPROVED
    transfer.approved_by_user_id = user.id
    transfer.approval_date = datetime.utcnow()
    transfer.transfer_date = datetime.utcnow()
    
    db.session.flush()
    
    log_audit(
        action="TRANSFER_APPROVE",
        entity_type="child_transfer",
        entity_id=transfer.id,
        old_values={"status": "PENDING"},
        new_values=transfer.to_dict(),
        user_id=user.id,
        description=f"Approved transfer of child {child.child_id} to {transfer.to_role}",
    )
    
    log_audit(
        action="UPDATE",
        entity_type="child",
        entity_id=child.id,
        old_values=old_values,
        new_values=child.to_dict(),
        user_id=user.id,
        description=f"Child {child.child_id} transferred to {transfer.to_role}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Transfer approved",
        "transfer": transfer.to_dict(),
        "child": child.to_dict(),
    }), 200


@bp.route("/<int:transfer_id>/reject", methods=["POST"])
@transfer_required
def reject_transfer(transfer_id: int):
    """
    Reject transfer request
    Receiving role or Health Ministry can reject
    """
    user = get_current_user()
    data = request.get_json() or {}
    
    transfer = db.session.get(ChildTransfer, transfer_id)
    if not transfer:
        return jsonify({"status": "error", "message": "Transfer not found"}), 404
    
    if transfer.status != TransferStatus.PENDING:
        return jsonify({
            "status": "error",
            "message": f"Transfer is already {transfer.status}"
        }), 400
    
    # Check if user can reject
    if user.role != ROLE_HEALTH_MINISTRY and user.role != transfer.to_role:
        return jsonify({
            "status": "error",
            "message": "Only the receiving role or Health Ministry can reject"
        }), 403
    
    rejection_reason = data.get("rejection_reason", "No reason provided")
    
    transfer.status = TransferStatus.REJECTED
    transfer.approved_by_user_id = user.id
    transfer.approval_date = datetime.utcnow()
    transfer.rejection_reason = rejection_reason
    
    db.session.flush()
    
    log_audit(
        action="TRANSFER_REJECT",
        entity_type="child_transfer",
        entity_id=transfer.id,
        old_values={"status": "PENDING"},
        new_values=transfer.to_dict(),
        user_id=user.id,
        description=f"Rejected transfer: {rejection_reason}",
    )
    
    db.session.commit()
    
    return jsonify({
        "status": "success",
        "message": "Transfer rejected",
        "transfer": transfer.to_dict(),
    }), 200
