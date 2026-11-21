# API Integration Test Results

## Safe execution

Flask tests ran only with `DATABASE_URL=sqlite:///:memory:` exported before application creation. The fixture creates and removes an isolated in-memory schema; no production API was invoked.

Command: `DATABASE_URL=sqlite:///:memory: ... python -m pytest -q backend/tests/integration/test_full_workflow.py backend/tests/security/test_security.py --maxfail=0`

| Source | Status | Detail / required correction |
| --- | --- | --- |
| `backend/tests/security/test_security.py` | 22 PASS, 1 SKIPPED | Authentication and authorization regressions passed. The existing skipped test remains skipped. |
| `test_full_workflow.py::test_hospital_registers_child` | PASS | Isolated SQLite workflow setup passed. |
| `test_full_workflow.py::test_midwife_adds_measurement_to_assigned_child` | FAIL | Its request only supplies child, weight, and height; it now correctly receives 400 because exact date and method are required. Update the test payload with `measurement_date` and `measurement_method`, then assert screening output rather than legacy MAM/SAM risk. |
| Other full-workflow tests | PASS | 3 additional workflow tests passed. |

Totals: **22 passed, 1 failed, 1 skipped**. API authentication/authorization compatibility is intact; the one workflow failure is an intentional request-contract change requiring test/client migration.
