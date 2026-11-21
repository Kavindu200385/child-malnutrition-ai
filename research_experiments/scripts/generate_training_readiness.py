#!/usr/bin/env python3
"""Summarize training readiness from isolated audit manifests."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from common import markdown_table, runtime_metadata, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest-root", type=Path, default=Path("datasets/manifests"))
    parser.add_argument("--report-root", type=Path, default=Path("research_experiments/reports"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    validation = json.loads((root / args.manifest_root / "dataset_validation.json").read_text())
    splits = json.loads((root / args.manifest_root / "split_integrity.json").read_text())
    split_by_path = {item["path"]: item for item in splits["datasets"]}
    readiness = []
    for dataset in validation["datasets"]:
        split = split_by_path.get(dataset["path"], {})
        longitudinal = dataset.get("date_column") and dataset.get("repeated_group_count", 0)
        level = "simulation_only_ready" if split.get("status") == "created_simulation_only" else "blocked"
        reason = split.get("reason") or "no defensible grouped split"
        readiness.append({"path": dataset["path"], "status": level, "reason": reason, "rule_agreement_benchmark": "blocked_pending_clinician_target_definition", "independent_clinical_evaluation": "blocked_missing_provenance_and_observed_outcomes"})
    payload = {"runtime": runtime_metadata(root), "datasets": readiness, "who_reference_status": "incomplete_without_independently_sourced_official_cases"}
    write_json(root / args.manifest_root / "training_readiness.json", payload)
    rows = [[item["path"], item["status"], item["rule_agreement_benchmark"], item["independent_clinical_evaluation"], item["reason"]] for item in readiness]
    report = "# Training Readiness\n\n" + markdown_table(["Dataset", "Simulation-only", "Rule-agreement", "Clinical evaluation", "Reason"], rows)
    report += "\n\nWHO structural checks are not external WHO-reference validation. Future-risk clinical prediction is blocked: observed two-month outcomes are unavailable.\n"
    out = root / args.report_root / "05_training_readiness.md"; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
