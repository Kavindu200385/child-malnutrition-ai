# Frontend–Backend Contract Audit

## Method

Static comparison of `frontend/src/services/api.js`, measurement forms, `backend/routes/midwife.py`, `backend/routes/moh.py`, `backend/routes/nutritionist.py`, and backend validation tests. Focused frontend contract utilities were then executed by Vitest.

## Confirmed measurement contract

All three active measurement API clients send `child_id`, `weight_kg`, `height_cm`, `measurement_date`, and `measurement_method`. Flask requires date/method and rejects invalid sex, age, units, values, and unsupported WHO reference inputs.

| Field | React form | Flask contract | Result |
| --- | --- | --- | --- |
| `child_id` | required/selected | required | aligned |
| `weight_kg`, `height_cm` | numeric values in kg/cm | required and validated | aligned |
| `measurement_date` | submitted by forms | required | corrected: client validation now rejects an empty/invalid date |
| `measurement_method` | recumbent length or standing height | required enum | aligned |
| Screening indicators | response data includes separate fields | stored and returned separately | utility display verification added |

## Modification made

`frontend/src/utils/measurementValidation.ts` now validates measurement date. `AddMeasurementView.tsx` passes date into that validation. `NutritionistAddMeasurementView.tsx` now requires and validates date before posting. This restores the existing workflow contract without weakening Flask validation.

## Identified non-executed/legacy contracts

- `childrenAPI.getHistory()` points to a legacy `/api/children/history/<id>` path, while the active hierarchical endpoint is `/api/children/<child_id>/visits`. No current React call-site was found, so it was not changed.
- Older React views still contain MAM/SAM wording and future-risk narrative that cannot be treated as a clinical diagnosis or clinically validated forecast. This is recorded as a release/documentation limitation, not silently reclassified.
- No live backend server or production API was contacted.
