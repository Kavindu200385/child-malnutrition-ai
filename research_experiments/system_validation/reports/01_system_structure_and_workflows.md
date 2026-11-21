# System Structure and Workflows

## Method

Static inspection of `backend/app.py`, registered Flask blueprints, `backend/models_hierarchical.py`, `frontend/src/services/api.js`, React workflow components, existing tests, and project documentation. This is implementation inspection, not clinical validation or a browser usability study.

## Actual implementation

The active backend registers JWT authentication, hierarchical children, area/hospital management, transfers, worker management, reporting, hospital, midwife, MOH/AMOH, nutritionist, notification, RDHS, PDHS, administration, and audit-log blueprints.

Defined operational roles are Health Ministry, PDHS, RDHS, MOH, AMOH, Midwife, Nutritionist, and Hospital. Authentication uses Flask-JWT-Extended bearer tokens. Email 2FA is configurable; tests disable it and all mail delivery.

| Workflow | Existing implementation examined |
| --- | --- |
| Child management | Hospital birth registration; hierarchical child create/read/update/delete/assignment; role/area checks. |
| Measurement | Midwife, MOH, and nutritionist measurement routes validate date, method, sex, age, weight and height before WHO calculation. |
| WHO assessment | `backend/utils/who_growth.py`, `measurement_validation.py`, and `current_status.py`; WFA/HFA/WFL-WFH screening indicators are stored separately. |
| History and charts | Child visits and measurements are returned by child routes; `ChildProfileView.tsx` and `WHOGrowthCharts.tsx` sort/render measurement history. |
| Referral/escalation | Midwife→MOH escalation, MOH/nutritionist referral actions, hospital referrals, and transfer workflows. |
| Reports/dashboards | MOH, RDHS, PDHS, ministry and health-worker report/dashboard routes and views. |
| Future risk | Nullable historical fields exist on measurements/visits; research artifacts exist only under `research_experiments/artifacts/`. No deployment or model loading was performed. |

## Documentation inspected

`README.md`, `backend/HIERARCHICAL_SYSTEM_GUIDE.md`, and WHO integration reports 12–14 were read. The historical hierarchy guide contains legacy implementation notes; route registration and tests were treated as authoritative.

## Result

No feature was invented. Existing workflow surfaces and their limits are recorded in the remaining reports.
