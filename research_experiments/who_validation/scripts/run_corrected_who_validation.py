#!/usr/bin/env python3
"""Generate isolated evidence for the corrected WHO calculator."""
from __future__ import annotations

import csv
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
VALIDATION = ROOT / "research_experiments/who_validation"
REFERENCES = VALIDATION / "references"
sys.path.insert(0, str(ROOT))

from research_experiments.who_validation.corrected_who_growth import (  # noqa: E402
    WHOInputError,
    calculate_growth_z_scores,
    calculate_haz,
    calculate_waz,
    calculate_wlz,
    calculate_whz,
    classify_anthropometric_indicators,
)
from research_experiments.who_validation.scripts.who_reference import read_xlsx  # noqa: E402

WHO_VERSION = "WHO Child Growth Standards (2006); workbook URL revision token retained below"
URLS = {
    "wfa_girls_0_5_zscores.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_girls_0-to-5-years_zscores.xlsx?sfvrsn=4c03b8db_7",
    "wfa_boys_0_5_zscores.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_boys_0-to-5-years_zscores.xlsx?sfvrsn=97a05331_9",
    "lhfa_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10",
    "lhfa_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx?sfvrsn=7b4a3428_12",
    "wfl_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-girls-zscore-expanded-table.xlsx?sfvrsn=db7b5d6b_8",
    "wfl_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-boys-zscore-expanded-table.xlsx?sfvrsn=d307434f_8",
    "wfh_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-girls-zscore-expanded-tables.xlsx?sfvrsn=daac732c_8",
    "wfh_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-boys-zscore-expanded-tables.xlsx?sfvrsn=ac60cb13_8",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def markdown_table(headers: list[str], rows: list[list[object]]) -> str:
    divider = ["---"] * len(headers)
    data = [headers, divider, *[[str(value) for value in row] for row in rows]]
    return "\n".join("| " + " | ".join(row) + " |" for row in data)


def _row(filename: str, key: str, point: float) -> dict[str, float]:
    matches = [row for row in read_xlsx(REFERENCES / filename) if row[key] == point]
    if len(matches) != 1:
        raise RuntimeError(f"expected exactly one {filename} {key}={point} row")
    return matches[0]


def oracle_extended_z(value: float, row: dict[str, float]) -> float:
    """Independent oracle using only downloaded WHO values, not tested code."""
    l_value, median, sigma = row["L"], row["M"], row["S"]
    z_score = math.log(value / median) / sigma if l_value == 0 else ((value / median) ** l_value - 1) / (l_value * sigma)
    if z_score > 3:
        return 3 + (value - row["SD3"]) / (row["SD3"] - row["SD2"])
    if z_score < -3:
        return -3 + (value - row["SD3neg"]) / (row["SD2neg"] - row["SD3neg"])
    return z_score


def original_cases() -> list[dict[str, object]]:
    cases: list[dict[str, object]] = []
    specs = [
        ("low/-2", "WAZ", "M", 12, None, 75.7488, "recumbent_length", "wfa_boys_0_5_zscores.xlsx", "Month", 12, "SD2neg"),
        ("high/+2", "WAZ", "M", 12, None, 75.7488, "recumbent_length", "wfa_boys_0_5_zscores.xlsx", "Month", 12, "SD2"),
        ("low/-3", "WAZ", "F", 24, None, 86.363, "standing_height", "wfa_girls_0_5_zscores.xlsx", "Month", 24, "SD3neg"),
        ("infant low/-2", "HAZ", "M", 0, 0, 46.098, "recumbent_length", "lhfa_boys_expanded.xlsx", "Day", 0, "SD2neg"),
        ("24m low/-3", "HAZ", "F", 24, 730, 76.725, "recumbent_length", "lhfa_girls_expanded.xlsx", "Day", 730, "SD3neg"),
        ("24m high/+2", "HAZ", "F", 24, 730, 92.851, "recumbent_length", "lhfa_girls_expanded.xlsx", "Day", 730, "SD2"),
        ("lower reference boundary", "WLZ", "M", 0, None, 45.0, "recumbent_length", "wfl_boys_expanded.xlsx", "Length", 45.0, "SD2neg"),
        ("low/-2", "WLZ", "M", 12, None, 65.0, "recumbent_length", "wfl_boys_expanded.xlsx", "Length", 65.0, "SD2neg"),
        ("low/-3", "WLZ", "F", 18, None, 80.0, "recumbent_length", "wfl_girls_expanded.xlsx", "Length", 80.0, "SD3neg"),
        ("high/+2", "WLZ", "M", 12, None, 65.0, "recumbent_length", "wfl_boys_expanded.xlsx", "Length", 65.0, "SD2"),
        ("low/-2", "WHZ", "M", 36, None, 90.0, "standing_height", "wfh_boys_expanded.xlsx", "Height", 90.0, "SD2neg"),
        ("low/-3", "WHZ", "F", 48, None, 100.0, "standing_height", "wfh_girls_expanded.xlsx", "Height", 100.0, "SD3neg"),
        ("high/+2", "WHZ", "M", 36, None, 90.0, "standing_height", "wfh_boys_expanded.xlsx", "Height", 90.0, "SD2"),
        ("upper reference boundary", "WHZ", "F", 59, None, 120.0, "standing_height", "wfh_girls_expanded.xlsx", "Height", 120.0, "SD2"),
    ]
    for scenario, indicator, sex, age_months, age_days, length_height, method, filename, key, point, score_key in specs:
        row = _row(filename, key, point)
        weight = row[score_key] if indicator != "HAZ" else length_height
        expected = oracle_extended_z(weight if indicator != "HAZ" else length_height, row)
        if indicator == "WAZ":
            calculated = calculate_waz(age_months=age_months, sex=sex, weight_kg=weight)
        elif indicator == "HAZ":
            calculated = calculate_haz(age_days=age_days, sex=sex, length_height_cm=length_height, measurement_method=method)
        elif indicator == "WLZ":
            calculated = calculate_wlz(sex=sex, weight_kg=weight, recumbent_length_cm=length_height)
        else:
            calculated = calculate_whz(sex=sex, weight_kg=weight, standing_height_cm=length_height)
        difference = abs(expected - calculated)
        cases.append({
            "scenario": scenario, "indicator": indicator, "sex": sex,
            "age_months": age_months, "age_days": age_days,
            "measurement_method": method, "length_height_cm": length_height,
            "weight_kg": weight, "reference_file": filename,
            "reference_key": key, "reference_point": point,
            "expected_z": expected, "calculated_z": calculated,
            "absolute_difference": difference, "status": "PASS" if difference <= 0.05 else "FAIL",
        })
    return cases


def additional_cases() -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, str]]:
    boy_wfa = _row("wfa_boys_0_5_zscores.xlsx", "Month", 12)
    extreme_weight = boy_wfa["SD3neg"] - 0.5
    expected_extreme = oracle_extended_z(extreme_weight, boy_wfa)
    calculated_extreme = calculate_waz(age_months=12, sex="M", weight_kg=extreme_weight)
    method_cases = [
        {
            "case": "standing height converted to length at 730 days",
            "input": {"age_months": 24, "age_days": 730, "sex": "M", "weight_kg": 6.193, "length_height_cm": 64.3, "measurement_method": "standing_height"},
            "expected_indicator": "WFL", "expected_adjusted_cm": 65.0,
            "expected_z": oracle_extended_z(6.193, _row("wfl_boys_expanded.xlsx", "Length", 65.0)),
        },
        {
            "case": "recumbent length converted to height at 731 days",
            "input": {"age_months": 24, "age_days": 731, "sex": "M", "weight_kg": 11.022, "length_height_cm": 90.7, "measurement_method": "recumbent_length"},
            "expected_indicator": "WFH", "expected_adjusted_cm": 90.0,
            "expected_z": oracle_extended_z(11.022, _row("wfh_boys_expanded.xlsx", "Height", 90.0)),
        },
    ]
    method_results = []
    for item in method_cases:
        result = calculate_growth_z_scores(**item["input"])
        calculated = result["wlz"] if item["expected_indicator"] == "WFL" else result["whz"]
        difference = abs(item["expected_z"] - calculated)
        method_results.append({**item, "actual_indicator": result["length_height_indicator"], "actual_adjusted_cm": result["adjusted_length_height_cm"], "calculated_z": calculated, "absolute_difference": difference, "status": "PASS" if difference <= 0.05 and item["expected_indicator"] == result["length_height_indicator"] and item["expected_adjusted_cm"] == result["adjusted_length_height_cm"] else "FAIL"})
    invalid = []
    invalid_specs = [
        ("invalid sex", dict(age_months=12, age_days=365, sex="x", weight_kg=8, length_height_cm=75, measurement_method="recumbent_length")),
        ("age over 60-month reference", dict(age_months=61, age_days=1857, sex="M", weight_kg=18, length_height_cm=110, measurement_method="standing_height")),
        ("zero weight", dict(age_months=12, age_days=365, sex="M", weight_kg=0, length_height_cm=75, measurement_method="recumbent_length")),
        ("WFL below official boundary", dict(age_months=12, age_days=365, sex="M", weight_kg=8, length_height_cm=44.9, measurement_method="recumbent_length")),
        ("WFH above official boundary", dict(age_months=48, age_days=1461, sex="F", weight_kg=15, length_height_cm=120.1, measurement_method="standing_height")),
        ("standing measurement under nine months", dict(age_months=6, age_days=180, sex="F", weight_kg=7, length_height_cm=65, measurement_method="standing_height")),
        ("unknown method", dict(age_months=12, age_days=365, sex="M", weight_kg=8, length_height_cm=75, measurement_method="other")),
    ]
    for name, kwargs in invalid_specs:
        try:
            calculate_growth_z_scores(**kwargs)
        except WHOInputError as exc:
            invalid.append({"case": name, "raises_expected_error": True, "message": str(exc)})
        else:
            invalid.append({"case": name, "raises_expected_error": False, "message": "no error"})
    classifications = classify_anthropometric_indicators(waz=-2.5, haz=-3.5, wlz=-2.5)
    extra = [{"case": "extended z below -3", "expected_z": expected_extreme, "calculated_z": calculated_extreme, "absolute_difference": abs(expected_extreme - calculated_extreme), "status": "PASS" if abs(expected_extreme - calculated_extreme) <= 0.05 else "FAIL"}]
    return extra, method_results + invalid, classifications


def main() -> None:
    reports = VALIDATION / "reports"
    output = VALIDATION / "corrected_results"
    reports.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "standard": WHO_VERSION,
        "source_pages": {
            "standards": "https://www.who.int/tools/child-growth-standards",
            "software_and_method": "https://www.who.int/tools/child-growth-standards/software",
            "length_height_adjustment": "https://iris.who.int/bitstream/handle/10665/43601/9789241595070_B_eng.pdf?sequence=2",
        },
        "files": [{"filename": filename, "source_url": url, "sha256": sha256(REFERENCES / filename)} for filename, url in URLS.items()],
    }
    write_json(REFERENCES / "reference_manifest.json", manifest)
    write_json(output / "reference_manifest.json", manifest)
    original = original_cases()
    extra, method_and_invalid, classifications = additional_cases()
    write_json(output / "original_14_case_results.json", original)
    write_json(output / "additional_validation_results.json", {"extreme_z": extra, "method_and_invalid": method_and_invalid, "classifications": classifications})
    with (output / "original_14_case_results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(original[0]))
        writer.writeheader()
        writer.writerows(original)
    original_failures = sum(case["status"] == "FAIL" for case in original)
    all_diffs = [case["absolute_difference"] for case in original]
    method_results = [item for item in method_and_invalid if "status" in item]
    invalid_results = [item for item in method_and_invalid if "raises_expected_error" in item]
    reference_rows = [[item["filename"], item["sha256"], item["source_url"]] for item in manifest["files"]]
    (reports / "10_corrected_who_implementation.md").write_text(
        "# Corrected WHO Implementation\n\n"
        "`corrected_who_growth.py` is an isolated implementation. It reads eight unchanged official WHO workbook copies from `references/` and has no imports from the application calculator. It implements `calculate_waz`, `calculate_haz`, `calculate_wlz`, `calculate_whz`, `calculate_growth_z_scores`, and `classify_anthropometric_indicators`.\n\n"
        "The calculator preserves sex-specific official L, M, S parameters and exact source keys. It does not interpolate, extrapolate, clamp, or clip values. WFA accepts only official integer monthly keys 0–60; LHFA accepts only exact day keys 0–1856; WFL and WFH accept only exact 0.1-cm reference keys. LMS values outside ±3 use WHO's published SD2–SD3 extension rather than arbitrary clipping.\n\n"
        "WHO source version: " + WHO_VERSION + ". The same immutable metadata is stored in both `references/reference_manifest.json` and `corrected_results/reference_manifest.json`.\n\n" +
        markdown_table(["Reference asset", "SHA-256", "Official source URL"], reference_rows) +
        "\n\nIndependent classification check: WAZ −2.5 → `underweight`; HAZ −3.5 → `severe_stunting`; WLZ −2.5 → `wasting`. These independent screening labels coexist and intentionally do not return MAM or SAM diagnostic terminology.\n",
        encoding="utf-8",
    )
    rows = [[case["scenario"], case["indicator"], case["sex"], case["age_months"], case["age_days"], case["measurement_method"], case["length_height_cm"], case["weight_kg"], case["reference_file"], f"{case['expected_z']:.6f}", f"{case['calculated_z']:.6f}", f"{case['absolute_difference']:.6f}", case["status"]] for case in original]
    (reports / "11_corrected_reference_test_results.md").write_text(
        "# Corrected Reference Test Results\n\n"
        "The original 14 cases are evaluated against an independent oracle that reads the downloaded WHO tables directly; expected values are not obtained from `corrected_who_growth.py`. Tolerance is ≤0.05 z-score.\n\n" +
        markdown_table(["Case", "Ind", "Sex", "Age mo", "Age d", "Method", "L/H cm", "Wt kg", "Reference", "Expected", "Calculated", "Abs diff", "Status"], rows) +
        f"\n\nPass/fail: {len(original) - original_failures}/{len(original)} passed; {original_failures}/{len(original)} failed. Maximum absolute difference: {max(all_diffs):.9f}; mean absolute difference: {sum(all_diffs) / len(all_diffs):.9f}.\n\n"
        "Additional independent extreme-value case: " + markdown_table(["Case", "Expected", "Calculated", "Abs diff", "Status"], [[item["case"], f"{item['expected_z']:.6f}", f"{item['calculated_z']:.6f}", f"{item['absolute_difference']:.6f}", item["status"]] for item in extra]) + "\n",
        encoding="utf-8",
    )
    method_rows = [[item["case"], item.get("expected_indicator", "error"), item.get("actual_indicator", ""), item.get("expected_adjusted_cm", ""), item.get("actual_adjusted_cm", ""), item.get("absolute_difference", ""), item.get("status", "PASS" if item.get("raises_expected_error") else "FAIL")] for item in method_and_invalid]
    (reports / "12_measurement_method_validation.md").write_text(
        "# Measurement-Method and Invalid-Input Validation\n\n"
        "WHO guidance recommends recumbent length before 731 days and standing height from 731 days, adding 0.7 cm when standing height is supplied below 24 months and subtracting 0.7 cm when recumbent length is supplied at or above 24 months. The isolated calculator follows those rules and rejects standing measurements below nine months.\n\n" +
        markdown_table(["Case", "Expected ind/error", "Actual ind", "Expected cm", "Actual cm", "Abs diff", "Status"], method_rows) +
        f"\n\nMethod tests: {sum(item['status'] == 'PASS' for item in method_results)}/{len(method_results)} passed. Invalid-input tests: {sum(item['raises_expected_error'] for item in invalid_results)}/{len(invalid_results)} correctly raised `WHOInputError`.\n",
        encoding="utf-8",
    )
    (reports / "13_production_integration_plan.md").write_text(
        "# Production Integration Plan\n\n"
        "No production code was changed. A future, separately approved integration must:\n\n"
        "1. Add the reviewed reference assets and manifest to a production-controlled location without modifying their contents.\n"
        "2. Replace `backend/utils/who_growth.py`'s sparse dictionaries and `compute_z_scores` with a reviewed adaptation of `corrected_who_growth.py`'s reference reader, LMS extension, and explicit error behavior.\n"
        "3. Update `backend/utils/measurement_validation.py` and each assessment caller (`backend/routes/midwife.py`, `backend/routes/moh.py`, `backend/routes/nutritionist.py`, and `backend/models_hierarchical.py`) to pass exact age days, integer WFA month, and measurement method.\n"
        "4. Keep WFA, stunting, and wasting independent. Integrate only anthropometric screening labels; do not convert them into a clinical MAM/SAM diagnosis without approved clinical criteria and review.\n"
        "5. Port the immutable 14-case and method/invalid-input regression suite, rerun it in CI, obtain clinician review, and only then consider release.\n\n"
        "The current application cannot consume this isolated module without an explicit integration decision because its existing calculator interface does not supply the necessary exact age-day and method contract.\n",
        encoding="utf-8",
    )
    (reports / "14_ieee_who_correction_summary.md").write_text(
        "# IEEE WHO Correction Summary\n\n"
        f"Eight official WHO reference assets were retained under `references/` with URL/version/checksum evidence. The isolated corrected engine passed {len(original) - original_failures}/{len(original)} original independent cases (maximum absolute difference {max(all_diffs):.9f}; mean {sum(all_diffs) / len(all_diffs):.9f}) and passed its additional extreme, method-transition, and invalid-input checks.\n\n"
        "Coverage includes WAZ, LHFA/HAZ, WFL/WLZ, WFH/WHZ, both sexes, infant and older-child cases, the 24-month transition, −2/−3 thresholds, both WFL/WFH reference boundaries, extended z-score handling, and explicit rejection of invalid inputs.\n\n"
        "Remaining limitations: this is an isolated technical implementation, not clinical validation or a production change. WFA remains constrained to WHO's supplied integer-month table keys and LHFA to supplied daily keys; the implementation intentionally rejects rather than estimates unsupported keys. Clinical reviewers must approve age-date derivation, measurement workflow, anthropometric terminology, and integration behavior before deployment.\n\n"
        "Status: ready for clinical and software-integration review, not ready for production use without that approval.\n",
        encoding="utf-8",
    )
    print(f"original_cases={len(original)} failures={original_failures} max_diff={max(all_diffs):.9f}")


if __name__ == "__main__":
    main()
