# CMRAS Future-Risk IEEE Experiments in Google Colab

This guide runs `CMRAS_Future_Risk_IEEE_Experiments.ipynb` using the frozen, simulation-only Step 2D partitions. It does not support clinical prediction claims.

## Create the input ZIP

From the repository root, create an archive that preserves paths beginning with `research_experiments/`:

```bash
zip -r CMRAS_Colab_Input.zip \
  datasets/simulated/prepared \
  datasets/manifests/step2d_prepared_dataset_metadata.json \
  datasets/manifests/split_integrity.json \
  datasets/splits \
  research_experiments/configs/step2d_simulation_training_draft.json \
  research_experiments/outputs/step2e_20261120T154822Z/experiment_config.json \
  research_experiments/outputs/step2e_20261120T154822Z/validation_metrics.json \
  research_experiments/outputs/step2e_20261120T154822Z/test_metrics.json \
  research_experiments/outputs/step2e_20261120T154822Z/model_comparison.csv \
  research_experiments/outputs/step2e_20261120T154822Z/predictions
```

The expected prepared-file hashes are train `564dfbc8008fc3bd8cd9c351ce30768613e0107e859f4bb4eaca6dcbf1cb3d08`, validation `a58f3bcfe4a36f3368bbe5b2ed8fa3a4d322232eef6371381d526afe0e90f83f`, and test `6c4f3ad9eeb534250b9fa0ea98958029146423781939aa9629c6d01333458233`.

## Run in Colab

1. Upload the `.ipynb` file to [Google Colab](https://colab.research.google.com/).
2. Choose **Runtime → Run all**.
3. When prompted, upload `CMRAS_Colab_Input.zip`.
4. The notebook verifies hashes, partition isolation, class schema, frozen configuration, and prohibited features before fitting any model.
5. Download the generated ZIP from the final cell. It contains models, metrics, figures, tables, environment metadata, and an IEEE summary.

The notebook evaluates the test set only after validation-based model selection. If canonical Step 2E evidence is included, it reports exact metric differences. A missing canonical persistence-prediction file is reported as unavailable rather than reconstructed or invented.

## Scientific restrictions

Every output is labelled as classification against simulated or unverified labels. Do not describe results as clinical, external, temporal, real-world, or observed two-month prediction validation. The source data have unverified provenance, no recovered exact generator lineage, no observed follow-up outcomes, and no clinician-approved future-risk outcome definition.
