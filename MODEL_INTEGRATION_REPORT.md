# Model Integration Report

Date: 2026-05-31

## Summary

Integrated the retrained models from `New models/` into the backend inference system.
The previous active model artifacts were moved to `models_backup/`; no files were deleted.

## Files Changed

- `backend/ai/model_loader.py`
- `backend/ai/__init__.py`
- `backend/ai/predictor.py`
- `backend/routes/analysis_jwt.py`
- `backend/routes/midwife.py`
- `backend/routes/moh.py`
- `backend/routes/nutritionist.py`
- `backend/maintenance.py`
- `MODEL_INTEGRATION_REPORT.md`
- `backend/ai/train_models.py` moved to `models_backup/deprecated_ml_files/train_models.py`

## Backup Files Created

Moved old active model artifacts to `models_backup/backend_models_old/`:

- `current_birth_2.joblib`
- `current_2_5.joblib`
- `label_encoder_birth_to_2.joblib`
- `label_encoder_age_2_to_5.joblib`
- `prediction_model.joblib`
- `prediction_features.joblib`

Moved deprecated old training utility to:

- `models_backup/deprecated_ml_files/train_models.py`

## New Model References Used

Active current risk model:

- `backend/models/current_model/current_risk_model.joblib`
- `backend/models/current_model/label_encoder.joblib`

Active future prediction model:

- `backend/models/prediction_model/future_prediction_model.joblib`
- `backend/models/prediction_model/future_prediction_label_encoder.joblib`
- `backend/models/prediction_model/current_status_encoder.joblib`

## Feature Verification

Current Risk Model expected features:

- `age_months`
- `Sex`
- `weight_kg`
- `height_cm`

This matches the requested training order.

Future Prediction Model expected features:

- `age_months`
- `Sex`
- `weight_kg`
- `height_cm`
- `prev_weight`
- `prev_height`
- `weight_change`
- `height_change`

The previous system generated a 17-feature future-risk input. The inference logic now uses the new 8-feature schema.

## Child History Integration

Database tables used:

- `children`: child date of birth, gender, birth weight, birth height
- `measurements`: clinic measurement history for previous weight and height
- `visits`: legacy visit history for `/api/analysis/analyze` and recompute compatibility

Future prediction features are generated server-side in this exact order:

- `age_months`
- `Sex`
- `weight_kg`
- `height_cm`
- `prev_weight`
- `prev_height`
- `weight_change`
- `height_change`

Fallback logic:

1. Use the most recent previous `measurements` row for the same child.
2. If no previous clinic measurement exists, use child birth weight and birth height.
3. If neither exists, skip future prediction and return/store no future risk with the warning: `Future prediction requires at least one previous measurement or birth baseline.`

No manual frontend fields were added.

## Old Model References Found

Retired active artifacts:

- split-age current models: `current_birth_2.joblib`, `current_2_5.joblib`
- old current encoders: `label_encoder_birth_to_2.joblib`, `label_encoder_age_2_to_5.joblib`
- old future model: `prediction_model.joblib`
- old future feature list: `prediction_features.joblib`

These were removed from active `backend/models/` and preserved in `models_backup/backend_models_old/`.

## Compatibility Issues

- The new artifacts were trained/pickled with scikit-learn 1.6.1, while this environment loads them with scikit-learn 1.8.0. Loading and prediction work, but scikit-learn reports `InconsistentVersionWarning`.
- The future model requires prior weight/height and change features. These are now derived from database history. If no previous measurement or birth baseline exists, future prediction is intentionally skipped instead of using fake zero-change data.

## Prediction Flow

Before:

1. Frontend submitted child id, weight, height, optional MUAC.
2. Backend calculated current risk.
3. Future prediction used only current visit data or synthetic no-change fallback.

After:

1. Frontend submits the same payload; UI is unchanged.
2. Backend retrieves child DOB and gender from `children`.
3. Backend retrieves the latest previous baseline from `measurements`, or birth values from `children`.
4. Backend calculates `weight_change` and `height_change`.
5. Backend builds the future model vector in the retrained model's feature order.
6. If no baseline exists, backend records no future prediction and returns a warning.

## Verification

Passed:

- `python -m compileall backend`
- direct current-risk prediction
- direct future-risk prediction
- child-history future payload with birth fallback
- child-history missing-baseline warning
- `python -m pytest backend/tests` with 12 tests passing
- Flask app import via `create_app()`
