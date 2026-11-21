# IEEE System Validation Summary

## Software verification evidence

CMRAS application verification covered its implemented JWT/RBAC roles, child lifecycle, measurement capture, WHO screening calculation integration, history, escalation/referral, reporting, notifications, audit controls, frontend contract utilities and production build.

| Evidence area | Result |
| --- | --- |
| Backend plus independent WHO regression tests | 199 passed, 0 failed, 1 isolated rate-limit skip |
| Frontend Vitest | 39 passed, 0 failed |
| Frontend production build | passed |
| WHO workflow | required date/method contract, invalid-input rejection, separate indicators and reference regressions verified |
| Security/RBAC | automated authorization, isolation, audit and encryption tests passed |
| Local API performance | 30-trial isolated timings recorded; not production benchmarks |

## IEEE interpretation

This is reproducible software-testing evidence using synthetic, isolated data. It demonstrates implementation behavior and integration coverage; it does **not** demonstrate clinical validation, diagnostic performance, real-world usability, patient outcomes, deployment readiness, or clinical validation of future-risk prediction.

## Manuscript blockers before claims

Resolve or explicitly qualify the legacy MAM/SAM frontend terminology and future-risk presentation, obtain clinical review of screening language/workflow, and avoid representing local SQLite timings as field performance. Browser E2E/mobile validation remains unexecuted.
