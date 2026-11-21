# Remaining Failures and Fixes

## Final status

There are **no remaining failed or blocked backend tests** after Step 3A.4.

## Corrections completed

| Earlier issue | Correction | Verification |
| --- | --- | --- |
| Flask could connect before pytest fixture configuration | Test environment variables are set before importing `backend.app`; the module-level app honors `CMRAS_TESTING` and uses in-memory SQLite. | Clean-shell complete suite: 192 passed, 1 skipped. |
| Successful measurement fixtures omitted required WHO inputs | Fixtures now include valid measurement date and method values. | Measurement validation and workflow tests pass. |
| Tests expected diagnostic MAM/SAM from screening output | Tests assert separate WFA/HFA/WFL-WFH screening indicators and approved clinical-review behavior. | Current-status and workflow tests pass. |
| Measurement audit calls lacked required prediction metadata | Midwife, MOH, and nutritionist calls explicitly record unavailable future-risk metadata as `None`. | Full workflow passes. |
| Audit helper returned a detached row after its private session closed | The helper refreshes and detaches the audit row before returning it. | Encryption/audit security test passes. |

## Non-failing follow-up work

1. Replace deprecated `datetime.utcnow()` calls with timezone-aware UTC datetimes before a future Python version removes the API.
2. Replace the legacy `Query.get()` use in the audit test with `db.session.get()`.
3. The rate-limit test remains intentionally skipped under test isolation because rate limiting is disabled; execute it in a dedicated isolated limiter-storage test configuration if rate-limit behavior itself needs release evidence.
4. Clinical reviewers must still approve the screening-only terminology, measurement workflow, and use of results before a production or publication claim. Passing software tests is not clinical validation.
