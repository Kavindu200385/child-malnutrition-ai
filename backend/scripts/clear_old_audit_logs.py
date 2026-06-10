"""
Delete audit logs before today.

Use this once when starting a fresh audit trail. This intentionally uses SQL
instead of ORM delete because AuditLog rows are immutable in normal app flows.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, time
from pathlib import Path

from sqlalchemy import create_engine, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(ROOT_DIR))


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def database_url() -> str:
    load_env(BACKEND_DIR / ".env")
    configured = os.environ.get("DATABASE_URL")
    if configured:
        return configured

    host = os.environ.get("DB_HOST")
    port = os.environ.get("DB_PORT", "3306")
    username = os.environ.get("DB_USERNAME")
    password = os.environ.get("DB_PASSWORD", "")
    name = os.environ.get("DB_NAME")
    if host and username and name:
        return f"mysql+pymysql://{username}:{password}@{host}:{port}/{name}?charset=utf8mb4"

    return f"sqlite:///{BACKEND_DIR / 'child_malnutrition.db'}"


def main() -> int:
    cutoff = datetime.combine(datetime.utcnow().date(), time.min)
    engine = create_engine(database_url())
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM audit_logs WHERE timestamp < :cutoff"),
            {"cutoff": cutoff},
        )
    print(f"Deleted {result.rowcount or 0} audit log rows before {cutoff.isoformat(sep=' ')} UTC.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
