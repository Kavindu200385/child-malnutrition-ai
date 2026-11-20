# 01 — Project Structure Analysis

## Audit basis

- Historical ML baseline: Git commit `180897bb952655753acdb285be347bac05251029`.
- Current workspace: WHO-only runtime; historical ML files are deleted from the working tree.
- Dataset evidence: four untracked CSV files in `dataset/`.

## Relevant inventory

| Location | Status | Purpose |
|---|---|---|
| `dataset/*_adjusted.csv` | available | Static labelled records for 0–2 and 2–5 years |
| `dataset/*_longitudinal_improved.csv` | available | 1,200 children × 8 visits per age band |
| `dataset/*.pdf` | available | Dataset reports; no extractable text was available in this audit environment |
| historical `backend/ai/predictor.py` | available through Git | Current-risk and future-risk inference |
| historical `backend/ai/model_loader.py` | available through Git | Joblib artifact loading |
| historical `backend/models/` | unavailable | Trained artifacts were not present in the workspace |
| `backend/utils/who_growth.py` | active | Retained deterministic WHO Z-score calculation |

## Historical deployed pipeline

The historical Flask routes imported `backend.ai.predictor`. The current model accepted `age_months, Sex, weight_kg, height_cm`; the future model accepted those fields plus prior size and deltas. The loader required joblib artifacts in `backend/models/current_model/` and `backend/models/prediction_model/`.

Historical sources: `backend/ai/model_loader.py:1-32`; `backend/ai/predictor.py:189-696`; `backend/routes/analysis_jwt.py:10-245`.

## Missing evidence

No training scripts, raw-source datasets, notebooks, saved metrics, split definitions, model artifacts, or complete experiment configuration were available. Therefore training claims cannot be reproduced from this workspace.
