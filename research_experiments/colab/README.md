# CMRAS Colab Input Archive

`CMRAS_Colab_Input.zip` is the frozen input package for `CMRAS_Future_Risk_IEEE_Experiments.ipynb`.

Upload the ZIP when prompted by the notebook. It extracts into `/content/cmras_colab_input/` and locates the preserved `research_experiments/` directory automatically.

The archive contains the three Step 2D prepared partitions, the two frozen membership files, required manifests/configuration, and canonical Step 2E metrics/predictions used for comparison. It does not contain application code, production models, raw source datasets, or a virtual environment.

The notebook verifies hashes, counts, target classes, dataset-prefixed group IDs, and frozen split files before training. Expected prepared counts are 13,376 train, 3,040 validation, and 2,784 test records (19,200 total).

All included labels and results are simulation-only/unverified. They must not be described as clinical, external, temporal, or observed two-month prediction evidence.
