from backend.extensions import db as _db
from backend.models_hierarchical import Notification, User, UserRole
from backend.services.notification_service import notify_users


def _user(username: str, role: str) -> User:
    user = User(
        username=username,
        name=username.replace("_", " ").title(),
        role=role,
        is_active=True,
        password_hash="x",
    )
    _db.session.add(user)
    _db.session.flush()
    return user


def test_notification_api_user_scope_and_read_flow(client, auth_headers):
    midwife = _user("notify_midwife", UserRole.MIDWIFE.value)
    moh = _user("notify_moh", UserRole.MOH.value)

    notify_users(
        [midwife],
        title="Child assigned",
        message="A child was assigned to your PHM area.",
        type="child_assigned",
        priority="normal",
    )
    notify_users(
        [midwife],
        title="High-risk follow-up",
        message="A child requires follow-up.",
        type="ai_high_risk",
        priority="high",
    )
    notify_users(
        [moh],
        title="New escalation",
        message="A child was escalated.",
        type="escalation_created",
        priority="high",
    )
    _db.session.commit()

    headers = auth_headers(midwife)
    rv = client.get("/api/notifications", headers=headers)
    assert rv.status_code == 200
    payload = rv.get_json()
    assert payload["count"] == 2
    assert {item["type"] for item in payload["notifications"]} == {"child_assigned", "ai_high_risk"}

    count_rv = client.get("/api/notifications/unread-count", headers=headers)
    assert count_rv.status_code == 200
    assert count_rv.get_json()["unread_count"] == 2

    first_id = payload["notifications"][0]["id"]
    read_rv = client.post(f"/api/notifications/{first_id}/read", headers=headers)
    assert read_rv.status_code == 200
    assert read_rv.get_json()["notification"]["is_read"] is True

    count_rv = client.get("/api/notifications/unread-count", headers=headers)
    assert count_rv.get_json()["unread_count"] == 1

    mark_all_rv = client.post("/api/notifications/mark-all-read", headers=headers)
    assert mark_all_rv.status_code == 200
    assert mark_all_rv.get_json()["updated"] == 1

    delete_rv = client.delete(f"/api/notifications/{first_id}", headers=headers)
    assert delete_rv.status_code == 200
    assert _db.session.get(Notification, first_id) is None


def test_notification_api_blocks_other_user_records(client, auth_headers):
    midwife = _user("notify_midwife_block", UserRole.MIDWIFE.value)
    moh = _user("notify_moh_block", UserRole.MOH.value)

    notify_users(
        [moh],
        title="MOH only",
        message="This should not be visible to the midwife.",
        type="escalation_created",
        priority="normal",
    )
    _db.session.commit()

    notification = Notification.query.filter_by(user_id=moh.id).first()
    rv = client.post(f"/api/notifications/{notification.id}/read", headers=auth_headers(midwife))
    assert rv.status_code == 404
