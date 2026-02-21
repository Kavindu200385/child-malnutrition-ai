"""
Audit Logging Utility
Logs all system changes for compliance and tracking
"""
from flask import request
from backend.extensions import db
from backend.models_hierarchical import AuditLog


def log_audit(
    action: str,
    entity_type: str,
    entity_id: int = None,
    old_values: dict = None,
    new_values: dict = None,
    user_id: int = None,
    description: str = None,
):
    """
    Create an audit log entry
    
    Args:
        action: CREATE, UPDATE, DELETE, TRANSFER, APPROVE, REJECT, etc.
        entity_type: child, user, area, transfer, etc.
        entity_id: ID of the entity being changed
        old_values: JSON dict of old values (for UPDATE)
        new_values: JSON dict of new values (for CREATE/UPDATE)
        user_id: ID of user performing the action
        description: Human-readable description
    """
    try:
        # Get IP address and user agent from request if available
        ip_address = None
        user_agent = None
        try:
            if request:
                ip_address = request.remote_addr
                user_agent = request.headers.get("User-Agent")
        except:
            pass
        
        audit_log = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            user_id=user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            description=description,
        )
        
        db.session.add(audit_log)
        db.session.flush()  # Don't commit here, let caller commit
    except Exception as e:
        # Don't fail the main operation if audit logging fails
        print(f"Audit logging failed: {e}")
        pass
