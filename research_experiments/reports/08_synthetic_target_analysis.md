# Synthetic Target Analysis

No recovered generator can be linked to these exact CSVs. The recovered historical generator uses different feature names and transition probabilities; it is evidence of synthetic methodology, not dataset lineage. Neither CSV demonstrates observed two-month outcomes: recorded visits occur every 30 or 90 days.

## datasets/simulated/longitudinal/birth_to_2_years_longitudinal_improved.csv

Target distribution: `{'Low': 3744, 'Moderate': 2465, 'Severe': 1303, 'High': 2088}`. Current-risk distribution: `{'Moderate': 2351, 'Low': 4163, 'Severe': 1011, 'High': 2075}`. The target matches the following visit's current risk in 7278/8400 (86.6%) comparable pairs; this is not enough to establish label generation or a prediction horizon.

| Current risk | Target risk | Rows |
| --- | --- | --- |
| High | High | 1716 |
| High | Moderate | 46 |
| High | Severe | 313 |
| Low | Low | 3690 |
| Low | Moderate | 473 |
| Moderate | High | 351 |
| Moderate | Low | 54 |
| Moderate | Moderate | 1946 |
| Severe | High | 21 |
| Severe | Severe | 990 |

Mean recorded Z-score by target (descriptive only; Z-score definition is unverified):

| Target risk | Mean z_score | Rows |
| --- | --- | --- |
| High | -2.321 | 2088 |
| Low | -0.175 | 3744 |
| Moderate | -1.329 | 2465 |
| Severe | -3.379 | 1303 |

## datasets/simulated/longitudinal/age_2_to_5_years_longitudinal_improved.csv

Target distribution: `{'Low': 3451, 'Moderate': 2552, 'High': 2228, 'Severe': 1369}`. Current-risk distribution: `{'Low': 3847, 'Moderate': 2559, 'High': 2135, 'Severe': 1059}`. The target matches the following visit's current risk in 7224/8400 (86.0%) comparable pairs; this is not enough to establish label generation or a prediction horizon.

| Current risk | Target risk | Rows |
| --- | --- | --- |
| High | High | 1761 |
| High | Moderate | 45 |
| High | Severe | 329 |
| Low | Low | 3399 |
| Low | Moderate | 448 |
| Moderate | High | 448 |
| Moderate | Low | 52 |
| Moderate | Moderate | 2059 |
| Severe | High | 19 |
| Severe | Severe | 1040 |

Mean recorded Z-score by target (descriptive only; Z-score definition is unverified):

| Target risk | Mean z_score | Rows |
| --- | --- | --- |
| High | -2.301 | 2228 |
| Low | -0.197 | 3451 |
| Moderate | -1.355 | 2552 |
| Severe | -3.397 | 1369 |
