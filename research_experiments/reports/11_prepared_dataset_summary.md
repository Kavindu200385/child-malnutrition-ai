# Prepared Dataset Summary

| Partition | Rows | SHA-256 |
| --- | --- | --- |
| train | 13376 | 564dfbc8008fc3bd8cd9c351ce30768613e0107e859f4bb4eaca6dcbf1cb3d08 |
| validation | 3040 | a58f3bcfe4a36f3368bbe5b2ed8fa3a4d322232eef6371381d526afe0e90f83f |
| test | 2784 | 6c4f3ad9eeb534250b9fa0ea98958029146423781939aa9629c6d01333458233 |

All 19200 original longitudinal rows were retained. Flagged rows: 1276 (age-band/filename mismatch only under the corrected source-specific range). No balancing, imputation, feature fitting, target generation, or source-file modification occurred. Provenance and target-generation uncertainty are retained in `manifests/step2d_prepared_dataset_metadata.json`. The prepared files are ready only for the configured simulation-label training experiment.
