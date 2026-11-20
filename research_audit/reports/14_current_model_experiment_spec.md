# 14 — Current Nutritional Status Experiment Specification

## Clinical reference method

The clinical output is deterministic WHO-based assessment from age, sex, weight, height, MUAC, and edema as applicable. It is not an ML prediction and must be evaluated separately from any ML benchmark.

## Outcomes

Use three independent outcomes, allowing co-occurrence:

1. **Wasting:** derived from clinician-approved WFH/WFL and MUAC/edema rules.
2. **Stunting:** derived from clinician-approved HFA rules.
3. **Underweight:** derived from clinician-approved WFA rules.

Do not train on `Final_Decision` or collapse these conditions into one class unless a clinician approves, documents, and signs a precedence rule. A composite status may be reported as a deterministic clinical summary, not as a silently relabelled target.

## Secondary ML benchmark

If used, Logistic Regression, Random Forest, and XGBoost may learn to reproduce the deterministic reference labels from permitted inputs. This is a **rule-mimic benchmark**, not a clinical diagnostic-performance study. Its endpoint is agreement with the reference rule, never patient-outcome accuracy.

### Inputs

- Raw inputs: age in months, sex, weight, height.
- Derived inputs: Z-scores calculated by a versioned, complete WHO reference implementation.
- MUAC and edema may be included only if present at baseline and clinically approved.
- Exclude post-assessment data, future visits, target columns, and fields derived from the target except where the benchmark is explicitly framed as rule mimicry.

## Data handling

- Freeze the manifest/hash before analysis.
- Validate units, age ranges, sex encoding, biologically implausible values, missingness, and exact/feature duplicate records.
- Retain an auditable exclusion table; never silently impute clinical values.
- If child IDs are stable, split by child. If not, state that independence cannot be established and restrict claims accordingly.
- Split before duplicate expansion, augmentation, or balancing. Apply balancing only to training folds.

## Evaluation

Use one locked hold-out set plus grouped cross-validation within training data. Report per outcome: prevalence, confusion matrix, sensitivity/recall, specificity, precision, F1, balanced accuracy, AUROC/PR-AUC where probabilities exist, calibration, and confidence intervals. Report results by sex and age band only when sample sizes and provenance permit.

## Clinical decisions still required

Age-validity boundaries; full WHO reference source; MUAC/edema policy; implausible-value exclusions; outcome thresholds; and any composite precedence rule require clinical review.
