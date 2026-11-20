# Plausibility Investigation

| Dataset | Rows | Flagged rows | Reasons | Recorded age range |
| --- | --- | --- | --- | --- |
| dataset/birth_to_2_years_longitudinal_improved.csv | 9600 | 0 | none | [0.0, 22.0] |
| dataset/age_2_to_5_years_longitudinal_improved.csv | 9600 | 1276 | exceeds_prior_generic_60_month_validator_limit: 1276 | [24.0, 72.0] |

## Flag counts by visit number

| Visit | Flagged rows |
| --- | --- |
| 5 | 126 |
| 6 | 247 |
| 7 | 381 |
| 8 | 522 |

## Flag counts by current risk

| Current risk | Flagged rows |
| --- | --- |
| High | 331 |
| Low | 401 |
| Moderate | 321 |
| Severe | 223 |

## Flag counts by target risk

| Target risk | Flagged rows |
| --- | --- |
| High | 312 |
| Low | 360 |
| Moderate | 316 |
| Severe | 288 |

## Flag counts by anonymized child

| Flagged rows per child | Children |
| --- | --- |
| 1 | 141 |
| 2 | 134 |
| 3 | 121 |
| 4 | 126 |

The prior 1,276 flags are entirely the former generic age >60 rule. The older file contains ages 24–72; no nonpositive/non-numeric weight or height flag was found. These are an age-band/filename and prior-validator-threshold mismatch, not proof of invalid records. All rows remain in the prepared simulation corpus. `manifests/step2d_flagged_record_index.csv` provides row-level, anonymized child tokens rather than raw child IDs. Units and biological plausibility remain unverified. Training can proceed only as a simulation-label exercise; this evidence cannot support clinical plausibility or age-band claims.
