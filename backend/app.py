"""Flask backend for the Child Malnutrition Monitoring System."""

import os
import sys

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import find_dotenv, load_dotenv  # type: ignore
from flask import Flask, current_app
from flask_cors import CORS
from sqlalchemy import inspect, text

from backend.extensions import db, jwt, limiter, migrate
from backend.models import User
from backend.services.encryption_service import validate_encryption_key


def seed_superadmin() -> None:
    """Create or update the protected bootstrap administrator when configured."""
    superadmin_username = os.environ.get("SUPERADMIN_USERNAME", "superadmin")
    superadmin_password = os.environ.get("SUPERADMIN_PASSWORD", "")

    if not superadmin_password:
        if current_app.config.get("SUPERADMIN_PASSWORD_REQUIRED"):
            raise RuntimeError("SUPERADMIN_PASSWORD must be set before production startup.")
        print(
            "[WARNING] SUPERADMIN_PASSWORD env var is not set. "
            "Superadmin account will not be created or updated. "
            "Set SUPERADMIN_PASSWORD in backend/.env to enable."
        )
        return

    existing = User.query.filter_by(username=superadmin_username).first()
    if existing:
        existing.is_protected = True
        if not existing.check_password(superadmin_password):
            existing.set_password(superadmin_password)
        existing.name = "System Developer"
        existing.is_active = True
        existing.role = "health_ministry"
        db.session.commit()
        return

    superadmin = User(
        username=superadmin_username,
        name="System Developer",
        role="health_ministry",
        is_active=True,
        is_protected=True,
    )
    superadmin.set_password(superadmin_password)
    db.session.add(superadmin)
    db.session.commit()


def create_app(config_overrides: dict | None = None) -> Flask:
    load_dotenv(find_dotenv(usecwd=True))
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    node_env = os.environ.get("NODE_ENV", "development").lower()
    flask_env = os.environ.get("FLASK_ENV", "").lower()

    from backend.config import Config

    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    if app.config.get("SUPERADMIN_PASSWORD_REQUIRED") and not os.environ.get("SUPERADMIN_PASSWORD"):
        raise RuntimeError("SUPERADMIN_PASSWORD must be set before production startup.")

    CORS(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}})
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    from backend.routes.admin_routes import bp as admin_routes_bp
    from backend.routes.admin_tools import bp as admin_bp
    from backend.routes.areas_hierarchical import bp as areas_hierarchical_bp
    from backend.routes.audit_logs import bp as audit_logs_bp
    from backend.routes.auth_jwt import bp as auth_bp
    from backend.routes.child_transfers import bp as child_transfers_bp
    from backend.routes.children_crud import bp as children_bp_legacy
    from backend.routes.children_crud_hierarchical import bp as children_bp
    from backend.routes.hospital import bp as hospital_bp
    from backend.routes.midwife import bp as midwife_bp
    from backend.routes.moh import bp as moh_bp
    from backend.routes.notifications import bp as notifications_bp
    from backend.routes.nutritionist import bp as nutritionist_bp
    from backend.routes.pdhs import bp as pdhs_bp
    from backend.routes.rdhs import bp as rdhs_bp
    from backend.routes.reporting import bp as reporting_bp
    from backend.routes.sign_pages import bp as sign_pages_bp
    from backend.routes.worker_management import bp as worker_management_bp

    for blueprint in (
        auth_bp,
        children_bp,
        children_bp_legacy,
        admin_bp,
        areas_hierarchical_bp,
        child_transfers_bp,
        worker_management_bp,
        reporting_bp,
        sign_pages_bp,
        hospital_bp,
        moh_bp,
        midwife_bp,
        nutritionist_bp,
        notifications_bp,
        rdhs_bp,
        pdhs_bp,
        admin_routes_bp,
        audit_logs_bp,
    ):
        app.register_blueprint(blueprint)

    @app.route("/health")
    def health():
        return {"status": "healthy"}, 200

    @app.route("/")
    def index():
        return {
            "status": "success",
            "message": "Child Malnutrition Monitoring API is running",
            "version": "2.0.0",
        }

    # Production schema changes are owned by Flask-Migrate/Alembic, never by
    # application startup. Validate encryption only after the app exists.
    with app.app_context():
        validate_encryption_key(required=node_env == "production" or flask_env == "production")
        try:
            db.session.execute(text("SELECT 1"))
            db.session.commit()
            db_uri = str(app.config.get("SQLALCHEMY_DATABASE_URI", ""))
            if "sqlite" in db_uri.lower():
                print(f"[OK] Database connected successfully (SQLite: {db_uri.split('///')[-1]})")
            elif "mysql" in db_uri.lower():
                print("[OK] Database connected successfully (MySQL)")
            else:
                print("[OK] Database connected successfully")
        except Exception as exc:
            if not app.config.get("TESTING"):
                raise RuntimeError("Database connection failed; apply migrations and verify configuration before startup.") from exc
        if app.config.get("TESTING"):
            db.create_all()
        else:
            tables = set(inspect(db.engine).get_table_names())
            if "users" not in tables:
                raise RuntimeError("Database schema is not initialized. Run Flask-Migrate migrations before startup.")
            seed_superadmin()

    return app


_module_app_overrides = None
if os.environ.get("CMRAS_TESTING") == "1":
    _module_app_overrides = {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "SQLALCHEMY_ENGINE_OPTIONS": {"connect_args": {"check_same_thread": False}},
        "EMAIL_ENABLED": False,
        "EMAIL_2FA_ENABLED": False,
        "EMAIL_NOTIFICATIONS_ENABLED": False,
        "RATELIMIT_ENABLED": False,
        "SUPERADMIN_PASSWORD_REQUIRED": False,
    }
app = create_app(_module_app_overrides)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    node_env = os.environ.get("NODE_ENV", "development").lower()
    app.run(debug=node_env != "production", host="0.0.0.0", port=port)
