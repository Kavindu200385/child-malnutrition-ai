# Automated WHO Regression Results

## Environment and safety

Commands used `.venv-who-test/bin/python` (Python 3.14.0, pytest 9.2.0). Missing Flask, SQLAlchemy, JWT, limiter, migration, cryptography, and pytest plug-in dependencies were installed only into that environment from `backend/requirements.txt`.

The first unqualified Flask run revealed that `create_app()` performs its startup connection before the fixture overrides the URI; it reported MySQL and is not a valid isolated run. All subsequent Flask commands forced `DATABASE_URL=sqlite:///:memory:` before Python started, disabled email delivery, and reported `SQLite: :memory:`. No further database-backed test used the ambient database configuration.

## Official WHO cases

Standalone integrated-engine execution of the original 14 documented independent cases passed **14/14** with the 0.05 z-score tolerance. Maximum observed difference after the public three-decimal compatibility return was 0.002170. Cases covered WAZ, HAZ, WLZ, WHZ, both sexes, -2/-3 thresholds, infant/older-child values, and WFL/WFH boundaries.

The extra extreme-value, 730/731-day method transition, zero-weight, missing-method, and unsupported-height checks passed in the production calculator smoke test.

## Pytest results

Command: `DATABASE_URL=sqlite:///:memory: ... python -m pytest -q backend/tests/unit/test_who_growth.py backend/tests/unit/test_measurement_validation.py backend/tests/unit/test_current_status_rules.py --maxfail=0`

| Source | Status | Detail / required correction |
| --- | --- | --- |
| `test_who_growth.py` (3 tests) | PASS | Valid calculation, invalid sex, method/height rejection passed. |
| `test_measurement_validation.py` (5 named tests) | FAIL | Existing payloads omit now-required `measurement_date` and `measurement_method`; update test fixtures to provide real values, not relaxed validation. |
| `test_current_status_rules.py::test_legacy_measurement_breakdown_is_reconstructed_from_saved_z_scores` | FAIL | Test expects legacy `SAM`; screening-only integration returns `NEEDS CLINICAL REVIEW`. Update expected legacy-display behavior after clinical policy review. |
| Remaining focused unit tests | PASS | 16 passed total in the focused unit command. |

No WHO expected reference value was modified.
