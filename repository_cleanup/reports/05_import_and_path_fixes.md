# Import and Path Fixes

Updated dataset path consumers:

- `research_experiments/configs/step2d_simulation_preparation.json`
- `research_experiments/configs/step2d_simulation_training_draft.json`
- `research_experiments/scripts/prepare_step2d_simulation.py`
- `research_experiments/scripts/prepare_splits.py`
- `research_experiments/scripts/test_step2d_preparation.py`
- `research_experiments/scripts/train_step2e_future_risk.py`
- `research_experiments/scripts/validate_datasets.py`
- `research_experiments/scripts/audit_targets.py`
- `research_experiments/scripts/generate_training_readiness.py`
- `research_experiments/scripts/verify_step2f_publication.py`

The verifier contains a compatibility resolver for immutable historical output manifests that record pre-migration paths. It maps only those path strings at read time; it does not edit frozen output evidence. Production Flask, React behavior, MySQL schemas, and WHO calculation code were not changed.
