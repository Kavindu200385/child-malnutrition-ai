# Split Verification

| Dataset | Source hash matches | Membership SHA-256 | Groups | Rows by partition | Missing groups | Extra groups | Duplicate membership rows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| datasets/simulated/longitudinal/birth_to_2_years_longitudinal_improved.csv | True | 4aec6adff7708c534700b8cfd6c8594aa89cb8a579e9a15074435700e0650989 | 1200 | {'train': 6688, 'test': 1392, 'validation': 1520} | 0 | 0 | 0 |
| datasets/simulated/longitudinal/age_2_to_5_years_longitudinal_improved.csv | True | d300323b1e8032cd43179ed7e1c6936637dcc9ec36e295546b00b9763c6606ea | 1200 | {'train': 6688, 'test': 1392, 'validation': 1520} | 0 | 0 | 0 |

Each source has 1,200 assigned child IDs with no cross-partition membership. Raw child IDs collide completely between the two source files, so prepared records use dataset-prefixed group IDs. The frozen memberships were reused; no balancing, augmentation, or split regeneration occurred. These are random grouped simulation splits, not temporal or external clinical validation. Training can use these frozen splits safely only for the stated simulation purpose.
