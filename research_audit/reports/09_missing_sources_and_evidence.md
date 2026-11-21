# 09 — Missing Sources and Evidence

## Missing datasets and provenance

- Original Ethiopian Children Dataset and any other claimed raw sources.
- Merge, cleaning, filtering, and balancing logs.
- Record-level source IDs and licenses/ethics approvals.
- Explanation of the reported 109,098 pre-balance and 50,000 post-balance counts.

## Missing ML evidence

- Current-risk and future-risk training scripts.
- Synthetic longitudinal generation script and biological constraints.
- Saved joblib models and fitted preprocessing/encoder artifacts.
- Class mapping and `Final_Decision` precedence specification.
- Train/validation/test or CV split assignments, group IDs, random seeds, and hyperparameters.
- Classification reports, confusion matrices, calibration results, and artifact/dataset hashes.

## Missing clinical prediction evidence

- Observed follow-up outcomes at a defined two-month window.
- Proof that targets were unavailable at prediction time.
- External, temporal, or prospective validation.

Until these items are supplied, the audit supports only software/inference inspection and CSV descriptive analysis—not validation of scientific performance claims.
