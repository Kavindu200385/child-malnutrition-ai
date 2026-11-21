# CMRAS — Child Malnutrition Risk Assessment System

CMRAS is a final-year Computer Science project comprising a React frontend and Flask/MySQL backend for recording child anthropometric measurements, calculating WHO growth indicators, and supporting role-based clinical review workflows.

## Important clinical and research limits

- WHO weight-for-age, length/height-for-age, and weight-for-length/height outputs are anthropometric screening indicators. They are not independently confirmed clinical diagnoses.
- No clinically validated future-risk model is deployed. Historical research outputs are simulation-only and must not determine treatment, referral, or clinical prioritisation.
- Research datasets have unverified provenance. Their model results are reproducible simulation-label results, not clinical prediction validation.

## Repository layout

- `backend/` — Flask application, migrations, tests, and production WHO LMS assets.
- `frontend/` — React/Vite application and Vitest tests.
- `datasets/` — immutable research data organised as `processed/`, `simulated/`, `splits/`, and `manifests/`.
- `research_experiments/` — reproducible scripts, configurations, notebooks, verified outputs, artifacts, and WHO/system validation evidence.
- `research_audit/` — historical recovery and provenance audit evidence.
- `docs/` — project and dataset documentation.
- `repository_cleanup/` — cleanup inventory, migration, verification, and PR-preparation reports.

WHO LMS data intentionally remains at `backend/resources/who_growth_2006/`, where the backend loader expects it.

## Local development

Use local environment files only; do not commit credentials.

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m backend.app
```

In a separate terminal:

```sh
cd frontend
npm ci
npm run dev
```

The backend health endpoint is `/health`.

## Verification

Run tests only against isolated local configuration, never production services:

```sh
env -u DATABASE_URL -u EMAIL_ENABLED -u EMAIL_2FA_ENABLED -u EMAIL_NOTIFICATIONS_ENABLED -u RATELIMIT_ENABLED -u CMRAS_TESTING \
  .venv-who-test/bin/python -m pytest -q backend/tests research_experiments/who_validation/tests

cd frontend && npm test && npm run build
```

Dataset and frozen-split checks:

```sh
python research_experiments/scripts/test_step2d_preparation.py
python research_experiments/scripts/verify_step2f_publication.py --project-root . --source-run step2e_20261120T154822Z
```

The latter command creates a new verification package; do not run it when preserving an existing publication-output snapshot unchanged.

## Research data and reproducibility

The two longitudinal source CSVs and prepared train/validation/test partitions are explicitly classified as simulation-only/unverified. Their SHA-256 values, row counts, provenance status, and split assignments are recorded in `datasets/manifests/`.

Frozen Step 2E/2F artifacts remain under `research_experiments/artifacts/` and `research_experiments/outputs/`. The Colab ZIP is a self-contained historical snapshot and intentionally retains its internal paths.
