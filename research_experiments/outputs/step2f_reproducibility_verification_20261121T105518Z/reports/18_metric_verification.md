# Metric Verification

**Status: PASS.** Independently recalculated metrics from all available saved prediction files match saved metrics; maximum absolute difference: `0`. Current-risk persistence is **NOT VERIFIED** at raw-prediction level because its prediction file was not saved.

| Experiment | Partition | Rows | Status |
| --- | --- | --- | --- |
| test_no_current_risk__logistic_regression | test | 2784 | VERIFIED |
| validation_no_current_risk__dummy_majority | validation | 3040 | VERIFIED |
| validation_no_current_risk__logistic_regression | validation | 3040 | VERIFIED |
| validation_no_current_risk__random_forest | validation | 3040 | VERIFIED |
| validation_no_current_risk__xgboost | validation | 3040 | VERIFIED |
| validation_with_current_risk__dummy_majority | validation | 3040 | VERIFIED |
| validation_with_current_risk__logistic_regression | validation | 3040 | VERIFIED |
| validation_with_current_risk__random_forest | validation | 3040 | VERIFIED |
| validation_with_current_risk__xgboost | validation | 3040 | VERIFIED |
| validation_reference__current_risk_persistence | validation | n/a | NOT VERIFIED: raw prediction file unavailable |
