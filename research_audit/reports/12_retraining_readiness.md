# 12 — Retraining Readiness

## Status by experiment

| Experiment | Reproducible? | Reason |
|---|---|---|
| Historical static current-risk trainer | Partially | Script and cleaned CSVs recovered, but its source provenance and exact environment/artifact lineage are missing |
| Historical future-risk comparison | Partially | Script recovered, but it references `*_prediction_with_current.csv` files that were not recovered |
| Synthetic retraining experiment | Partially | Generator recovered; it depends on historical predictor code and library versions, and its labels are rule-derived |
| Historical deployed artifacts | No | Binaries can be retrieved but no complete training run, metrics, source data, or artifact manifest verifies reproduction |
| Clinical two-month prediction | No | No observed follow-up outcomes, horizon protocol, or external/temporal validation evidence |

## Required corrections before any retraining

1. Obtain and freeze licensed raw sources with a dataset manifest and SHA-256 hashes.
2. Define clinician-reviewed outcomes and an explicit precedence/multi-label policy.
3. Rebuild preprocessing as versioned code; split by child before augmentation or balancing.
4. For future risk, define a fixed outcome window and require observed follow-up; do not use simulated labels as clinical ground truth.
5. Save split IDs, seeds, environment lockfile, feature schema, class mapping, metrics, calibration, and confusion matrices with each artifact.
6. Evaluate only on a held-out grouped temporal/external test set.

## Next correction

The next safe step is Step 2B design: establish data governance and a reproducible experiment specification. Do not restore historical inference into production or make clinical-performance claims from the recovered code.
