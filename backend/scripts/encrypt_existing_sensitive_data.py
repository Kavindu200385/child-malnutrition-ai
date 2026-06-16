"""
Encrypt existing plaintext sensitive healthcare data.

Run after setting DATA_ENCRYPTION_KEY. The script is idempotent and skips
values already prefixed with enc:v1:.

Usage:
  cd backend
  ../.venv/bin/python scripts/encrypt_existing_sensitive_data.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.extensions import db
from backend.services.encryption_service import (
    EncryptionConfigurationError,
    encrypt_value,
    is_encrypted,
    validate_encryption_key,
)


TABLE_FIELDS: dict[str, list[str]] = {
    "children": [
        "name",
        "dob",
        "birth_weight_kg",
        "birth_height_cm",
        "guardian_name",
        "mother_name",
        "guardian_phone",
        "guardian_email",
        "guardian_nic",
        "address",
        "birth_registration",
    ],
    "measurements": [
        "weight_kg",
        "height_cm",
        "muac_cm",
        "z_score_wfa",
        "z_score_hfa",
        "z_score_wfh",
        "model_confidence",
        "notes",
    ],
    "visits": [
        "weight_kg",
        "height_cm",
        "z_wfa",
        "z_hfa",
        "z_wfh",
        "model_confidence",
        "notes",
    ],
    "child_escalations": ["reason", "review_notes"],
    "child_referrals": ["referral_reason"],
    "child_transfers": ["reason", "rejection_reason"],
    "area_change_requests": ["reason", "rejection_reason"],
    "rdhs_period_reports": ["payload"],
    "reports": ["report_data"],
}


MYSQL_TEXT_COLUMNS = {
    table: fields for table, fields in TABLE_FIELDS.items()
}


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _serialise(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=_json_default, separators=(",", ":"))
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _column_exists(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _quote_identifier(name: str) -> str:
    return f"`{name.replace('`', '``')}`"


def _drop_mysql_indexes_for_encrypted_columns(conn, inspector, table: str, fields: list[str]) -> None:
    field_set = set(fields)
    for index in inspector.get_indexes(table):
        index_name = index.get("name")
        if not index_name or index_name == "PRIMARY":
            continue
        indexed_columns = set(index.get("column_names") or [])
        if indexed_columns & field_set:
            conn.execute(
                text(
                    f"DROP INDEX {_quote_identifier(index_name)} "
                    f"ON {_quote_identifier(table)}"
                )
            )


def _alter_mysql_columns_to_text(conn, inspector) -> None:
    tables = set(inspector.get_table_names())
    for table, fields in MYSQL_TEXT_COLUMNS.items():
        if table not in tables:
            continue
        _drop_mysql_indexes_for_encrypted_columns(conn, inspector, table, fields)
        for field in fields:
            if not _column_exists(inspector, table, field):
                continue
            nullable = "NULL"
            if table in {"measurements", "visits"} and field in {"weight_kg", "height_cm"}:
                nullable = "NOT NULL"
            conn.execute(text(f"ALTER TABLE {table} MODIFY COLUMN {field} TEXT {nullable}"))


def _encrypt_table(conn, inspector, table: str, fields: list[str]) -> int:
    if table not in set(inspector.get_table_names()):
        return 0
    existing_fields = [f for f in fields if _column_exists(inspector, table, f)]
    if not existing_fields:
        return 0

    rows = conn.execute(text(f"SELECT id, {', '.join(existing_fields)} FROM {table}")).mappings().all()
    changed = 0
    for row in rows:
        updates = {}
        for field in existing_fields:
            value = row[field]
            if value is None or value == "":
                continue
            serialized = _serialise(value)
            if is_encrypted(serialized):
                continue
            updates[field] = encrypt_value(serialized)
        if updates:
            assignments = ", ".join(f"{field} = :{field}" for field in updates)
            conn.execute(text(f"UPDATE {table} SET {assignments} WHERE id = :id"), {**updates, "id": row["id"]})
            changed += 1
    return changed


def main() -> int:
    try:
        validate_encryption_key(required=True)
    except EncryptionConfigurationError as exc:
        print(f"[ERROR] {exc}")
        return 1

    app = create_app()
    with app.app_context():
        db_uri = str(db.engine.url).lower()
        with db.engine.begin() as conn:
            inspector = inspect(conn)
            if "mysql" in db_uri:
                _alter_mysql_columns_to_text(conn, inspector)
                inspector = inspect(conn)

            total = 0
            for table, fields in TABLE_FIELDS.items():
                count = _encrypt_table(conn, inspector, table, fields)
                total += count
                print(f"[OK] {table}: encrypted/updated {count} row(s)")

    print(f"[DONE] Sensitive data migration complete. Updated {total} row(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
