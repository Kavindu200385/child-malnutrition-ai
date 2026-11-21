#!/usr/bin/env python3
"""Validate registered research CSVs without changing their contents."""
from __future__ import annotations

import argparse
import collections
import json
from datetime import datetime
from pathlib import Path

from common import markdown_table, read_csv, runtime_metadata, safe_float, sha256, write_json


NUMERIC_ALIASES = {
    "age": ("age_months", "Age_months"),
    "weight": ("weight_kg", "Weight_kg"),
    "height": ("height_cm", "Height_cm", "Length_cm"),
}


def column(headers, aliases):
    return next((name for name in aliases if name in headers), None)


def validate(entry: dict, root: Path) -> dict:
    relative = entry["path"]
    path = root / relative
    result = {
        "path": relative,
        "exists": path.is_file(),
        "provenance_status": entry["provenance_status"],
        "source_class": entry["source_class"],
        "target_candidates": entry.get("target_candidates", []),
        "id_column": entry.get("id_column"),
        "date_column": entry.get("date_column"),
        "flags": [],
    }
    if not path.is_file():
        result["flags"].append("registered file is unavailable")
        return result
    rows, headers = read_csv(path)
    result.update({"sha256": sha256(path), "row_count": len(rows), "columns": headers})
    result["missing_by_column"] = {key: sum(not (row.get(key) or "").strip() for row in rows) for key in headers}
    result["duplicate_rows"] = len(rows) - len({tuple(row.get(key, "") for key in headers) for row in rows})

    numeric = {}
    for kind, aliases in NUMERIC_ALIASES.items():
        name = column(headers, aliases)
        if not name:
            continue
        parsed = [safe_float(row.get(name)) for row in rows]
        invalid = sum(value is None for value in parsed)
        values = [value for value in parsed if value is not None]
        numeric[kind] = {"column": name, "invalid_count": invalid, "min": min(values) if values else None, "max": max(values) if values else None}
    result["numeric_summary"] = numeric

    implausible = {"age": 0, "weight": 0, "height": 0}
    for row in rows:
        age = safe_float(row.get(numeric.get("age", {}).get("column", "")))
        weight = safe_float(row.get(numeric.get("weight", {}).get("column", "")))
        height = safe_float(row.get(numeric.get("height", {}).get("column", "")))
        implausible["age"] += int(age is not None and not 0 <= age <= 60)
        implausible["weight"] += int(weight is not None and not 0.5 <= weight <= 40)
        implausible["height"] += int(height is not None and not 40 <= height <= 130)
    result["implausible_measurement_flags"] = implausible
    result["unit_assumption"] = "Values are inspected as months, kilograms, and centimetres from column names; units are not independently verified."

    target = next((name for name in entry.get("target_candidates", []) if name in headers), None)
    result["target_column"] = target
    result["class_distribution"] = dict(collections.Counter(row.get(target, "") for row in rows)) if target else {}
    key_columns = [name for name in (numeric.get("age", {}).get("column"), "Sex", "Sex_enc", numeric.get("weight", {}).get("column"), numeric.get("height", {}).get("column")) if name]
    if target and key_columns:
        labels = collections.defaultdict(set)
        for row in rows:
            labels[tuple(row.get(name, "") for name in key_columns)].add(row.get(target, ""))
        result["conflicting_target_feature_combinations"] = sum(len(values) > 1 for values in labels.values())
    else:
        result["conflicting_target_feature_combinations"] = None

    id_column, date_column = entry.get("id_column"), entry.get("date_column")
    if id_column and id_column in headers:
        counts = collections.Counter(row.get(id_column, "") for row in rows)
        result["unique_group_count"] = len(counts)
        result["repeated_group_count"] = sum(count > 1 for count in counts.values())
    else:
        result["unique_group_count"] = None
        result["repeated_group_count"] = None
    chronology_errors = 0
    if id_column in headers and date_column in headers:
        grouped = collections.defaultdict(list)
        for row in rows:
            try:
                grouped[row[id_column]].append(datetime.fromisoformat(row[date_column]))
            except (TypeError, ValueError):
                chronology_errors += 1
        chronology_errors += sum(dates != sorted(dates) for dates in grouped.values())
    result["chronology_flags"] = chronology_errors
    if entry["provenance_status"].startswith("unverified"):
        result["flags"].append("unknown provenance: not eligible for independent clinical-evaluation claims")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--config", type=Path, default=Path("datasets/manifests/dataset_registry.json"))
    parser.add_argument("--manifest-root", type=Path, default=Path("datasets/manifests"))
    parser.add_argument("--report-root", type=Path, default=Path("research_experiments/reports"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    config = json.loads((root / args.config).read_text(encoding="utf-8"))
    datasets = [validate(entry, root) for entry in config["datasets"]]
    payload = {"runtime": runtime_metadata(root), "datasets": datasets}
    write_json(root / args.manifest_root / "dataset_validation.json", payload)
    rows = [[d["path"], d.get("row_count", "n/a"), d.get("target_column") or "none", d["provenance_status"], d["duplicate_rows"] if d["exists"] else "n/a", sum(d.get("implausible_measurement_flags", {}).values()), d.get("chronology_flags", "n/a"), "; ".join(d["flags"]) or "none"] for d in datasets]
    report = "# Dataset Validation Results\n\n" + markdown_table(["Dataset", "Rows", "Target", "Provenance", "Exact duplicates", "Plausibility flags", "Chronology flags", "Flags"], rows)
    report += "\n\nAll suspicious values are flags only; no input record was modified, removed, imputed, or relabelled. Units are inferred from column names and remain unverified.\n"
    target = root / args.report_root / "01_dataset_validation_results.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
