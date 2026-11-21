# 15 — Future-Risk Experiment Specification

## Evidence status

No recovered evidence proves that the available future-risk labels are observed two-month outcomes. Therefore no experiment using them may claim clinical prediction validation. Current work is **simulation-only**.

## Required observed-outcome protocol

For a future clinical study:

1. Define baseline as a completed measurement at time *t*.
2. Define the outcome as the assessment at the measurement nearest *t + 60 days* within a predeclared acceptable window.
3. Require the outcome visit to occur after baseline; choose one outcome per baseline deterministically.
4. Exclude baseline records without an eligible observed outcome; report exclusions.
5. Use only information available on or before *t*: demographics, baseline anthropometry, and earlier dated measurements.
6. Include elapsed time between measurements as a feature only when measured at baseline; never infer a fixed horizon from an arbitrary birth baseline.

## Inputs and targets

Permitted history includes dated prior weight/height and clinically defined baseline status. Derived changes must be computed using only the selected prior pre-baseline visit. The target should be clinician-approved future wasting, stunting, underweight, or a separately approved composite outcome.

## Leakage controls

- Group all records from each child in a single partition.
- Keep time order within each child.
- Perform feature engineering, imputation, scaling, and balancing inside each training fold only.
- Hold out a temporal or external test cohort; do not select a model using that test cohort.
- Audit feature availability timestamps and retain baseline/outcome row IDs.

## Simulation-only protocol

The current longitudinal files may support a method demonstration only. Publish the complete generator/rules, seed, biological constraints, and label algorithm. Call results “performance against simulated labels,” not two-month clinical-prediction accuracy. Do not compare synthetic results with clinical prediction claims.

## Evaluation

For observed outcomes, use grouped and temporal validation, per-class recall/precision/F1, calibration, confusion matrices, and confidence intervals. For simulated outcomes, use the same metrics but label every table and abstract claim as simulation-only.
