# 02 — Dataset Quality Audit

## Verified inventory

| File | Rows | Key finding |
|---|---:|---|
| `birth_to_2_years_adjusted.csv` | 1,975 | Static labelled data; 1–24 months |
| `age_2_to_5_years_adjusted.csv` | 3,025 | Static labelled data; 24–60 months |
| `birth_to_2_years_longitudinal_improved.csv` | 9,600 | 1,200 child IDs, exactly 8 visits each |
| `age_2_to_5_years_longitudinal_improved.csv` | 9,600 | 1,200 child IDs, exactly 8 visits each |

All four CSVs have no blank cells, no exact duplicate rows, and no duplicate static feature tuple with conflicting `Final_Decision`. This does not establish that records are independent, clinically valid, or sourced from real children.

## Static-label distributions

- Birth–2: Normal 721, MAM 667, SAM 327; remaining labels include Mild/Moderate/Severe Underweight and Severe Stunting.
- Age 2–5: MAM 1,128, SAM 1,081, Normal 470; remaining labels include underweight and stunting variants.

The target has more than the five classes stated for the current-risk model and uses non-uniform names such as `Severe Stunting` and `Mild Underweight`. A documented mapping is absent.

## Verified plausibility concerns

- Birth–2 weight: 3.0–4.395 kg despite ages up to 23.98 months.
- Age 2–5 weight: 3.0–10.727 kg despite ages up to 59.99 months.
- Age 2–5 WFH Z: -6.380 to 1.519; birth–2 WFH Z: -5.453 to 1.319.
- `nutrition_status` does not use the same label space as `Final_Decision`.

These patterns require provenance and clinical validation before use as empirical data.

## Not assessable

Raw Ethiopian/other claimed sources, merge rules, cleaning rules, `Sex=-1` handling, oversampling method, and split order are not available in the current evidence.
