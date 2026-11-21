# 11 — Dataset Provenance

## Traceable to Git

| Dataset | Provenance | Status |
|---|---|---|
| Historical `Dataset/birth_to_2_cleaned.csv` | `f23476e` | Recoverable derived training CSV |
| Historical `Dataset/age_2_to_5_cleaned.csv` | `f23476e` | Recoverable derived training CSV |
| Historical `Data/children_records.csv` | `f23476e` | Recoverable application/demo record file |
| Current `dataset/*_adjusted.csv` | Working-tree untracked files | Available but no Git/source provenance |
| Current `dataset/*_longitudinal_improved.csv` | Working-tree untracked files | Available but no Git/source provenance |

## Source-traceability conclusion

The recovered historical CSVs are traceable only to repository commit `f23476e3142b81208030023810f57fa11bbbd1ad`. They cannot be traced from this repository to original clinical data, Ethiopian Children Dataset downloads, licenses, collection protocols, or patient/record identifiers.

The current dataset files are not tracked by Git. Their names and contents do not establish an external source, generation method, or relationship to the historical cleaned CSVs.

## Evidence not recovered

- Original raw datasets and source URLs/licenses
- Merge and cleaning scripts
- Sampling/balancing logs
- Dataset version hashes used by reported experiments
- A label-precedence specification for overlapping nutritional conditions

Therefore the datasets may be described as project-derived or synthetic/unknown-provenance data only; they must not be described as validated clinical cohorts.
