# 16 — Reproducibility Plan

## Versioned experiment layout

```text
research_experiments/
  manifests/        # dataset hashes, source/provenance, schema
  splits/           # child IDs and train/validation/test assignments
  configs/          # immutable JSON/YAML run configurations
  outputs/<run-id>/ # metrics, predictions, figures, confusion matrices
  artifacts/<run-id>/ # fitted model, encoders, preprocessing, model card
```

Keep this isolated from production application directories.

## Required immutable run record

Each run must record:

- dataset paths, SHA-256 hashes, schema, inclusion/exclusion counts;
- source/provenance status and target-definition version;
- split-ID file hashes, grouping key, temporal cut-off, and seeds;
- Python version, OS, package lockfile, and Git revision;
- feature schema, units, transformations, missing-data policy, class mapping;
- balancing method and proof that it ran inside training partitions;
- model family, full hyperparameters, fitted preprocessing/encoders, and artifact SHA-256;
- train/CV/hold-out metrics, per-class reports, confusion matrices, calibration, predictions, and confidence intervals.

## Run policy

Use an immutable run ID. Never overwrite an artifact or metric file. A rerun creates a new run ID linked to its parent configuration. Lock the final test set before model selection, and release it only once for final reporting.

## Minimum verification

An independent environment must reproduce the dataset manifest, split assignments, feature count/order, artifact hash, and reported metrics from the stored prediction file. Failure at any stage invalidates the result until corrected and rerun.
