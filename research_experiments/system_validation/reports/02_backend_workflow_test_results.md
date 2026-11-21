# Backend Workflow Test Results

## Isolation method

`backend/tests/conftest.py` sets `CMRAS_TESTING=1`, `DATABASE_URL=sqlite:///:memory:`, and disabled email/notification/rate-limit variables before importing Flask. `backend.app` recognizes that test marker for its module-level app. Test fixtures use in-memory SQLite, synthetic identities and records only.

## Command and result

```text
env -u DATABASE_URL -u EMAIL_ENABLED -u EMAIL_2FA_ENABLED -u EMAIL_NOTIFICATIONS_ENABLED -u RATELIMIT_ENABLED -u CMRAS_TESTING .venv-who-test/bin/python -m pytest -q backend/tests research_experiments/who_validation/tests
```

Result: **199 passed, 0 failed, 1 skipped**.

The skipped test is the existing rate-limit assertion. It is skipped because rate limiting is deliberately disabled in the isolated test app; it is not counted as a passing rate-limit test.

## Workflow evidence

- Authentication: valid/invalid credentials, JWT access, logout audit behavior, unauthenticated denial, inactive-user handling and role denial.
- Child management: registration, retrieval, authorization, gender normalization, invalid input, assignment and escalation ownership flows.
- Measurement: valid WHO measurement creation, missing/invalid inputs, dates, methods, age/sex validation, persisted WFA/HFA/WFL-WFH values and separate screening indicators.
- Referrals/reporting: referral creation/acceptance/rejection, escalation status transitions, notifications, reporting endpoints, RBAC isolation and audit/encryption behavior.

## Limits

This is API and service testing on synthetic SQLite data. It does not test a MySQL migration, a production service, real email delivery, or clinical outcomes.
