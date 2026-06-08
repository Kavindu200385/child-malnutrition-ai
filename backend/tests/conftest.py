"""
Shared pytest fixtures.

Architecture note:
- `app` is SESSION-scoped → one Flask app and one in-memory SQLite for all tests.
  Its `with app.app_context():` block remains active for the whole session.
- All other fixtures operate within that EXISTING app context — they do NOT push
  new nested contexts, which avoids session-scope conflicts with StaticPool.
- `db` fixture: unit tests only flush (never commit), so rollback+remove after
  each test undoes all pending writes cleanly.
- `api_*` fixtures: commit data, then call _db.session.remove() to release the
  connection cleanly before the test client runs its request.
"""
import sys
import os
import uuid
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy.pool import StaticPool

from backend.app import create_app
from backend.extensions import db as _db
from backend.models_hierarchical import (
    User, Child, Area, WorkerAreaMapping, Hospital,
    UserRole, EscalationStatus, RiskLevel, AreaLevel,
)


# ---------------------------------------------------------------------------
# App (session-scoped) — ONE app context active for the entire test run.
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def app():
    application = create_app()
    application.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_ENGINE_OPTIONS": {
            "connect_args": {"check_same_thread": False},
            "poolclass": StaticPool,
        },
        "JWT_SECRET_KEY": "test-secret-key-long-enough-32chars!!",
        "WTF_CSRF_ENABLED": False,
        "RATELIMIT_ENABLED": False,
    })
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


# ---------------------------------------------------------------------------
# DB fixture — unit-test isolation via rollback (no nested context needed).
# ---------------------------------------------------------------------------

@pytest.fixture()
def db(app):
    """
    SQLAlchemy 2.x compatible test isolation.
    Unit tests only flush (never commit) so rollback discards all pending
    writes. Uses the existing app context — no nested context push.
    """
    _db.session.remove()      # start from a clean session
    yield _db
    _db.session.rollback()
    _db.session.remove()


# ---------------------------------------------------------------------------
# Flask test client
# ---------------------------------------------------------------------------

@pytest.fixture()
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

@pytest.fixture()
def make_token(app):
    def _make(user_id: int, role: str) -> str:
        return create_access_token(
            identity=str(user_id),
            additional_claims={"role": role},
        )
    return _make


@pytest.fixture()
def auth_headers(make_token):
    def _headers(user: User) -> dict:
        token = make_token(user.id, user.role)
        return {"Authorization": f"Bearer {token}"}
    return _headers


# ---------------------------------------------------------------------------
# Unique ID helper
# ---------------------------------------------------------------------------

def _uid(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Helper: commit + release session (used by api_* fixtures)
# ---------------------------------------------------------------------------

def _commit_and_release():
    """Commit then remove the session so the connection is returned cleanly."""
    _db.session.commit()
    _db.session.remove()


# ---------------------------------------------------------------------------
# Area fixtures (function-scoped, use db fixture → rollback isolation)
# ---------------------------------------------------------------------------

@pytest.fixture()
def moh_area(db):
    area = Area(name="Test MOH Area", level=AreaLevel.MOH.value, is_active=True)
    db.session.add(area)
    db.session.flush()
    return area


@pytest.fixture()
def phm_area(db, moh_area):
    area = Area(
        name="Test PHM Area",
        level=AreaLevel.PHM.value,
        parent_id=moh_area.id,
        is_active=True,
    )
    db.session.add(area)
    db.session.flush()
    return area


# ---------------------------------------------------------------------------
# Hospital fixture (uses db fixture)
# ---------------------------------------------------------------------------

@pytest.fixture()
def hospital(db):
    h = Hospital(
        hospital_name="Test General Hospital",
        hospital_code=_uid("HOS"),
        district="Colombo",
        province="Western",
        is_active=True,
    )
    db.session.add(h)
    db.session.flush()
    return h


# ---------------------------------------------------------------------------
# User fixtures (use db fixture)
# ---------------------------------------------------------------------------

@pytest.fixture()
def midwife_user(db, phm_area):
    user = User(
        username=_uid("mw_"),
        name="Test Midwife",
        role=UserRole.MIDWIFE.value,
        is_active=True,
        password_hash="x",
    )
    db.session.add(user)
    db.session.flush()
    mapping = WorkerAreaMapping(user_id=user.id, area_id=phm_area.id, is_active=True)
    db.session.add(mapping)
    db.session.flush()
    return user


@pytest.fixture()
def moh_user(db, moh_area):
    user = User(
        username=_uid("moh_"),
        name="Test MOH",
        role=UserRole.MOH.value,
        is_active=True,
        password_hash="x",
        moh_id=moh_area.id,
    )
    db.session.add(user)
    db.session.flush()
    mapping = WorkerAreaMapping(user_id=user.id, area_id=moh_area.id, is_active=True)
    db.session.add(mapping)
    db.session.flush()
    return user


@pytest.fixture()
def hospital_user(db, hospital):
    user = User(
        username=_uid("hosp_"),
        name="Test Hospital User",
        role=UserRole.HOSPITAL.value,
        is_active=True,
        password_hash="x",
        hospital_id=hospital.id,
    )
    db.session.add(user)
    db.session.flush()
    return user


@pytest.fixture()
def nutritionist_user(db, hospital):
    user = User(
        username=_uid("nut_"),
        name="Test Nutritionist",
        role=UserRole.NUTRITIONIST.value,
        is_active=True,
        password_hash="x",
        hospital_id=hospital.id,
    )
    db.session.add(user)
    db.session.flush()
    return user


@pytest.fixture()
def ministry_user(db):
    user = User(
        username=_uid("admin_"),
        name="Test Ministry Admin",
        role=UserRole.HEALTH_MINISTRY.value,
        is_active=True,
        password_hash="x",
    )
    db.session.add(user)
    db.session.flush()
    return user


# ---------------------------------------------------------------------------
# Child fixture (uses db fixture)
# ---------------------------------------------------------------------------

@pytest.fixture()
def assigned_child(db, midwife_user, phm_area, moh_area):
    child = Child(
        child_unique_id=_uid("CHILD-"),
        name="Test Child",
        gender="male",
        dob=date(2022, 1, 1),
        birth_weight_kg=3.2,
        current_risk_level=RiskLevel.MAM.value,
        escalation_status=EscalationStatus.NONE.value,
        current_assigned_role=UserRole.MIDWIFE.value,
        current_assigned_user_id=midwife_user.id,
        phm_area_id=phm_area.id,
        moh_area_id=moh_area.id,
        status="ACTIVE",
    )
    db.session.add(child)
    db.session.flush()
    return child


# ---------------------------------------------------------------------------
# API-level fixtures — commit data within the EXISTING app context.
# Each fixture calls _commit_and_release() to hand the connection back
# cleanly before the Flask test client opens its own request context.
# ---------------------------------------------------------------------------

@pytest.fixture()
def api_hospital():
    """Committed Hospital record for API tests."""
    h = Hospital(
        hospital_name="API Test Hospital",
        hospital_code=_uid("APIH"),
        district="Colombo",
        province="Western",
        is_active=True,
    )
    _db.session.add(h)
    _commit_and_release()
    # Re-fetch ID after session was removed
    _db.session.add(h)
    _db.session.flush()
    h_id = h.id
    h_code = h.hospital_code
    _db.session.remove()
    return h_id, h_code


@pytest.fixture()
def api_areas():
    """Committed MOH + PHM areas for API tests."""
    moh = Area(name=_uid("MOH-"), level=AreaLevel.MOH.value, is_active=True)
    _db.session.add(moh)
    _db.session.flush()
    phm = Area(name=_uid("PHM-"), level=AreaLevel.PHM.value, parent_id=moh.id, is_active=True)
    _db.session.add(phm)
    _db.session.flush()
    moh_id = moh.id
    phm_id = phm.id
    _commit_and_release()
    return moh_id, phm_id


@pytest.fixture()
def api_midwife(api_areas):
    """Committed midwife user + PHM mapping. Returns (user_id, auth_headers)."""
    _, phm_id = api_areas
    user = User(
        username=_uid("api_mw_"),
        name="API Midwife",
        role=UserRole.MIDWIFE.value,
        is_active=True,
    )
    user.set_password("Test1234!")
    _db.session.add(user)
    _db.session.flush()
    _db.session.add(WorkerAreaMapping(user_id=user.id, area_id=phm_id, is_active=True))
    _db.session.flush()
    user_id = user.id
    user_role = user.role
    _commit_and_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": user_role})
    return user_id, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def api_moh(api_areas):
    """Committed MOH user + area mapping. Returns (user_id, moh_area_id, auth_headers)."""
    moh_id, _ = api_areas
    user = User(
        username=_uid("api_moh_"),
        name="API MOH",
        role=UserRole.MOH.value,
        is_active=True,
    )
    user.set_password("Test1234!")
    _db.session.add(user)
    _db.session.flush()
    _db.session.add(WorkerAreaMapping(user_id=user.id, area_id=moh_id, is_active=True))
    _db.session.flush()
    user_id = user.id
    user_role = user.role
    _commit_and_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": user_role})
    return user_id, moh_id, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def api_hospital_user(api_hospital):
    """Committed hospital user. Returns (user_id, hospital_id, auth_headers)."""
    h_id, _ = api_hospital
    user = User(
        username=_uid("api_hosp_"),
        name="API Hospital",
        role=UserRole.HOSPITAL.value,
        is_active=True,
        hospital_id=h_id,
    )
    user.set_password("Test1234!")
    _db.session.add(user)
    _db.session.flush()
    user_id = user.id
    user_role = user.role
    _commit_and_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": user_role})
    return user_id, h_id, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def api_nutritionist(api_hospital):
    """Committed nutritionist user. Returns (user_id, hospital_id, auth_headers)."""
    h_id, _ = api_hospital
    user = User(
        username=_uid("api_nut_"),
        name="API Nutritionist",
        role=UserRole.NUTRITIONIST.value,
        is_active=True,
        hospital_id=h_id,
    )
    user.set_password("Test1234!")
    _db.session.add(user)
    _db.session.flush()
    user_id = user.id
    user_role = user.role
    _commit_and_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": user_role})
    return user_id, h_id, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def api_ministry():
    """Committed health_ministry user. Returns (user_id, auth_headers)."""
    user = User(
        username=_uid("api_min_"),
        name="API Ministry",
        role=UserRole.HEALTH_MINISTRY.value,
        is_active=True,
    )
    user.set_password("Test1234!")
    _db.session.add(user)
    _db.session.flush()
    user_id = user.id
    user_role = user.role
    _commit_and_release()
    token = create_access_token(identity=str(user_id), additional_claims={"role": user_role})
    return user_id, {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def api_child(api_midwife, api_areas):
    """Committed child assigned to api_midwife. Returns child_id."""
    midwife_id, _ = api_midwife
    _, phm_id = api_areas
    # Resolve moh_area_id from PHM parent
    phm = _db.session.get(Area, phm_id)
    moh_area_id = phm.parent_id if phm else None
    _db.session.expunge(phm)

    child = Child(
        child_unique_id=_uid("APIC-"),
        name="API Test Child",
        gender="male",
        dob=date(2022, 1, 1),
        birth_weight_kg=3.2,
        current_risk_level=RiskLevel.NORMAL.value,
        escalation_status=EscalationStatus.NONE.value,
        current_assigned_role=UserRole.MIDWIFE.value,
        current_assigned_user_id=midwife_id,
        current_assigned_area_id=phm_id,   # list_children filters by this field
        phm_area_id=phm_id,
        moh_area_id=moh_area_id,
        status="ACTIVE",
    )
    _db.session.add(child)
    _db.session.flush()
    child_id = child.id
    _commit_and_release()
    return child_id
