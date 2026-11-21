# Dataset Migration Manifest

All moved CSV files were compared byte-for-byte with their `418e951` versions. No row, child ID, label, split assignment, or value was changed.

| Original path | New path | Rows | SHA-256 | Classification |
| --- | --- | ---: | --- | --- |
| `dataset/birth_to_2_years_adjusted.csv` | `datasets/processed/unverified_static/birth_to_2_years_adjusted.csv` | 1,975 | `b13d8b6f0232fa7a13e017588d5ebfe4b4230513c2738f27e10432a46cc87fbe` | unverified static |
| `dataset/age_2_to_5_years_adjusted.csv` | `datasets/processed/unverified_static/age_2_to_5_years_adjusted.csv` | 3,025 | `12b8f764d18b8527948a3c2d8c625477847f93f5feb5d62407eaff2dbf96c86c` | unverified static |
| `dataset/birth_to_2_years_longitudinal_improved.csv` | `datasets/simulated/longitudinal/birth_to_2_years_longitudinal_improved.csv` | 9,600 | `f6d21fde2f47ee876e82e4e805dcd87ac2ea674beee9c30879f2f2459dd19696` | simulation-only |
| `dataset/age_2_to_5_years_longitudinal_improved.csv` | `datasets/simulated/longitudinal/age_2_to_5_years_longitudinal_improved.csv` | 9,600 | `ec7421638c895248a30c62290dfc6a27438b24df724144621edcd2bdfacbf5d3` | simulation-only |
| `research_experiments/prepared_data/simulation_train.csv` | `datasets/simulated/prepared/simulation_train.csv` | 13,376 | `564dfbc8008fc3bd8cd9c351ce30768613e0107e859f4bb4eaca6dcbf1cb3d08` | frozen training partition |
| `research_experiments/prepared_data/simulation_validation.csv` | `datasets/simulated/prepared/simulation_validation.csv` | 3,040 | `a58f3bcfe4a36f3368bbe5b2ed8fa3a4d322232eef6371381d526afe0e90f83f` | frozen validation partition |
| `research_experiments/prepared_data/simulation_test.csv` | `datasets/simulated/prepared/simulation_test.csv` | 2,784 | `6c4f3ad9eeb534250b9fa0ea98958029146423781939aa9629c6d01333458233` | frozen test partition |
| `research_experiments/splits/07b8f37c9694_membership.csv` | `datasets/splits/07b8f37c9694_membership.csv` | 1,200 | `4aec6adff7708c534700b8cfd6c8594aa89cb8a579e9a15074435700e0650989` | frozen membership |
| `research_experiments/splits/5e6f73824d60_membership.csv` | `datasets/splits/5e6f73824d60_membership.csv` | 1,200 | `d300323b1e8032cd43179ed7e1c6936637dcc9ec36e295546b00b9763c6606ea` | frozen membership |

Prepared records total 19,200. The membership files intentionally retain their historical embedded `dataset/...` value so their frozen checksums continue to verify; current manifests and executable code use canonical paths.
