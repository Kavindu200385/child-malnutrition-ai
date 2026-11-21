# Isolated WHO validation evidence

This directory is intentionally separate from the running application. It contains unchanged downloaded WHO reference workbooks, a standard-library XLSX reader, reproducible validation output, and isolated tests.

Run from the repository root:

```sh
python3 research_experiments/who_validation/scripts/run_who_validation.py
python3 -m unittest discover -s research_experiments/who_validation/tests -v
```

The runner reads production code but does not write to it. It refreshes only `research_experiments/who_validation/reports/` and `results/`. Official download URLs and SHA-256 checksums are retained in `results/official_source_manifest.json`.
