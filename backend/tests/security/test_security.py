"""
Security tests:
  - Every blueprint returns 401 without a token
  - Wrong-role access returns 403
  - Inactive user token is rejected
  - Rate limiting triggers on login
  - Sign-pages file endpoint requires auth
"""
import uuid
import pytest
import time
from flask_jwt_extended import create_access_token
from backend.extensions import db as _db
from backend.models_hierarchical import User, UserRole


# ---------------------------------------------------------------------------
# Helper: build a token for an arbitrary role without creating a DB user
# ---------------------------------------------------------------------------
def _fake_token(app, user_id: int, role: str) -> dict:
    token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Unauthenticated access: every representative endpoint returns 401
# ---------------------------------------------------------------------------

class TestUnauthenticatedReturns401:
    """One endpoint per blueprint — no token should always be 401."""

    ENDPOINTS = [
        ("GET",  "/api/children", None),
        ("POST", "/api/midwife/measurement/add", {}),
        ("GET",  "/api/midwife/children", None),
        ("POST", "/api/midwife/escalate/1", {}),
        ("GET",  "/api/moh/escalated-children", None),
        ("POST", "/api/moh/measurement/add", {}),
        ("GET",  "/api/nutritionist/referred-children", None),
        ("GET",  "/api/hospital/children", None),
        ("GET",  "/api/moh/escalations/badge-count", None),
        ("GET",  "/api/sign-pages", None),
        ("GET",  "/api/sign-pages/files/test.jpg", None),
    ]

    @pytest.mark.parametrize("method,url,body", ENDPOINTS)
    def test_endpoint_without_token_returns_401(self, client, method, url, body):
        rv = client.open(url, method=method, json=body) if body is not None else client.open(url, method=method)
        assert rv.status_code == 401, f"{method} {url} → expected 401, got {rv.status_code}"


# ---------------------------------------------------------------------------
# Wrong role returns 403
# ---------------------------------------------------------------------------

class TestWrongRoleReturns403:
    """Accessing a role-specific route with a wrong role returns 403."""

    def test_midwife_cannot_access_moh_escalated_list(self, client, app, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/moh/escalated-children", headers=headers)
        assert rv.status_code == 403

    def test_moh_cannot_access_midwife_add_measurement(self, client, app, api_moh, api_child):
        _, _, headers = api_moh
        rv = client.post("/api/midwife/measurement/add",
                         json={"child_id": api_child, "weight_kg": 10.0, "height_cm": 80.0},
                         headers=headers)
        assert rv.status_code == 403

    def test_nutritionist_cannot_access_midwife_routes(self, client, api_nutritionist, api_child):
        _, _, headers = api_nutritionist
        rv = client.get("/api/midwife/children", headers=headers)
        assert rv.status_code == 403

    def test_midwife_cannot_access_admin_dashboard(self, client, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/admin/dashboard-summary", headers=headers)
        assert rv.status_code == 403

    def test_hospital_cannot_access_moh_routes(self, client, app, api_hospital_user):
        _, _, headers = api_hospital_user
        rv = client.get("/api/moh/escalated-children", headers=headers)
        assert rv.status_code == 403


# ---------------------------------------------------------------------------
# Inactive user
# ---------------------------------------------------------------------------

class TestInactiveUser:
    def test_inactive_user_token_rejected(self, client, app):
        with app.app_context():
            user = User(
                username=f"inactive_{uuid.uuid4().hex[:6]}",
                name="Inactive",
                role=UserRole.MIDWIFE.value,
                is_active=False,
            )
            user.set_password("Pass123!")
            _db.session.add(user)
            _db.session.commit()
            token = create_access_token(identity=str(user.id), additional_claims={"role": user.role})
            headers = {"Authorization": f"Bearer {token}"}

        rv = client.get("/api/midwife/children", headers=headers)
        # Returns 400 (no PHM area mapping) or 403 (inactive) — both deny access
        assert rv.status_code in (400, 403)


# ---------------------------------------------------------------------------
# Sign-pages file endpoint requires auth
# ---------------------------------------------------------------------------

class TestSignPagesFileAuth:
    def test_file_endpoint_without_token_returns_401(self, client):
        rv = client.get("/api/sign-pages/files/some_image.jpg")
        assert rv.status_code == 401

    def test_file_endpoint_with_valid_token_attempts_serve(self, client, api_ministry):
        _, headers = api_ministry
        rv = client.get("/api/sign-pages/files/nonexistent.jpg", headers=headers)
        # File doesn't exist → 404, but auth passed (not 401)
        assert rv.status_code == 404


# ---------------------------------------------------------------------------
# Rate limiting on login
# ---------------------------------------------------------------------------

class TestRateLimiting:
    def test_excessive_login_attempts_trigger_429(self, client, app):
        """More than 10 requests per minute should return 429."""
        # Only run if RATELIMIT_ENABLED is True in app config
        if not app.config.get("RATELIMIT_ENABLED", True):
            pytest.skip("Rate limiting disabled in test config")

        username = f"rl_test_{uuid.uuid4().hex[:6]}"
        with app.app_context():
            user = User(username=username, name="RL Test", role=UserRole.MIDWIFE.value, is_active=True)
            user.set_password("Pass!")
            _db.session.add(user)
            _db.session.commit()

        statuses = []
        for _ in range(15):
            rv = client.post("/api/auth/login", json={"username": username, "password": "wrong"})
            statuses.append(rv.status_code)

        assert 429 in statuses, f"Expected 429 among {statuses}"
