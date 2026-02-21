"""
Migration script to add is_draft boolean column to children table.
This supports both MySQL and SQLite.
"""

import os
import sys

from sqlalchemy import create_engine, inspect, text

# Ensure project root is on path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from config import Config  # noqa: E402


def main() -> None:
    db_uri = Config.SQLALCHEMY_DATABASE_URI
    print(f"Database URI: {db_uri}")

    engine = create_engine(db_uri)
    inspector = inspect(engine)

    # Check if column already exists
    try:
        columns = [col["name"] for col in inspector.get_columns("children")]
        if "is_draft" in columns:
            print("[OK] is_draft column already exists on children.")
            return
    except Exception as exc:  # pragma: no cover - safety net
        print(f"[WARN] Could not inspect children table: {exc}")
        print("Attempting to add is_draft column anyway...")

    with engine.connect() as conn:
        trans = conn.begin()
        try:
            if db_uri.lower().startswith("mysql"):
                # MySQL: use TINYINT(1) for boolean
                conn.execute(
                    text(
                        """
                        ALTER TABLE children
                        ADD COLUMN is_draft TINYINT(1) NOT NULL DEFAULT 0
                        """
                    )
                )
            else:
                # SQLite and others: use INTEGER 0/1
                conn.execute(
                    text(
                        """
                        ALTER TABLE children
                        ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0
                        """
                    )
                )

            trans.commit()
            print("[SUCCESS] Added is_draft column to children table.")
        except Exception as exc:  # pragma: no cover - safety net
            trans.rollback()
            print(f"[ERROR] Failed to add is_draft column: {exc}")
            raise


if __name__ == "__main__":
    main()

