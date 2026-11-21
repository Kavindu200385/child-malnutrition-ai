# 07 — IEEE Reviewer Risk Assessment

## Rejection-risk issues

1. **Critical:** Claiming real-world future prediction without observed two-month outcomes and an independent temporal/grouped validation set.
2. **Critical:** Reporting accuracy without a reproducible dataset, split protocol, model artifact, and metric record.
3. **Critical:** Presenting rule-generated/synthetic labels as empirical ML performance.
4. **High:** Unclear class mapping and forced exclusive target labels for overlapping malnutrition conditions.
5. **High:** Dataset ranges that require clinical/provenance explanation.
6. **High:** No documented protection against child-level leakage in longitudinal records.

## Mandatory paper corrections

- Separate deterministic WHO status assessment, synthetic classification experiments, and validated prospective prediction.
- Withdraw unsupported accuracy and comparative-model claims.
- Add a provenance table, dataset hashes, label specification, grouped split protocol, and complete metric/confusion-matrix reporting.
- State missing evidence honestly; do not call synthetic results clinical validation.
