"""Backfill WHO clinical status fields for legacy visits and measurements.

Run from the project root:
    .venv/bin/python -m backend.scripts.recompute_clinical_assessments
"""

from backend.app import create_app
from backend.maintenance import recompute_all_measurements, recompute_all_visits


def main() -> None:
    app = create_app()
    with app.app_context():
        visits = recompute_all_visits()
        measurements = recompute_all_measurements()

    print("Clinical assessment backfill complete.")
    print(f"Visits: {visits}")
    print(f"Measurements: {measurements}")


if __name__ == "__main__":
    main()
