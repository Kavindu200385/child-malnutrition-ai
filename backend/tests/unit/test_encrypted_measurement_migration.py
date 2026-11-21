import importlib.util
from pathlib import Path

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "versions"
    / "20261121_text_storage_for_encrypted_measurements.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("encrypted_measurement_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_only_legacy_numeric_columns_require_text_storage():
    migration = _migration_module()

    assert migration._requires_text_storage({"type": sa.DECIMAL(6, 2)}) is True
    assert migration._requires_text_storage({"type": sa.Text()}) is False
    assert migration._requires_text_storage({"type": sa.String(40)}) is False
