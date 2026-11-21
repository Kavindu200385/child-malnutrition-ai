# 06 — Training and Evaluation Audit

## Available evidence

Historical inference code loads pre-trained joblib artifacts and reads feature names from them. It does not expose train/test splits, cross-validation, seed, hyperparameters, balancing, confusion matrices, classification reports, or saved metrics.

The runtime comparison Logistic Regression has `random_state=42`, `lbfgs`, `max_iter=500`, and `C=1.0`, but is trained on synthetic threshold-generated samples. That is not evidence of fair evaluation against historical Random Forest/XGBoost artifacts.

## Result consistency

The historical integration report records model version compatibility warnings and states direct inference passed, but does not provide reproducible evaluation outputs. Reported accuracy values cannot be tied to an available dataset hash, split, class mapping, artifact hash, or metric file.

## Reproducibility status

**Not reproducible.** Required artifacts are absent: model binaries, source training code, preprocessing/label-encoder provenance, experiment configuration, split assignments, and metrics.
