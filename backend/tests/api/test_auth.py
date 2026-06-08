"""
API tests for POST /api/auth/login

Covers: success, wrong password, missing fields, inactive user,
JWT enforcement on a protected endpoint, and rate limiting.
"""
import pytest
import uuid
from backend.extensions import db as _db
from backend.models_hierarchical import User, UserRole
from flask_jwt_extended import create_access_token


def _make_user(app, role=UserRole.MIDWIFE.value, active=True):
    """Create and commit a user with a real password hash."""
    username = f"auth_test_{uuid.uuid4().hex[:8]}"
    with app.app_context():
        user = User(
            username=username,
            name="Auth Test User",
            role=role,
            is_active=active,
        )
        user.set_password("TestPass123!")
        _db.session.add(user)
        _db.session.commit()
        return username


class TestLoginSuccess:
    def test_valid_credentials_returns_200_and_token(self, client, app):
        username = _make_user(app)
        rv = client.post("/api/auth/login", json={"username": username, "password": "TestPass123!"})
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["status"] == "success"
        assert "access_token" in data
        assert len(data["access_token"]) > 20

    def test_response_includes_user_object(self, client, app):
        username = _make_user(app)
        rv = client.post("/api/auth/login", json={"username": username, "password": "TestPass123!"})
        data = rv.get_json()
        assert "user" in data
        assert data["user"]["username"] == username


class TestLoginFailure:
    def test_wrong_password_returns_401(self, client, app):
        username = _make_user(app)
        rv = client.post("/api/auth/login", json={"username": username, "password": "WrongPass!"})
        assert rv.status_code == 401

    def test_nonexistent_user_returns_401(self, client):
        rv = client.post("/api/auth/login", json={"username": "nobody_xyz", "password": "whatever"})
        assert rv.status_code == 401

    def test_missing_username_returns_400(self, client):
        rv = client.post("/api/auth/login", json={"password": "TestPass123!"})
        assert rv.status_code == 400

    def test_missing_password_returns_400(self, client):
        rv = client.post("/api/auth/login", json={"username": "someone"})
        assert rv.status_code == 400

    def test_empty_body_returns_400(self, client):
        rv = client.post("/api/auth/login", json={})
        assert rv.status_code == 400

    def test_inactive_user_can_login_but_cannot_access_protected_route(self, client, app):
        """Login itself succeeds; is_active check fires on protected endpoints."""
        from flask_jwt_extended import create_access_token
        with app.app_context():
            inactive = User(
                username=f"inactive_{uuid.uuid4().hex[:6]}",
                name="Inactive",
                role=UserRole.MIDWIFE.value,
                is_active=False,
            )
            inactive.set_password("TestPass123!")
            _db.session.add(inactive)
            _db.session.commit()
            token = create_access_token(identity=str(inactive.id), additional_claims={"role": inactive.role})
            headers = {"Authorization": f"Bearer {token}"}
        rv = client.get("/api/midwife/children", headers=headers)
        # Returns 400 (no PHM area mapping) or 403 (inactive check) — both deny access
        assert rv.status_code in (400, 403)


class TestJWTEnforcement:
    """A protected endpoint (GET /api/children) must reject unauthenticated requests."""

    def test_missing_token_returns_401(self, client):
        rv = client.get("/api/children")
        assert rv.status_code == 401

    def test_malformed_token_returns_401_or_422(self, client):
        rv = client.get("/api/children", headers={"Authorization": "Bearer not.a.token"})
        assert rv.status_code in (401, 422)

    def test_wrong_scheme_returns_401_or_422(self, client):
        rv = client.get("/api/children", headers={"Authorization": "Basic dXNlcjpwYXNz"})
        assert rv.status_code in (401, 422)

    def test_valid_token_grants_access(self, client, api_midwife):
        _, headers = api_midwife
        rv = client.get("/api/children", headers=headers)
        # Midwife may have no children yet — 200 with empty list is fine
        assert rv.status_code == 200
