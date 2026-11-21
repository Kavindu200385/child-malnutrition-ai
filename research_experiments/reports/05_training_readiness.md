# Training Readiness

| Dataset | Simulation-only | Rule-agreement | Clinical evaluation | Reason |
| --- | --- | --- | --- | --- |
| datasets/processed/unverified_static/birth_to_2_years_adjusted.csv | blocked | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | stable repeated-child IDs with timestamps are not established |
| datasets/processed/unverified_static/age_2_to_5_years_adjusted.csv | blocked | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | stable repeated-child IDs with timestamps are not established |
| datasets/simulated/longitudinal/birth_to_2_years_longitudinal_improved.csv | simulation_only_ready | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | unverified provenance prevents independent clinical-evaluation claims |
| datasets/simulated/longitudinal/age_2_to_5_years_longitudinal_improved.csv | simulation_only_ready | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | unverified provenance prevents independent clinical-evaluation claims |
| research_audit/recovered/f23476e/Dataset/birth_to_2_cleaned.csv | blocked | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | stable repeated-child IDs with timestamps are not established |
| research_audit/recovered/f23476e/Dataset/age_2_to_5_cleaned.csv | blocked | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | stable repeated-child IDs with timestamps are not established |
| research_audit/recovered/f23476e/Data/children_records.csv | blocked | blocked_pending_clinician_target_definition | blocked_missing_provenance_and_observed_outcomes | stable repeated-child IDs with timestamps are not established |

WHO structural checks are not external WHO-reference validation. Future-risk clinical prediction is blocked: observed two-month outcomes are unavailable.
