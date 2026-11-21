# Longitudinal Integrity

| Dataset | Children | Visits/child | Intervals (days) | Age steps | Weight change range | Height change range | Nonpositive intervals | Previous-Z mismatches | Delta rounding differences | Delta substantive differences |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| datasets/simulated/longitudinal/birth_to_2_years_longitudinal_improved.csv | 1200 | {8: 1200} | {30: 8400} | {1: 8400} | [0.07000000000000028, 0.41999999999999993] | [0.25, 1.1000000000000085] | 0 | 0 | 8710 | 0 |
| datasets/simulated/longitudinal/age_2_to_5_years_longitudinal_improved.csv | 1200 | {8: 1200} | {90: 8400} | {3: 8400} | [0.0, 0.379999999999999] | [0.12000000000000455, 0.8300000000000125] | 0 | 0 | 8699 | 0 |

Dates and visits are internally ordered. The birth cohort has 30-day intervals and the older cohort has 90-day intervals. There are no previous-weight or previous-height columns; only current measurements are present. `previous_z_score` exists but has no source timestamp; it and `delta_z_score` are blocked from model features. This is structural integrity only, not evidence of genuine clinical observation or verified units. Training can proceed only under the restricted simulation feature schema.
