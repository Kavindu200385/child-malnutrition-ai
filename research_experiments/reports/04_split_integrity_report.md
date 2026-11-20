# Split Integrity Report

| Dataset | Status | Group column | Groups | Reason |
| --- | --- | --- | --- | --- |
| dataset/birth_to_2_years_adjusted.csv | blocked | none | n/a | stable repeated-child IDs with timestamps are not established |
| dataset/age_2_to_5_years_adjusted.csv | blocked | none | n/a | stable repeated-child IDs with timestamps are not established |
| dataset/birth_to_2_years_longitudinal_improved.csv | created_simulation_only | child_id | 1200 | unverified provenance prevents independent clinical-evaluation claims |
| dataset/age_2_to_5_years_longitudinal_improved.csv | created_simulation_only | child_id | 1200 | unverified provenance prevents independent clinical-evaluation claims |
| research_audit/recovered/f23476e/Dataset/birth_to_2_cleaned.csv | blocked | Child_ID | n/a | stable repeated-child IDs with timestamps are not established |
| research_audit/recovered/f23476e/Dataset/age_2_to_5_cleaned.csv | blocked | Child_ID | n/a | stable repeated-child IDs with timestamps are not established |
| research_audit/recovered/f23476e/Data/children_records.csv | blocked | Child_ID | n/a | stable repeated-child IDs with timestamps are not established |

Membership files contain group IDs only and are for simulation-only preparation. No static or lineage-unverified dataset is presented as an independent clinical test set. Random grouped allocation is not temporal validation.
