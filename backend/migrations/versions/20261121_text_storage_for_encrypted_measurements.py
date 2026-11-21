"""Use text storage for encrypted measurement values.

Revision ID: 20261121_text_storage_for_encrypted_measurements
Revises: 20261121_add_hospital_district_area

EncryptedDecimal and EncryptedFloat persist Fernet ciphertext, so numeric
database columns cannot safely hold the canonical application representation.
Legacy plaintext numbers remain readable after conversion and are not changed
or encrypted by this schema-only migration.
"""

from alembic import op
import sqlalchemy as sa


revision = "20261121_text_storage_for_encrypted_measurements"
down_revision = "20261121_add_hospital_district_area"
branch_labels = None
depends_on = None


ENCRYPTED_NUMERIC_COLUMNS = {
    "measurements": (
        "weight_kg", "height_cm", "muac_cm", "z_score_wfa", "z_score_hfa",
        "z_score_wfh", "model_confidence", "future_risk_confidence",
    ),
    "visits": (
        "weight_kg", "height_cm", "muac_cm", "z_wfa", "z_hfa", "z_wfh",
        "model_confidence", "future_risk_confidence",
    ),
}


def _requires_text_storage(column: dict) -> bool:
    """Only convert legacy numeric types; leave existing text storage untouched."""
    return isinstance(column["type"], sa.Numeric)


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table, names in ENCRYPTED_NUMERIC_COLUMNS.items():
        if table not in tables:
            continue
        columns = {column["name"]: column for column in inspector.get_columns(table)}
        numeric_columns = [
            (name, columns[name])
            for name in names
            if name in columns and _requires_text_storage(columns[name])
        ]
        if not numeric_columns:
            continue
        # A single batch operation avoids stale SQLite inspector metadata after
        # its table-recreation implementation of ALTER COLUMN.
        with op.batch_alter_table(table) as batch_op:
            for name, column in numeric_columns:
                batch_op.alter_column(
                    name,
                    existing_type=column["type"],
                    type_=sa.Text(),
                    existing_nullable=column["nullable"],
                )


def downgrade():
    raise NotImplementedError(
        "Encrypted measurement values cannot be safely converted back to numeric columns. "
        "Restore a database backup to roll back this migration."
    )
