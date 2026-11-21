# Final Repository Structure

```text
backend/                         Flask application and WHO reference assets
frontend/                        React application
datasets/
  processed/unverified_static/   Static CSVs with unverified provenance
  simulated/longitudinal/        Frozen longitudinal simulation sources
  simulated/prepared/            Frozen train, validation, and test CSVs
  splits/                        Frozen child-level split memberships
  manifests/                     Hashes, validation, split, and readiness metadata
docs/datasets/                   Dataset notes and historical PDF reports
research_audit/                  Historical audit and recovered-file evidence
research_experiments/            Reproducible experiment code, configurations, outputs
repository_cleanup/reports/      This cleanup evidence
```

WHO production assets remain intentionally outside `datasets/`, because `backend/utils/who_growth.py` loads them from `backend/resources/who_growth_2006/`. Historical recovered files, Colab snapshots, and prior run outputs also remain at their evidence locations.
