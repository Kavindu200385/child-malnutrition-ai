from __future__ import annotations

from threading import Thread
from typing import Any, Iterable

from flask import current_app

from backend.extensions import db
from backend.models_hierarchical import Area, Notification, User, UserRole, WorkerAreaMapping
from backend.services.email_service import send_notification_email
from backend.utils.audit import log_audit


PRIORITY_LOW = "low"
PRIORITY_NORMAL = "normal"
PRIORITY_HIGH = "high"
PRIORITY_CRITICAL = "critical"


def _notification_action_url(notification_id: int | None = None) -> str:
    frontend_url = (current_app.config.get("FRONTEND_URL") or "").rstrip("/")
    if not frontend_url:
        return ""
    if notification_id:
        return f"{frontend_url}/notifications/{notification_id}"
    return frontend_url


def _dedupe_users(users: Iterable[User | None]) -> list[User]:
    seen: set[int] = set()
    out: list[User] = []
    for user in users:
        if not user or not user.id or not user.is_active:
            continue
        if user.id in seen:
            continue
        seen.add(user.id)
        out.append(user)
    return out


def active_users_by_role(role: str) -> list[User]:
    return (
        db.session.query(User)
        .filter(User.role == role, User.is_active == True)
        .all()
    )


def users_for_area(area_id: int | None, roles: Iterable[str]) -> list[User]:
    if area_id is None:
        return []
    return _dedupe_users(
        db.session.query(User)
        .join(WorkerAreaMapping, WorkerAreaMapping.user_id == User.id)
        .filter(
            WorkerAreaMapping.area_id == area_id,
            WorkerAreaMapping.is_active == True,
            User.role.in_(list(roles)),
            User.is_active == True,
        )
        .all()
    )


def users_for_hospital(hospital_id: int | None, roles: Iterable[str]) -> list[User]:
    if hospital_id is None:
        return []
    return _dedupe_users(
        db.session.query(User)
        .filter(
            User.hospital_id == hospital_id,
            User.role.in_(list(roles)),
            User.is_active == True,
        )
        .all()
    )


def users_for_parent_area(area_id: int | None, roles: Iterable[str], *, parent_level: str) -> list[User]:
    if area_id is None:
        return []
    area = db.session.get(Area, area_id)
    current = area.parent if area else None
    while current:
        if current.level == parent_level:
            return users_for_area(current.id, roles)
        current = current.parent
    return []


def _send_notification_email_async(
    app,
    *,
    recipient_user_id: int,
    recipient_username: str,
    recipient_role: str | None,
    recipient_email: str,
    notification_id: int,
    title: str,
    message: str,
    priority: str,
    type: str,
    actor_user_id: int | None,
    action_url: str,
    metadata: dict[str, Any],
) -> None:
    with app.app_context():
        result = send_notification_email(
            recipient_email,
            title=title,
            message=message,
            priority=priority,
            action_url=action_url,
        )
        if not result.ok:
            log_audit(
                action_type="NOTIFICATION_EMAIL_FAILED",
                action_category="NOTIFICATIONS",
                entity_type="notification",
                entity_id=notification_id,
                user_id=actor_user_id,
                status="FAILED",
                description=f"Notification email failed for {recipient_username}: {title}",
                metadata={
                    "recipient_user_id": recipient_user_id,
                    "recipient_role": recipient_role,
                    "recipient_email": recipient_email,
                    "notification_type": type,
                    "priority": priority,
                    "error": result.message,
                    **metadata,
                },
            )


def _queue_notification_email(
    user: User,
    notification: Notification,
    *,
    title: str,
    message: str,
    priority: str,
    type: str,
    actor_user_id: int | None,
    email_metadata: dict[str, Any],
) -> None:
    if not current_app.config.get("EMAIL_NOTIFICATIONS_ENABLED"):
        log_audit(
            action_type="NOTIFICATION_EMAIL_SKIPPED",
            action_category="NOTIFICATIONS",
            entity_type="notification",
            entity_id=notification.id,
            user_id=actor_user_id,
            status="SUCCESS",
            description=f"Notification email skipped because email notifications are disabled: {title}",
            metadata={
                "recipient_user_id": user.id,
                "recipient_role": user.role,
                "notification_type": type,
                "priority": priority,
            },
        )
        return

    if not user.email:
        log_audit(
            action_type="NOTIFICATION_EMAIL_SKIPPED",
            action_category="NOTIFICATIONS",
            entity_type="notification",
            entity_id=notification.id,
            user_id=actor_user_id,
            status="FAILED",
            description=f"Notification email skipped because {user.username} has no email address: {title}",
            metadata={
                "recipient_user_id": user.id,
                "recipient_role": user.role,
                "notification_type": type,
                "priority": priority,
            },
        )
        return

    app = current_app._get_current_object()
    Thread(
        target=_send_notification_email_async,
        kwargs={
            "app": app,
            "recipient_user_id": user.id,
            "recipient_username": user.username,
            "recipient_role": user.role,
            "recipient_email": user.email,
            "notification_id": notification.id,
            "title": title,
            "message": message,
            "priority": priority,
            "type": type,
            "actor_user_id": actor_user_id,
            "action_url": _notification_action_url(notification.id),
            "metadata": email_metadata,
        },
        daemon=True,
    ).start()


def notify_users(
    users: Iterable[User | None],
    *,
    title: str,
    message: str,
    type: str,
    priority: str = PRIORITY_NORMAL,
    actor_user_id: int | None = None,
    related_child_id: int | None = None,
    related_referral_id: int | None = None,
    related_escalation_id: int | None = None,
    related_transfer_id: int | None = None,
    related_report_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[Notification]:
    notifications: list[Notification] = []
    for user in _dedupe_users(users):
        email_metadata = {
            "related_child_id": related_child_id,
            "related_referral_id": related_referral_id,
            "related_escalation_id": related_escalation_id,
            "related_transfer_id": related_transfer_id,
            "related_report_id": related_report_id,
            **(metadata or {}),
        }
        notification = Notification(
            title=title,
            message=message,
            type=type,
            priority=priority,
            user_id=user.id,
            role=user.role,
            actor_user_id=actor_user_id,
            related_child_id=related_child_id,
            related_referral_id=related_referral_id,
            related_escalation_id=related_escalation_id,
            related_transfer_id=related_transfer_id,
            related_report_id=related_report_id,
            metadata_json=metadata,
        )
        db.session.add(notification)
        db.session.flush()
        log_audit(
            action="CREATE",
            entity_type="notification",
            entity_id=notification.id,
            user_id=actor_user_id,
            description=f"Notification created for {user.username}: {title}",
            metadata={
                "recipient_user_id": user.id,
                "recipient_role": user.role,
                "type": type,
                "priority": priority,
                "related_child_id": related_child_id,
                "related_referral_id": related_referral_id,
                "related_escalation_id": related_escalation_id,
                "related_transfer_id": related_transfer_id,
                "related_report_id": related_report_id,
            },
        )
        notifications.append(notification)
        _queue_notification_email(
            user,
            notification,
            title=title,
            message=message,
            priority=priority,
            type=type,
            actor_user_id=actor_user_id,
            email_metadata=email_metadata,
        )
    return notifications


def notify_user(user_id: int | None, **kwargs: Any) -> list[Notification]:
    if user_id is None:
        return []
    return notify_users([db.session.get(User, user_id)], **kwargs)


def notify_role(role: str, **kwargs: Any) -> list[Notification]:
    return notify_users(active_users_by_role(role), **kwargs)


def notify_moh_area(moh_area_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(users_for_area(moh_area_id, [UserRole.MOH.value, UserRole.AMOH.value]), **kwargs)


def notify_phm_area(phm_area_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(users_for_area(phm_area_id, [UserRole.MIDWIFE.value]), **kwargs)


def notify_hospital_nutritionists(hospital_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(users_for_hospital(hospital_id, [UserRole.NUTRITIONIST.value]), **kwargs)


def notify_hospital_users(hospital_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(users_for_hospital(hospital_id, [UserRole.HOSPITAL.value]), **kwargs)


def notify_rdhs_for_area(area_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(
        users_for_parent_area(area_id, [UserRole.RDHS.value], parent_level="rdhs"),
        **kwargs,
    )


def notify_pdhs_for_area(area_id: int | None, **kwargs: Any) -> list[Notification]:
    return notify_users(
        users_for_parent_area(area_id, [UserRole.PDHS.value], parent_level="pdhs"),
        **kwargs,
    )


def notify_ministry(**kwargs: Any) -> list[Notification]:
    return notify_role(UserRole.HEALTH_MINISTRY.value, **kwargs)
