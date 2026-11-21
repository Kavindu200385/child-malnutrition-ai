# Research Reproducibility Verification

## Environment and dependencies

The correct isolated research environment is `research_experiments/.venv`:

- Python `3.14.0`
- matplotlib `3.11.2`
- numpy `2.5.5`
- pandas `3.1.1`
- scikit-learn `1.9.1`
- joblib `1.6.0`
- xgboost `3.4.1`

No packages were installed during this verification because this existing isolated
environment already exactly matches the saved Step 2E environment metadata. The
locked dependency record is `research_experiments/requirements-step2f.txt`.

## Execution

Executed without retraining:

```sh
research_experiments/.venv/bin/python \
  research_experiments/scripts/verify_step2f_publication.py \
  --project-root . \
  --source-run step2e_20261120T154822Z \
  --run-id step2f_reproducibility_verification_20261121T110500Z
```

Result: **PASS**. Output was created separately at
`research_experiments/outputs/step2f_reproducibility_verification_20261121T110500Z/`.
The verifier was updated so its five generated reports are also contained in this
new output directory and do not overwrite shared historical reports.

## Integrity and result verification

| Check | Result |
| --- | --- |
| Prepared train data | 13,376 rows; SHA-256 matches |
| Prepared validation data | 3,040 rows; SHA-256 matches |
| Prepared test data | 2,784 rows; SHA-256 matches |
| Source longitudinal datasets | 2 of 2 SHA-256 matches |
| Frozen membership files | 2 of 2 SHA-256 matches |
| Model artifacts | 8 of 8 SHA-256 matches |
| Cross-partition child/source overlap | zero for all three partition pairs |
| Recalculated saved metrics | maximum absolute difference `0.0` |
| Saved confusion matrices | 9 of 9 match recalculated matrices and recalls |
| Selected frozen-test macro-F1 | unchanged: `0.8880257560016871` |

The generated publication package contains Tables 1–5, three PNG figures, metric
discrepancies, integrity metadata, recalculated metrics, and confusion-matrix
checks. Figures were generated from verified frozen saved predictions: 1500×1200,
2700×1200, and 1800×1200 pixels respectively. The persistence baseline remains
explicitly marked as not independently raw-prediction-verifiable because no raw
persistence prediction file exists.

## PR readiness

`git diff --check` passed. No pre-existing report was overwritten, no dataset or
artifact changed, and no temporary environment files were added to Git status.
The new Step 2F output, requirements file, and this report are intentional
untracked deliverables for review. The repository is ready for PR review, subject
to normal review of the already-present restructuring and backend fixes.
