# Referral, Reporting and History Tests

## Method

Executed the isolated backend workflow, referral, escalation, reporting and RBAC tests included in the 199-pass command recorded in report 02. Inspected `ChildProfileView.tsx`, `WHOGrowthCharts.tsx`, hierarchical child visits, and reporting routes.

## Results

- Midwife→MOH escalation, MOH acceptance/review, nutritionist referral decisions and return workflows passed in the API/integration tests.
- Referral acceptance/rejection tests passed.
- Reporting API tests passed under role-scoped synthetic SQLite data.
- History uses stored visits/measurements; `ChildProfileView.tsx` sorts chart data from oldest to newest for plotting and renders stored date, weight, height and Z-score values.
- The API visit endpoint returns visits in descending date order for list/history use.

## Limits

Charts were build-checked and statically inspected but not rendered in a real browser. Historical rows are displayed from saved data; no historical score recalculation was executed.
