"""
Create/repair the audit_logs table and indexes for existing deployments.

Run from the project root:
    python -m backend.scripts.audit_logs
"""
from sqlalchemy import inspect, text

from backend.app import app
from backend.extensions import db


AUDIT_INDEXES = {
    "idx_audit_logs_timestamp": ["timestamp"],
    "idx_audit_logs_user_id": ["user_id"],
    "idx_audit_logs_role": ["role"],
    "idx_audit_logs_action_type": ["action_type"],
    "idx_audit_logs_action_category": ["action_category"],
    "idx_audit_logs_entity_type": ["entity_type"],
    "idx_audit_logs_entity_id": ["entity_id"],
}


def ensure_audit_logs() -> None:
    db_uri = str(app.config.get("SQLALCHEMY_DATABASE_URI", "")).lower()
    is_mysql = "mysql" in db_uri

    with app.app_context(), db.engine.begin() as conn:
        inspector = inspect(conn)
        if "audit_logs" not in inspector.get_table_names():
            if is_mysql:
                conn.execute(text("""
                    CREATE TABLE audit_logs (
                        id INTEGER AUTO_INCREMENT PRIMARY KEY,
                        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER NULL,
                        username VARCHAR(80) NULL,
                        role VARCHAR(32) NULL,
                        action VARCHAR(50) NULL,
                        action_type VARCHAR(50) NOT NULL,
                        action_category VARCHAR(50) NOT NULL,
                        description TEXT NULL,
                        entity_type VARCHAR(50) NULL,
                        entity_id INTEGER NULL,
                        ip_address VARCHAR(45) NULL,
                        user_agent VARCHAR(255) NULL,
                        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
                        old_values JSON NULL,
                        new_values JSON NULL,
                        metadata JSON NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE audit_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
                        user_id INTEGER NULL,
                        username TEXT NULL,
                        role TEXT NULL,
                        action TEXT NULL,
                        action_type TEXT NOT NULL,
                        action_category TEXT NOT NULL,
                        description TEXT NULL,
                        entity_type TEXT NULL,
                        entity_id INTEGER NULL,
                        ip_address TEXT NULL,
                        user_agent TEXT NULL,
                        status TEXT NOT NULL DEFAULT 'SUCCESS',
                        old_values TEXT NULL,
                        new_values TEXT NULL,
                        metadata TEXT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
                    )
                """))
            print("[OK] Created audit_logs table")

        inspector = inspect(conn)
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("audit_logs")}
        for index_name, columns in AUDIT_INDEXES.items():
            if index_name in existing_indexes:
                continue
            conn.execute(text(f"CREATE INDEX {index_name} ON audit_logs({', '.join(columns)})"))
            print(f"[OK] Created {index_name}")


if __name__ == "__main__":
    ensure_audit_logs()
