# WHO Assessment Workflow Results

## Automated evidence

```text
.venv-who-test/bin/python -m pytest -q research_experiments/who_validation/tests backend/tests/unit/test_who_growth.py
```

Result: **10 passed, 0 failed, 0 skipped**.

The complete integrated command in report 02 also passed WHO unit, payload-validation, screening-status and workflow tests.

## Verified behavior

- WAZ, HAZ and WFL/WHZ route calculations use validated date, sex, method, weight and height inputs.
- Unsupported sex, missing method, invalid measurement values, out-of-range ages and unsupported reference keys fail rather than emitting plausible-looking scores.
- Underweight, stunting and wasting remain separate screening indicators.
- Historical rows without retained score provenance are not silently recalculated.
- The frontend now prevents missing date/method submission for the active measurement workflow.

## Terminology boundary

This evidence verifies software behavior and official-reference regression cases. It does not establish clinical diagnosis, clinical validation, or a basis for automatically labelling screening output as MAM/SAM.
