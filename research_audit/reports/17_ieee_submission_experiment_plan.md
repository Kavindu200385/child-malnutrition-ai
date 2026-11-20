# 17 — IEEE Submission Experiment Plan

## Claims that may remain

- The system implements deterministic WHO-based nutritional assessment.
- Recovered code and available data demonstrate historical software experimentation.
- A synthetic experiment may evaluate agreement with simulated or rule-derived labels when labelled explicitly.

## Claims that require rerunning

- Any Logistic Regression, Random Forest, or XGBoost accuracy, F1, recall, or comparison claim.
- Any claim about model superiority, calibration, fairness, or generalization.
- Any claim that current data have a valid independent train/test split.

## Claims to remove or qualify

- Remove claims of real-world two-month prediction until observed longitudinal outcomes and temporal/external validation exist.
- Remove unsupported original-source, dataset-size, and class-balance claims.
- Do not present rule-mimic accuracy as diagnostic or clinical predictive accuracy.

## Minimum resubmission experiments

1. Reproducible deterministic WHO assessment validation against clinician-approved test cases.
2. If licensed/provenanced data are obtained, grouped current-status ML benchmark with a locked hold-out set and per-outcome metrics.
3. Only if observed future outcomes are obtained, grouped temporal future-risk evaluation at the defined 60-day window.
4. Complete reproducibility package: manifests, split IDs, configuration, code revision, metrics, predictions, and model cards.

## Realistic contribution

The defensible contribution is a traceable child-growth monitoring workflow with deterministic WHO assessment and a reproducible experimental framework. Any ML component must be framed as exploratory until externally validated.

## Unresolved decisions

Clinical approval is needed for nutritional thresholds, composite-status precedence, MUAC/edema policy, eligible ages, data governance, and the definition of a valid observed two-month outcome.
