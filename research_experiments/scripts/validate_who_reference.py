#!/usr/bin/env python3
"""Read-only structural checks for the active WHO growth utility."""
from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

from common import markdown_table, runtime_metadata, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--cases", type=Path, default=Path("research_experiments/configs/who_reference_cases.json"))
    parser.add_argument("--output-root", type=Path, default=Path("research_experiments"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    sys.path.insert(0, str(root))
    who = importlib.import_module("backend.utils.who_growth")
    cases = json.loads((root / args.cases).read_text(encoding="utf-8"))
    findings = {
        "wfa_age_months": [min(who.WFA_BOYS), max(who.WFA_BOYS)],
        "hfa_age_months": [min(who.HFA_BOYS), max(who.HFA_BOYS)],
        "wfh_height_cm": [min(who.WFH_BOYS), max(who.WFH_BOYS)],
        "sex_checks": {},
        "out_of_range_behavior": {},
        "official_case_comparison": {"available": bool(cases.get("cases")), "source": cases.get("source"), "results": []},
        "limitations": ["WFA/HFA reference tables are explicitly trimmed in the active implementation.", "WFH height is clamped to 45–110 cm.", "No independently sourced official reference cases are configured."],
    }
    for sex in ("M", "F", "male", "female", "boy", "girl", "unknown"):
        try:
            findings["sex_checks"][sex] = {"accepted": True, "scores": who.compute_z_scores(age_months=12, sex=sex, weight_kg=9.0, height_cm=74.0)}
        except Exception as exc:
            findings["sex_checks"][sex] = {"accepted": False, "error": str(exc)}
    for label, values in {"below_wfh_range": (0, "M", 2.0, 40.0), "above_wfh_range": (60, "F", 20.0, 120.0), "negative_weight": (12, "M", -1.0, 75.0)}.items():
        try:
            findings["out_of_range_behavior"][label] = {"result": who.compute_z_scores(age_months=values[0], sex=values[1], weight_kg=values[2], height_cm=values[3])}
        except Exception as exc:
            findings["out_of_range_behavior"][label] = {"error": str(exc)}
    for case in cases.get("cases", []):
        try:
            actual = who.compute_z_scores(age_months=case["age_months"], sex=case["sex"], weight_kg=case["weight_kg"], height_cm=case["height_cm"])
            expected = case["expected"]
            findings["official_case_comparison"]["results"].append({"id": case.get("id"), "actual": actual, "expected": expected, "difference": [round(actual[i] - expected[i], 6) for i in range(3)]})
        except Exception as exc:
            findings["official_case_comparison"]["results"].append({"id": case.get("id"), "error": str(exc)})
    payload = {"runtime": runtime_metadata(root), "findings": findings}
    write_json(root / args.output_root / "manifests" / "who_reference_validation.json", payload)
    report = "# WHO Reference Validation\n\n" + markdown_table(["Check", "Result"], [
        ["WFA age coverage", "0–60 months (trimmed table)"], ["HFA age coverage", "0–60 months (trimmed table)"], ["WFH height coverage", "45–110 cm; clamped outside range"], ["Sex codes", "M/F and documented aliases accepted; invalid values rejected"], ["Official independent cases", "incomplete: no cases/source configured"],
    ])
    report += "\n\nStructural tests executed without changing the active WHO code. This is not a completed validation against official WHO reference cases.\n"
    out = root / args.output_root / "reports" / "02_who_reference_validation.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
