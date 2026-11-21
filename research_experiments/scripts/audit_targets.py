#!/usr/bin/env python3
"""Audit target/status columns without changing labels."""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

from common import markdown_table, read_csv, runtime_metadata, write_json

TARGET_NAMES = {"Final_Decision", "Target", "predicted_risk_next_2_months", "Wasting", "Stunting", "Underweight", "nutrition_status", "current_risk", "Risk_Level", "Model_Prediction"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--config", type=Path, default=Path("datasets/manifests/dataset_registry.json"))
    parser.add_argument("--manifest-root", type=Path, default=Path("datasets/manifests"))
    parser.add_argument("--report-root", type=Path, default=Path("research_experiments/reports"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    registry = json.loads((root / args.config).read_text(encoding="utf-8"))["datasets"]
    audit = []
    rows_for_report = []
    for entry in registry:
        path = root / entry["path"]
        if not path.is_file():
            continue
        rows, headers = read_csv(path)
        present = sorted(TARGET_NAMES.intersection(headers))
        distributions = {name: dict(collections.Counter(row.get(name, "") for row in rows)) for name in present}
        overlap = None
        if {"Wasting", "Stunting", "Underweight"}.issubset(headers):
            overlap = collections.Counter(tuple(row[name] for name in ("Wasting", "Stunting", "Underweight")) for row in rows)
        documented_mapping = False
        rule_derived_indicator = bool({"WFA_Z", "HFA_Z", "WFH_Z"}.intersection(headers) and ({"Final_Decision", "Target"}.intersection(headers)))
        findings = []
        if overlap:
            findings.append("overlapping nutritional-condition columns present")
        if rule_derived_indicator:
            findings.append("Z-score and target columns coexist; label derivation requires verification")
        if entry["provenance_status"].startswith("unverified"):
            findings.append("target provenance is unverified")
        overlap_patterns = ({" | ".join(key): value for key, value in overlap.items()} if overlap else None)
        audit.append({"path": entry["path"], "target_columns": present, "class_distributions": distributions, "condition_overlap_patterns": overlap_patterns, "documented_mapping_found": documented_mapping, "rule_derived_indicator": rule_derived_indicator, "findings": findings})
        class_summary = "; ".join(f"{name}: {', '.join(distributions[name])}" for name in present)
        rows_for_report.append([entry["path"], ", ".join(present) or "none", class_summary or "none", "yes" if overlap else "no", "possible" if rule_derived_indicator else "not established", "; ".join(findings) or "none"])
    payload = {"runtime": runtime_metadata(root), "datasets": audit, "policy": "No target labels were changed or treated as clinical ground truth."}
    write_json(root / args.manifest_root / "target_label_audit.json", payload)
    report = "# Target Label Audit\n\n" + markdown_table(["Dataset", "Target/status columns", "Observed classes", "Condition overlap", "Rule-derived indicator", "Findings"], rows_for_report)
    report += "\n\nNo documented label mapping was recovered. Co-occurrence and rule-derived indicators are audit findings, not proof of a clinical label definition.\n"
    out = root / args.report_root / "03_target_label_audit.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
