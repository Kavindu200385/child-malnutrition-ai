# CMRAS Dataset Organisation

`datasets/` contains research inputs and metadata only. No file in this directory is claimed to be authentic clinical data unless its provenance manifest says so.

| Location | Contents | Status |
| --- | --- | --- |
| `processed/unverified_static/` | Historical adjusted age-band CSVs | Unverified derived/static data; not an independent cohort. |
| `simulated/longitudinal/` | Two 9,600-row longitudinal input CSVs | Simulation-only, unverified labels and provenance. |
| `simulated/prepared/` | Frozen Step 2D train, validation, and test partitions | Simulation-only derived data; 13,376 / 3,040 / 2,784 rows. |
| `splits/` | Original frozen child-level membership files | Immutable memberships retained byte-for-byte. |
| `manifests/` | Checksums, provenance, integrity, and readiness records | Source of truth for research dataset metadata. |

The `dataset_path` values embedded in frozen membership CSVs deliberately retain their original historical paths so their bytes and SHA-256 values remain unchanged. Current configuration maps the membership files to the reorganised source locations.

The Google Colab ZIP under `research_experiments/colab/` is an immutable self-contained snapshot and likewise retains its embedded folder layout.
