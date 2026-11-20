# 10 — Recovered ML Files

## Recovery result

Six historical files were recovered into `research_audit/recovered/` and byte-verified against their original Git objects. The complete mapping, SHA-256 checksums, and intentionally un-copied binary artifacts are in `research_audit/recovered/RECOVERY_MANIFEST.md`.

## Recovered source code

| Original Git spec | What it contains | Finding |
|---|---|---|
| `f23476e:backend/ai/model_training.py` | Static current-risk Random Forest training | 80/20 stratified row split, five-fold CV on training rows, 250 trees, balanced class weight |
| `f23476e:backend/ai/train_compare_prediction_models.py` | Future-risk comparison | Logistic Regression, Random Forest, SVM, XGBoost; child-ID split in this version |
| `c27861e:backend/ai/train_models.py` | Synthetic current/future data generation and retraining | Rule-derived synthetic labels and in-sample current-model evaluation |

The synthetic generator is recoverable. It creates sampled anthropometric values, computes Z-scores, rejects samples until they satisfy deterministic class rules, then trains models on those labels. This confirms synthetic/rule-derived experimentation; it does not recover clinical validation evidence.

## Recovered datasets

The historical cleaned CSVs and `children_records.csv` are recoverable from commit `f23476e`. They are derived project files, not proof of original Ethiopian or other claimed raw-source provenance.

## Artifacts

Historical joblib binaries remain recoverable from Git, including a 167 MB current-risk artifact and a 4.44 MB future-risk artifact in dangling commit `a050076`. They were deliberately not copied under the selected source-plus-manifest scope.

## Missing

No recoverable raw-source acquisition files, data merge/cleaning scripts, complete evaluation outputs, experiment manifests, split assignments, or independently saved metrics were found.
