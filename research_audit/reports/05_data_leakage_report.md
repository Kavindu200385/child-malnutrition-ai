# 05 — Data Leakage Report

## Confirmed

| Severity | Finding | Evidence |
|---|---|---|
| High | Runtime Logistic Regression labels are generated from the same Z-score threshold logic used to create its synthetic feature classes. | historical `predictor.py:22-101` |
| High | Longitudinal data contain repeated child IDs (eight rows per child); no group split evidence exists. | available CSV audit |
| High | Future model evaluation configuration is absent, so independence of train/test children cannot be verified. | training code and artifacts unavailable |

## Potential

| Severity | Finding | Required confirmation |
|---|---|---|
| High | Future target may be deterministic simulation/rule output rather than observed outcome. | generation code and label specification |
| High | Balancing may have occurred before splitting, allowing duplicated/related examples across boundaries. | preprocessing/training script |
| Medium | Current model target may be derived from fields clinically equivalent to its feature-derived Z-scores. | exact label-generation mapping |
| Medium | Temporal horizon may vary because baseline date is not a model input. | generation and evaluation protocol |

## Required remedies

Split by child ID before any balancing; fit preprocessing only on training folds; keep an untouched external/temporal test set; retain source-to-derived-row provenance; and prohibit accuracy claims until observed-outcome validation exists.
