import pytest

from backend.app import create_app
from backend.app import seed_superadmin
from backend.models_hierarchical import User
from backend.services.encryption_service import EncryptionConfigurationError


def test_production_factory_requires_an_encryption_key(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "production")
    # Keep dotenv from reloading a developer key while representing a missing key.
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", "")

    with pytest.raises(EncryptionConfigurationError, match="DATA_ENCRYPTION_KEY is required"):
        create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})


def test_bootstrap_does_not_create_an_administrator_without_a_password(monkeypatch, db):
    monkeypatch.setenv("SUPERADMIN_USERNAME", "unconfigured-bootstrap")
    monkeypatch.setenv("SUPERADMIN_PASSWORD", "")

    seed_superadmin()

    assert User.query.filter_by(username="unconfigured-bootstrap").first() is None
