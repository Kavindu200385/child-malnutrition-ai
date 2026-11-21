# Full Backend Test Results

## Execution environment and isolation

All commands used `.venv-who-test/bin/python` with Python 3.14.0 and pytest 9.2.0.

`backend/tests/conftest.py` now sets `CMRAS_TESTING=1`, forces `DATABASE_URL=sqlite:///:memory:`, and disables `EMAIL_ENABLED`, `EMAIL_2FA_ENABLED`, `EMAIL_NOTIFICATIONS_ENABLED`, and rate limiting **before** importing `backend.app`. The module-level Flask application recognizes `CMRAS_TESTING` and uses the same in-memory SQLite configuration. The session fixture creates and drops the SQLite schema; no production database, production API, or email service is used by the test suite.

The complete-suite command deliberately removed any ambient database and delivery environment variables before pytest started:

```text
env -u DATABASE_URL -u EMAIL_ENABLED -u EMAIL_2FA_ENABLED -u EMAIL_NOTIFICATIONS_ENABLED -u RATELIMIT_ENABLED -u CMRAS_TESTING .venv-who-test/bin/python -m pytest -q backend/tests
```

## Results

| Suite | Passed | Failed | Skipped | Blocked |
| --- | ---: | ---: | ---: | ---: |
| Complete backend suite (`backend/tests`) | 192 | 0 | 1 | 0 |
| WHO regression tests (`research_experiments/who_validation/tests` plus production WHO unit tests) | 10 | 0 | 0 | 0 |
| Focused WHO, validation, workflow, and security rerun | 45 | 0 | 1 | 0 |

The one skipped backend test is the pre-existing rate-limit test, skipped because the deliberately isolated test configuration disables rate limiting. It is not a failed validation and is documented by the test itself.

## Coverage confirmed

- Production WHO unit tests passed.
- Independent WHO validation tests passed, including official-reference regression coverage and measurement-method/error cases.
- Measurement validation fixtures now provide valid `measurement_date` and `measurement_method` values where a successful WHO assessment is expected.
- Workflow assertions now verify the separate underweight, stunting, and wasting screening indicators instead of legacy diagnostic MAM/SAM output.
- Flask workflow, authentication, authorization, encryption/audit, API, and security tests passed under isolated SQLite.

## Warnings

The suite emitted existing Python 3.14 `datetime.utcnow()` deprecation warnings and one SQLAlchemy `Query.get()` legacy warning. These warnings did not affect test results or database isolation.
