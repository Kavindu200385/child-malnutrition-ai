"""
Flask Backend Application for Child Malnutrition AI

Backend stack:
- Flask
- MySQL (via SQLAlchemy + PyMySQL)
- JWT auth (role-based)
- ML model inference (joblib)
"""

import os
import sys

# Add project root to Python path for imports
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from dotenv import load_dotenv, find_dotenv  # type: ignore
from flask import Flask
from flask_cors import CORS
from sqlalchemy import inspect, text

from backend.extensions import db, jwt, migrate, limiter
from backend.models import User
from backend.services.encryption_service import validate_encryption_key
# Dummy data seeding removed - system starts clean


def _ensure_db_schema_compatible(app: Flask) -> None:
    """
    `db.create_all()` does NOT add new columns to existing tables, so older DBs
    can crash when models add columns (e.g., users.email, children.guardian_nic).

    This applies safe ALTER TABLE patches for SQLite/MySQL to keep dev DBs compatible.
    """
    db_uri = str(app.config.get("SQLALCHEMY_DATABASE_URI", "")).lower()
    is_sqlite = "sqlite" in db_uri
    is_mysql = "mysql" in db_uri

    with db.engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())

        def add_missing_columns(table: str, cols: list[tuple[str, str, str | None]]) -> None:
            if table not in tables:
                return
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, col_type, ddl_suffix in cols:
                if name in existing:
                    continue
                suffix = f" {ddl_suffix}" if ddl_suffix else ""
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {col_type}{suffix}"))

        def create_missing_index(table: str, index_name: str, columns: list[str]) -> None:
            if table not in tables:
                return
            existing = {idx["name"] for idx in inspector.get_indexes(table)}
            if index_name in existing:
                return
            try:
                conn.execute(text(f"CREATE INDEX {index_name} ON {table}({', '.join(columns)})"))
            except Exception as exc:
                print(f"[WARN] Could not create index {index_name} on {table}: {exc}")

        # users table additions (avoid UNIQUE constraints in ALTER TABLE for portability)
        add_missing_columns(
            "users",
            [
                ("email", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("phone", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("hospital_id", "INTEGER", None),
                ("phm_area_id", "INTEGER", None),
                ("moh_id", "INTEGER", None),
                ("staff_id", "VARCHAR(64)" if is_mysql else "TEXT", None),
                ("assignment_status", "VARCHAR(32)" if is_mysql else "TEXT", None),
                ("is_active", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 1"),
                ("is_protected", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 0"),
                (
                    "updated_at",
                    "DATETIME",
                    "NULL DEFAULT CURRENT_TIMESTAMP" + (" ON UPDATE CURRENT_TIMESTAMP" if is_mysql else ""),
                ),
                ("created_by_id", "INTEGER", None),
            ],
        )

        # areas table additions (legacy areas table may exist from older versions)
        add_missing_columns(
            "areas",
            [
                ("code", "VARCHAR(50)" if is_mysql else "TEXT", None),
                ("level", "VARCHAR(20)" if is_mysql else "TEXT", None),
                ("parent_id", "INTEGER", None),
                ("province", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("description", "TEXT", None),
                ("is_active", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 1"),
                (
                    "updated_at",
                    "DATETIME",
                    "NULL DEFAULT CURRENT_TIMESTAMP" + (" ON UPDATE CURRENT_TIMESTAMP" if is_mysql else ""),
                ),
            ],
        )

        add_missing_columns(
            "audit_logs",
            [
                ("timestamp", "DATETIME", "NOT NULL DEFAULT CURRENT_TIMESTAMP"),
                ("created_at", "DATETIME", "NULL DEFAULT CURRENT_TIMESTAMP"),
                ("user_id", "INTEGER", None),
                ("username", "VARCHAR(80)" if is_mysql else "TEXT", None),
                ("role", "VARCHAR(32)" if is_mysql else "TEXT", None),
                ("action", "VARCHAR(50)" if is_mysql else "TEXT", None),
                ("action_type", "VARCHAR(50)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'UNKNOWN'"),
                ("action_category", "VARCHAR(50)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'SYSTEM'"),
                ("description", "TEXT", None),
                ("entity_type", "VARCHAR(50)" if is_mysql else "TEXT", None),
                ("entity_id", "INTEGER", None),
                ("ip_address", "VARCHAR(45)" if is_mysql else "TEXT", None),
                ("user_agent", "VARCHAR(255)" if is_mysql else "TEXT", None),
                ("status", "VARCHAR(20)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'SUCCESS'"),
                ("old_values", "JSON" if is_mysql else "TEXT", None),
                ("new_values", "JSON" if is_mysql else "TEXT", None),
                ("metadata", "JSON" if is_mysql else "TEXT", None),
            ],
        )
        for index_name, columns in {
            "idx_audit_logs_timestamp": ["timestamp"],
            "idx_audit_logs_user_id": ["user_id"],
            "idx_audit_logs_role": ["role"],
            "idx_audit_logs_action_type": ["action_type"],
            "idx_audit_logs_action_category": ["action_category"],
            "idx_audit_logs_entity_type": ["entity_type"],
            "idx_audit_logs_entity_id": ["entity_id"],
        }.items():
            create_missing_index("audit_logs", index_name, columns)

        if "audit_logs" in tables:
            try:
                conn.execute(text("""
                    UPDATE audit_logs
                    SET action_type = action
                    WHERE action IS NOT NULL
                      AND action != ''
                      AND (action_type IS NULL OR action_type = '' OR UPPER(action_type) = 'UNKNOWN')
                """))
            except Exception as exc:
                print(f"[WARN] Could not backfill legacy audit action_type values: {exc}")

        if "user_otp_codes" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE user_otp_codes (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        user_id INTEGER NOT NULL,
                        otp_hash VARCHAR(255) NOT NULL,
                        purpose VARCHAR(40) NOT NULL,
                        expires_at DATETIME NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        used_at DATETIME NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ip_address VARCHAR(45) NULL,
                        user_agent VARCHAR(255) NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE user_otp_codes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        otp_hash TEXT NOT NULL,
                        purpose TEXT NOT NULL,
                        expires_at DATETIME NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        used_at DATETIME NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        ip_address TEXT NULL,
                        user_agent TEXT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )
                """))
            tables.add("user_otp_codes")

        add_missing_columns(
            "user_otp_codes",
            [
                ("user_id", "INTEGER", "NOT NULL DEFAULT 0"),
                ("otp_hash", "VARCHAR(255)" if is_mysql else "TEXT", "NOT NULL DEFAULT ''"),
                ("purpose", "VARCHAR(40)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'login_2fa'"),
                ("expires_at", "DATETIME", "NOT NULL DEFAULT CURRENT_TIMESTAMP"),
                ("attempts", "INTEGER", "NOT NULL DEFAULT 0"),
                ("used_at", "DATETIME", None),
                ("created_at", "DATETIME", "NOT NULL DEFAULT CURRENT_TIMESTAMP"),
                ("ip_address", "VARCHAR(45)" if is_mysql else "TEXT", None),
                ("user_agent", "VARCHAR(255)" if is_mysql else "TEXT", None),
            ],
        )
        for index_name, columns in {
            "idx_user_otp_codes_user_id": ["user_id"],
            "idx_user_otp_codes_purpose": ["purpose"],
            "idx_user_otp_codes_expires_at": ["expires_at"],
            "idx_user_otp_codes_used_at": ["used_at"],
            "idx_user_otp_lookup": ["user_id", "purpose", "used_at", "expires_at"],
        }.items():
            create_missing_index("user_otp_codes", index_name, columns)

        # Create new tables for MIDWIFE role
        # measurements table
        if "measurements" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE measurements (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        child_id INTEGER NOT NULL,
                        measurement_date DATETIME NOT NULL,
                        weight_kg TEXT NOT NULL,
                        height_cm TEXT NOT NULL,
                        muac_cm TEXT,
                        z_score_wfa TEXT,
                        z_score_hfa TEXT,
                        z_score_wfh TEXT,
                        risk_level VARCHAR(20),
                        predicted_risk_next_2_months VARCHAR(20),
                        model_confidence TEXT,
                        measured_by_user_id INTEGER NOT NULL,
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE measurements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        child_id INTEGER NOT NULL,
                        measurement_date DATETIME NOT NULL,
                        weight_kg TEXT NOT NULL,
                        height_cm TEXT NOT NULL,
                        muac_cm TEXT,
                        z_score_wfa TEXT,
                        z_score_hfa TEXT,
                        z_score_wfh TEXT,
                        risk_level TEXT,
                        predicted_risk_next_2_months TEXT,
                        model_confidence TEXT,
                        measured_by_user_id INTEGER NOT NULL,
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
        
        # child_escalations table
        if "child_escalations" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE child_escalations (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        child_id INTEGER NOT NULL,
                        escalated_by_user_id INTEGER NOT NULL,
                        from_role VARCHAR(32) NOT NULL DEFAULT 'midwife',
                        to_role VARCHAR(32) NOT NULL DEFAULT 'moh',
                        moh_id INTEGER NOT NULL,
                        reason TEXT,
                        previous_risk_level VARCHAR(20),
                        new_risk_level VARCHAR(20),
                        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                        reviewed_by_user_id INTEGER,
                        reviewed_at DATETIME,
                        review_notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))

            else:
                conn.execute(text("""
                    CREATE TABLE child_escalations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        child_id INTEGER NOT NULL,
                        escalated_by_user_id INTEGER NOT NULL,
                        from_role TEXT NOT NULL DEFAULT 'midwife',
                        to_role TEXT NOT NULL DEFAULT 'moh',
                        moh_id INTEGER NOT NULL,
                        reason TEXT,
                        previous_risk_level TEXT,
                        new_risk_level TEXT,
                        status TEXT NOT NULL DEFAULT 'PENDING',
                        reviewed_by_user_id INTEGER,
                        reviewed_at DATETIME,
                        review_notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))

        # notifications table
        if "notifications" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE notifications (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        title VARCHAR(200) NOT NULL,
                        message TEXT NOT NULL,
                        type VARCHAR(50) NOT NULL,
                        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
                        user_id INTEGER NOT NULL,
                        role VARCHAR(32),
                        actor_user_id INTEGER,
                        related_child_id INTEGER,
                        related_referral_id INTEGER,
                        related_escalation_id INTEGER,
                        related_transfer_id INTEGER,
                        related_report_id INTEGER,
                        metadata JSON,
                        is_read TINYINT(1) NOT NULL DEFAULT 0,
                        read_at DATETIME,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE notifications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        type TEXT NOT NULL,
                        priority TEXT NOT NULL DEFAULT 'normal',
                        user_id INTEGER NOT NULL,
                        role TEXT,
                        actor_user_id INTEGER,
                        related_child_id INTEGER,
                        related_referral_id INTEGER,
                        related_escalation_id INTEGER,
                        related_transfer_id INTEGER,
                        related_report_id INTEGER,
                        metadata JSON,
                        is_read INTEGER NOT NULL DEFAULT 0,
                        read_at DATETIME,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
        
        # clinic_reports table
        if "clinic_reports" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE clinic_reports (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        phm_area_id INTEGER NOT NULL,
                        report_month INTEGER NOT NULL,
                        report_year INTEGER NOT NULL,
                        total_children_seen INTEGER NOT NULL DEFAULT 0,
                        normal_count INTEGER NOT NULL DEFAULT 0,
                        mam_count INTEGER NOT NULL DEFAULT 0,
                        sam_count INTEGER NOT NULL DEFAULT 0,
                        escalated_cases INTEGER NOT NULL DEFAULT 0,
                        submitted_to_moh TINYINT(1) NOT NULL DEFAULT 0,
                        submitted_at DATETIME,
                        created_by_user_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_report (phm_area_id, report_month, report_year)
                    )
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE clinic_reports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        phm_area_id INTEGER NOT NULL,
                        report_month INTEGER NOT NULL,
                        report_year INTEGER NOT NULL,
                        total_children_seen INTEGER NOT NULL DEFAULT 0,
                        normal_count INTEGER NOT NULL DEFAULT 0,
                        mam_count INTEGER NOT NULL DEFAULT 0,
                        sam_count INTEGER NOT NULL DEFAULT 0,
                        escalated_cases INTEGER NOT NULL DEFAULT 0,
                        submitted_to_moh INTEGER NOT NULL DEFAULT 0,
                        submitted_at DATETIME,
                        created_by_user_id INTEGER NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(phm_area_id, report_month, report_year)
                    )
                """))
        
        # moh_reports table (MOH monthly reports to RDHS)
        if "moh_reports" not in tables:
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE moh_reports (
                        id INTEGER PRIMARY KEY AUTO_INCREMENT,
                        moh_id INTEGER NOT NULL,
                        moh_area_id INTEGER NOT NULL,
                        total_children INTEGER NOT NULL DEFAULT 0,
                        normal_count INTEGER NOT NULL DEFAULT 0,
                        mam_count INTEGER NOT NULL DEFAULT 0,
                        sam_count INTEGER NOT NULL DEFAULT 0,
                        total_escalations INTEGER NOT NULL DEFAULT 0,
                        month INTEGER NOT NULL,
                        report_year INTEGER NOT NULL,
                        sent_to_rdhs TINYINT(1) NOT NULL DEFAULT 0,
                        sent_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE moh_reports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        moh_id INTEGER NOT NULL,
                        moh_area_id INTEGER NOT NULL,
                        total_children INTEGER NOT NULL DEFAULT 0,
                        normal_count INTEGER NOT NULL DEFAULT 0,
                        mam_count INTEGER NOT NULL DEFAULT 0,
                        sam_count INTEGER NOT NULL DEFAULT 0,
                        total_escalations INTEGER NOT NULL DEFAULT 0,
                        month INTEGER NOT NULL,
                        report_year INTEGER NOT NULL,
                        sent_to_rdhs INTEGER NOT NULL DEFAULT 0,
                        sent_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
        
        # children table additions
        add_missing_columns(
            "children",
            [
                ("child_unique_id", "VARCHAR(64)" if is_mysql else "TEXT", None),
                ("birth_weight_kg", "TEXT", None),
                ("birth_height_cm", "TEXT", None),
                ("mother_name", "TEXT", None),
                ("hospital_id", "INTEGER", None),
                ("birth_risk_level", "VARCHAR(20)" if is_mysql else "TEXT", None),
                ("transfer_status", "VARCHAR(50)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'NONE'"),
                ("is_transferred", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 0"),
                ("phm_area_id", "INTEGER", None),
                ("moh_area_id", "INTEGER", None),
                ("district_id", "INTEGER", None),
                ("province_id", "INTEGER", None),
                ("assigned_date", "DATETIME", None),
                ("escalation_status", "VARCHAR(50)" if is_mysql else "TEXT", "NOT NULL DEFAULT 'NONE'"),
                ("guardian_nic", "TEXT", None),
                ("guardian_email", "TEXT", None),
                ("registered_by_user_id", "INTEGER", None),
                ("registration_date", "DATETIME", None),
                ("current_assigned_role", "TEXT", None),
                ("current_assigned_area_id", "INTEGER", None),
                ("current_assigned_user_id", "INTEGER", None),
                # Legacy text fields (still used by some routes/UI)
                ("registered_by_clinic", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("assigned_to_clinic", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("midwife_area", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("moh_area", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("midwife_area_id", "INTEGER", None),
                ("current_risk_level", "TEXT", None),
                ("last_risk_update", "DATETIME", None),
                ("status", "TEXT", None),
                ("birth_registration", "TEXT", None),
                ("updated_at", "DATETIME", None),
            ],
        )

        # visits table additions
        add_missing_columns(
            "visits",
            [
                ("notes", "TEXT", None),
                ("created_at", "DATETIME", None),
                ("current_nutritional_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("future_predicted_risk", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("future_risk_confidence", "TEXT", None),
                ("muac_cm", "TEXT", None),
                ("muac_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("edema_present", "TINYINT(1)" if is_mysql else "INTEGER", None),
                ("edema_status", "VARCHAR(60)" if is_mysql else "TEXT", None),
                ("measurement_method", "VARCHAR(32)" if is_mysql else "TEXT", None),
                ("underweight_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("stunting_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("wasting_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("current_status_breakdown", "TEXT", None),
                ("prediction_timestamp", "DATETIME", None),
                ("model_version", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("training_dataset_version", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("explanation_factors", "TEXT", None),
                ("clinical_action_required", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 0"),
                ("clinical_review_reason", "TEXT", None),
            ],
        )

        # measurements table additions
        add_missing_columns(
            "measurements",
            [
                ("current_nutritional_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("future_predicted_risk", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("future_risk_confidence", "TEXT", None),
                ("muac_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("edema_present", "TINYINT(1)" if is_mysql else "INTEGER", None),
                ("edema_status", "VARCHAR(60)" if is_mysql else "TEXT", None),
                ("measurement_method", "VARCHAR(32)" if is_mysql else "TEXT", None),
                ("underweight_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("stunting_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("wasting_status", "VARCHAR(40)" if is_mysql else "TEXT", None),
                ("current_status_breakdown", "TEXT", None),
                ("prediction_timestamp", "DATETIME", None),
                ("model_version", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("training_dataset_version", "VARCHAR(120)" if is_mysql else "TEXT", None),
                ("explanation_factors", "TEXT", None),
                ("clinical_action_required", "TINYINT(1)" if is_mysql else "INTEGER", "NOT NULL DEFAULT 0"),
                ("clinical_review_reason", "TEXT", None),
            ],
        )


def seed_superadmin() -> None:
    """
    Seed system developer (superadmin) user.
    Password is read from the SUPERADMIN_PASSWORD environment variable.
    The account is protected and cannot be deleted.
    """
    superadmin_username = os.environ.get("SUPERADMIN_USERNAME", "superadmin")
    superadmin_password = os.environ.get("SUPERADMIN_PASSWORD", "")

    if not superadmin_password:
        print(
            "[WARNING] SUPERADMIN_PASSWORD env var is not set. "
            "Superadmin account will not be created or updated. "
            "Set SUPERADMIN_PASSWORD in backend/.env to enable."
        )
        return

    existing = User.query.filter_by(username=superadmin_username).first()
    if existing:
        if not existing.is_protected:
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


def create_app() -> Flask:
    # Load env from:
    # - repo/root .env (if present)
    # - backend/.env (if present)
    load_dotenv(find_dotenv(usecwd=True))
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
    node_env = os.environ.get("NODE_ENV", "development").lower()
    flask_env = os.environ.get("FLASK_ENV", "").lower()
    validate_encryption_key(required=node_env == "production" or flask_env == "production")

    from backend.config import Config

    app = Flask(__name__)
    app.config.from_object(Config)

    # Extensions
    CORS(app, resources={r"/*": {"origins": app.config.get("CORS_ORIGINS", "*")}})
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    # Blueprints - Legacy (for backward compatibility)
    from backend.routes.auth_jwt import bp as auth_bp
    from backend.routes.children_crud import bp as children_bp_legacy
    from backend.routes.analysis_jwt import bp as analysis_bp
    from backend.routes.admin_tools import bp as admin_bp

    # Blueprints - Hierarchical System
    from backend.routes.areas_hierarchical import bp as areas_hierarchical_bp
    from backend.routes.children_crud_hierarchical import bp as children_bp
    from backend.routes.child_transfers import bp as child_transfers_bp
    from backend.routes.worker_management import bp as worker_management_bp
    from backend.routes.reporting import bp as reporting_bp
    from backend.routes.sign_pages import bp as sign_pages_bp
    from backend.routes.hospital import bp as hospital_bp  # Hospital role routes
    from backend.routes.moh import bp as moh_bp  # MOH role routes (area supervisor)
    from backend.routes.midwife import bp as midwife_bp  # Midwife role routes (reports, children, dashboard)
    from backend.routes.notifications import bp as notifications_bp
    from backend.routes.nutritionist import bp as nutritionist_bp  # Nutritionist specialist role
    from backend.routes.rdhs import bp as rdhs_bp  # RDHS District Admin
    from backend.routes.pdhs import bp as pdhs_bp  # PDHS Province Admin
    from backend.routes.admin_routes import bp as admin_routes_bp  # Health Ministry admin (dashboard, messaging, settings)
    from backend.routes.audit_logs import bp as audit_logs_bp  # Audit Logs

    # Register all blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(children_bp)  # New hierarchical version
    app.register_blueprint(children_bp_legacy)  # Legacy (can be removed later)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(areas_hierarchical_bp)  # New hierarchical version
    app.register_blueprint(child_transfers_bp)
    app.register_blueprint(worker_management_bp)
    app.register_blueprint(reporting_bp)
    app.register_blueprint(sign_pages_bp)
    app.register_blueprint(hospital_bp)  # Hospital role routes
    app.register_blueprint(moh_bp)  # MOH role routes
    app.register_blueprint(midwife_bp)  # Midwife role routes
    app.register_blueprint(nutritionist_bp)  # Nutritionist role routes
    app.register_blueprint(notifications_bp)
    app.register_blueprint(rdhs_bp)  # RDHS District Admin routes
    app.register_blueprint(pdhs_bp)  # PDHS Province Admin routes
    app.register_blueprint(admin_routes_bp)  # Admin dashboard, messaging, settings
    app.register_blueprint(audit_logs_bp)

    @app.route("/health")
    def health():
        return {"status": "healthy"}, 200

    @app.route("/")
    def index():
        return {
            "status": "success",
            "message": "Child Malnutrition AI API is running",
            "version": "2.0.0",
        }

    # Create tables + seed superadmin on startup; verify DB connection
    with app.app_context():
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
        except Exception as e:
            print(f"[ERROR] Database connection failed: {e}")
            print("  Check backend/.env: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME")
            print("  For MySQL: ensure MySQL is running and the database 'cmras' exists.")
        db.create_all()
        _ensure_db_schema_compatible(app)
        # Backfill missing child_unique_id from child_id (legacy rows)
        from backend.models_hierarchical import Child
        missing_uid = Child.query.filter(
            Child.child_unique_id.is_(None),
            Child.child_id.isnot(None),
        ).all()
        for row in missing_uid:
            row.child_unique_id = row.child_id
        if missing_uid:
            db.session.commit()
            print(f"[OK] Backfilled child_unique_id for {len(missing_uid)} child record(s)")
        seed_superadmin()
        # Dummy data seeding removed - system starts clean

    return app


app = create_app()


if __name__ == "__main__":
    # Use 5001 to avoid conflict with macOS AirPlay Receiver on 5000
    port = int(os.environ.get("PORT", "5001"))
    node_env = os.environ.get("NODE_ENV", "development").lower()
    debug = node_env != "production"
    app.run(debug=debug, host="0.0.0.0", port=port)
