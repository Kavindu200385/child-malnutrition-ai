"""
Migration script to add midwife_area / moh_area columns to children table
and create a simple areas master table if it does not exist.
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

    # --- children.midwife_area / moh_area ---
    try:
        child_columns = [col["name"] for col in inspector.get_columns("children")]
    except Exception as exc:  # pragma: no cover
        print(f"[WARN] Could not inspect children table: {exc}")
        child_columns = []

    with engine.connect() as conn:
        trans = conn.begin()
        try:
            if "midwife_area" not in child_columns:
                conn.execute(
                    text(
                        """
                        ALTER TABLE children
                        ADD COLUMN midwife_area VARCHAR(120)
                        """
                    )
                )
                print("[SUCCESS] Added children.midwife_area")

            if "moh_area" not in child_columns:
                conn.execute(
                    text(
                        """
                        ALTER TABLE children
                        ADD COLUMN moh_area VARCHAR(120)
                        """
                    )
                )
                print("[SUCCESS] Added children.moh_area")

            trans.commit()
        except Exception as exc:  # pragma: no cover
            trans.rollback()
            print(f"[ERROR] Failed to alter children table: {exc}")
            raise

    # --- areas table ---
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS areas (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR(120) NOT NULL UNIQUE,
                        type VARCHAR(32) NOT NULL,
                        district VARCHAR(120),
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            trans.commit()
            print("[SUCCESS] Ensured areas table exists")
        except Exception as exc:  # pragma: no cover
            trans.rollback()
            print(f"[ERROR] Failed to create areas table: {exc}")
            raise


if __name__ == "__main__":
    main()

