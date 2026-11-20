# 08 — Step 2 Code Correction Plan

## Critical sequence

1. Preserve immutable raw data and create a dataset manifest with source, license, collection date, row ID, and SHA-256.
2. Recreate training code as a versioned pipeline; do not use historical inference code as training evidence.
3. Define a clinician-reviewed multi-label or explicitly precedence-based outcome specification.
4. Split by child before augmentation/oversampling; reserve a temporal or external test set.
5. Fit imputation, scaling, encoding, and balancing only within training folds.
6. Create a true two-month target from observed follow-up at a specified window; exclude records without a valid outcome.
7. Save model, encoder, feature schema, dataset hash, split IDs, seed, metrics, and confusion matrix together.
8. Reintroduce deployment inference only after validation and clinical governance review.

## Historical files implicated

- `backend/ai/predictor.py`: separate deterministic WHO logic from trained inference; remove synthetic runtime comparator.
- `backend/ai/model_loader.py`: require versioned artifact manifest and compatibility checks.
- `backend/routes/analysis_jwt.py`: expose only validated model outputs and provenance.

## Optional improvements

Calibration, uncertainty intervals, subgroup fairness analysis, decision-curve analysis, and prospective silent deployment monitoring.
