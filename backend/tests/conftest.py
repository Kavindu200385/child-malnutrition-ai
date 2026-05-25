"""
Shared pytest fixtures: in-memory SQLite app, seeded midwife/MOH users, and a sample child.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest
from backend.app import create_app
from backend.extensions import db as _db
from backend.models_hierarchical import (
    User, Child, Area, WorkerAreaMapping,
    UserRole, EscalationStatus, RiskLevel, AreaLevel,
)


@pytest.fixture(scope="session")
def app():
    app = create_app()
    app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-secret",
        "WTF_CSRF_ENABLED": False,
    })
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def db(app):
    """Wrap each test in a savepoint so changes are rolled back automatically."""
    with app.app_context():
        connection = _db.engine.connect()
        transaction = connection.begin()
        _db.session.bind = connection
        yield _db
        _db.session.remove()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def moh_area(db):
    area = Area(name="Test MOH Area", level=AreaLevel.MOH.value, is_active=True)
    db.session.add(area)
    db.session.flush()
    return area


@pytest.fixture()
def phm_area(db, moh_area):
    area = Area(name="Test PHM Area", level=AreaLevel.PHM.value,
                parent_id=moh_area.id, is_active=True)
    db.session.add(area)
    db.session.flush()
    return area


@pytest.fixture()
def midwife_user(db, phm_area):
    user = User(
        username="midwife_test", name="Test Midwife",
        role=UserRole.MIDWIFE.value, is_active=True,
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
        username="moh_test", name="Test MOH",
        role=UserRole.MOH.value, is_active=True,
        password_hash="x", moh_id=moh_area.id,
    )
    db.session.add(user)
    db.session.flush()
    mapping = WorkerAreaMapping(user_id=user.id, area_id=moh_area.id, is_active=True)
    db.session.add(mapping)
    db.session.flush()
    return user


@pytest.fixture()
def assigned_child(db, midwife_user, phm_area, moh_area):
    child = Child(
        child_unique_id="TEST-001",
        name="Test Child",
        gender="male",
        current_risk_level=RiskLevel.MAM.value,
        escalation_status=EscalationStatus.NONE.value,
        current_assigned_role=UserRole.MIDWIFE.value,
        current_assigned_user_id=midwife_user.id,
        phm_area_id=phm_area.id,
        moh_area_id=moh_area.id,
    )
    db.session.add(child)
    db.session.flush()
    return child
