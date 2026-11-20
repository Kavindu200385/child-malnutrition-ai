# 13 — Dataset Manifest

## Scope and interpretation

This is a provenance and reproducibility manifest, not evidence that any record is clinical, independently collected, or suitable for clinical validation. “Unverified” means no source, license, collection protocol, and source-to-derived-row lineage were recoverable.

| File | SHA-256 | Rows | Candidate target | IDs/dates | Source class | Provenance/license |
|---|---|---:|---|---|---|---|
| `dataset/birth_to_2_years_adjusted.csv` | `b13d8b6f0232fa7a13e017588d5ebfe4b4230513c2738f27e10432a46cc87fbe` | 1,975 | `Final_Decision` | No child ID/date | Unverified | Untracked; no license/source recovered |
| `dataset/age_2_to_5_years_adjusted.csv` | `12b8f764d18b8527948a3c2d8c625477847f93f5feb5d62407eaff2dbf96c86c` | 3,025 | `Final_Decision` | No child ID/date | Unverified | Untracked; no license/source recovered |
| `dataset/birth_to_2_years_longitudinal_improved.csv` | `f6d21fde2f47ee876e82e4e805dcd87ac2ea674beee9c30879f2f2459dd19696` | 9,600 | `predicted_risk_next_2_months` | `child_id, visit_date` | Unverified | Untracked; no generation/source evidence |
| `dataset/age_2_to_5_years_longitudinal_improved.csv` | `ec7421638c895248a30c62290dfc6a27438b24df724144621edcd2bdfacbf5d3` | 9,600 | `predicted_risk_next_2_months` | `child_id, visit_date` | Unverified | Untracked; no generation/source evidence |
| `recovered/f23476e/Dataset/birth_to_2_cleaned.csv` | `a8bb130d9b1c8a942f6dcb6f023c3bf4dd173f7180b5ed5843c4bfe9de7c1547` | 9,998 | `Target` | `Child_ID`; no date | Unverified derived | Git commit `f23476e`; external source/license missing |
| `recovered/f23476e/Dataset/age_2_to_5_cleaned.csv` | `87d44657bde6fd015f0057c93ac47d66b308ea1678de47456ad0ed8138af8485` | 10,000 | `Target` | `Child_ID`; no date | Unverified derived | Git commit `f23476e`; external source/license missing |
| `recovered/f23476e/Data/children_records.csv` | `003ea8857eae43494678e9a4846d93d7e40789d3428c0d08993fac237dc84ee2` | 3 | `Final_Decision` | `Child_ID`; no date | Demo/application artifact | Git commit `f23476e`; not an experiment cohort |

## Schemas

- Adjusted static CSVs contain anthropometry, sex, three Z-scores, three overlapping condition columns, and `Final_Decision`.
- Longitudinal CSVs contain child ID, visit date/order, anthropometry, a Z-score trajectory, current risk, and a future-risk label.
- Recovered cleaned CSVs contain age, encoded sex, anthropometry, Z-scores, and an exclusive `Target`.

The available PDFs have hashes but no verified extractable provenance text in this environment:

- `dataset/dataset_generation_report.pdf`: `387c56c917672fb60933533f4ecc0c7c7ba891bc159ccf83880e2b7948a31413`
- `dataset/realistic_dataset_report.pdf`: `87982d12cb7219a4cfdab8c54612416ef2d07d512e00f37d608499b67c2e7451`

## Required before scientific use

Obtain original source, license, ethics/data-governance status, collection process, row lineage, and a clinician-approved outcome definition. Until then, use these data only as unverified/simulation or software-development evidence.
