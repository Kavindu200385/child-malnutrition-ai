#!/usr/bin/env python3
"""Read-only WHO implementation validation; never alters production code or data."""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
VALIDATION = ROOT / "research_experiments/who_validation"
SOURCES = VALIDATION / "reference_sources"
sys.path.insert(0, str(ROOT))

from backend.utils.current_status import (  # noqa: E402
    assess_current_nutritional_status, stunting_status_from_hfa,
    underweight_status_from_wfa, wasting_status_from_wfh,
)
from backend.utils.who_growth import compute_z_scores  # noqa: E402
from who_reference import lms_z, nearest, read_xlsx  # noqa: E402

WHO_URLS = {
    "wfa_girls_0_5_zscores.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_girls_0-to-5-years_zscores.xlsx?sfvrsn=4c03b8db_7",
    "wfa_boys_0_5_zscores.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_boys_0-to-5-years_zscores.xlsx?sfvrsn=97a05331_9",
    "lhfa_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10",
    "lhfa_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx?sfvrsn=7b4a3428_12",
    "wfl_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-girls-zscore-expanded-table.xlsx?sfvrsn=db7b5d6b_8",
    "wfl_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-boys-zscore-expanded-table.xlsx?sfvrsn=d307434f_8",
    "wfh_girls_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-girls-zscore-expanded-tables.xlsx?sfvrsn=daac732c_8",
    "wfh_boys_expanded.xlsx": "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-boys-zscore-expanded-tables.xlsx?sfvrsn=ac60cb13_8",
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"] + ["| " + " | ".join(str(v) for v in row) + " |" for row in rows])


def case(scenario, indicator, sex, age, height, source_file, source_key, source_point, expected_value):
    source_row = nearest(read_xlsx(SOURCES / source_file), source_key, source_point)
    expected = lms_z(expected_value, source_row["L"], source_row["M"], source_row["S"])
    actual = compute_z_scores(age_months=age, sex=sex, weight_kg=expected_value, height_cm=height)
    index = {"WAZ": 0, "HAZ": 1, "WLZ": 2, "WHZ": 2}[indicator]
    actual_z = actual[index]
    return {"scenario": scenario, "indicator": indicator, "sex": sex, "age_months": age, "height_cm": height, "weight_kg": expected_value, "source_file": source_file, "source_point": source_row[source_key], "expected_z": round(expected, 6), "actual_z": actual_z, "absolute_difference": round(abs(expected - actual_z), 6), "status": "PASS" if abs(expected - actual_z) <= 0.05 else "FAIL"}


def main():
    reports = VALIDATION / "reports"; results = VALIDATION / "results"; reports.mkdir(parents=True, exist_ok=True); results.mkdir(parents=True, exist_ok=True)
    source_manifest = {"official_who_pages": {"standards": "https://www.who.int/tools/child-growth-standards", "wfa": "https://www.who.int/tools/child-growth-standards/standards/weight-for-age", "lhfa": "https://www.who.int/tools/child-growth-standards/standards/length-height-for-age", "wfl_wfh": "https://www.who.int/toolkits/child-growth-standards/standards/weight-for-length-height"}, "files": [{"filename": name, "url": url, "sha256": sha(SOURCES / name)} for name, url in WHO_URLS.items()]}
    write_json(results / "official_source_manifest.json", source_manifest)

    # Official-table oracle cases use WHO LMS parameters and official table points.
    cases = [
        case("low/-2", "WAZ", "M", 12, 75.7488, "wfa_boys_0_5_zscores.xlsx", "Month", 12, nearest(read_xlsx(SOURCES / "wfa_boys_0_5_zscores.xlsx"), "Month", 12)["SD2neg"]),
        case("high/+2", "WAZ", "M", 12, 75.7488, "wfa_boys_0_5_zscores.xlsx", "Month", 12, nearest(read_xlsx(SOURCES / "wfa_boys_0_5_zscores.xlsx"), "Month", 12)["SD2"]),
        case("low/-3", "WAZ", "F", 24, 86.363, "wfa_girls_0_5_zscores.xlsx", "Month", 24, nearest(read_xlsx(SOURCES / "wfa_girls_0_5_zscores.xlsx"), "Month", 24)["SD3neg"]),
        case("infant low/-2", "HAZ", "M", 0, 46.098, "lhfa_boys_expanded.xlsx", "Day", 0, 46.098),
        case("24m low/-3", "HAZ", "F", 24, 76.725, "lhfa_girls_expanded.xlsx", "Day", 730, 76.725),
        case("24m high/+2", "HAZ", "F", 24, 92.851, "lhfa_girls_expanded.xlsx", "Day", 730, 92.851),
        case("lower reference boundary", "WLZ", "M", 0, 45, "wfl_boys_expanded.xlsx", "Length", 45, nearest(read_xlsx(SOURCES / "wfl_boys_expanded.xlsx"), "Length", 45)["SD2neg"]),
        case("low/-2", "WLZ", "M", 12, 65, "wfl_boys_expanded.xlsx", "Length", 65, nearest(read_xlsx(SOURCES / "wfl_boys_expanded.xlsx"), "Length", 65)["SD2neg"]),
        case("low/-3", "WLZ", "F", 18, 80, "wfl_girls_expanded.xlsx", "Length", 80, nearest(read_xlsx(SOURCES / "wfl_girls_expanded.xlsx"), "Length", 80)["SD3neg"]),
        case("high/+2", "WLZ", "M", 12, 65, "wfl_boys_expanded.xlsx", "Length", 65, nearest(read_xlsx(SOURCES / "wfl_boys_expanded.xlsx"), "Length", 65)["SD2"]),
        case("low/-2", "WHZ", "M", 36, 90, "wfh_boys_expanded.xlsx", "Height", 90, nearest(read_xlsx(SOURCES / "wfh_boys_expanded.xlsx"), "Height", 90)["SD2neg"]),
        case("low/-3", "WHZ", "F", 48, 100, "wfh_girls_expanded.xlsx", "Height", 100, nearest(read_xlsx(SOURCES / "wfh_girls_expanded.xlsx"), "Height", 100)["SD3neg"]),
        case("high/+2", "WHZ", "M", 36, 90, "wfh_boys_expanded.xlsx", "Height", 90, nearest(read_xlsx(SOURCES / "wfh_boys_expanded.xlsx"), "Height", 90)["SD2"]),
        case("upper reference boundary", "WHZ", "F", 59, 120, "wfh_girls_expanded.xlsx", "Height", 120, nearest(read_xlsx(SOURCES / "wfh_girls_expanded.xlsx"), "Height", 120)["SD2"]),
    ]
    with (results / "official_case_results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(cases[0])); writer.writeheader(); writer.writerows(cases)
    write_json(results / "official_case_results.json", cases)
    invalid = []
    for name, kwargs in [("invalid_sex", dict(age_months=12, sex="x", weight_kg=9, height_cm=75)), ("negative_age", dict(age_months=-1, sex="M", weight_kg=9, height_cm=75)), ("over_60_months", dict(age_months=61, sex="F", weight_kg=18, height_cm=110)), ("zero_weight", dict(age_months=12, sex="M", weight_kg=0, height_cm=75)), ("height_below_wfh_table", dict(age_months=12, sex="M", weight_kg=8, height_cm=44)), ("height_above_wfh_table", dict(age_months=48, sex="F", weight_kg=15, height_cm=111))]:
        try:
            invalid.append({"case": name, "raises": False, "result": compute_z_scores(**kwargs)})
        except Exception as exc:
            invalid.append({"case": name, "raises": True, "error": str(exc)})
    write_json(results / "invalid_input_results.json", invalid)
    classifications = []
    for score in (-3.001, -3.0, -2.001, -2.0, None):
        classifications.append({"z": score, "underweight": underweight_status_from_wfa(score), "stunting": stunting_status_from_hfa(score), "wasting": wasting_status_from_wfh(score)})
    overlap = assess_current_nutritional_status(z_score_wfa=-2.5, z_score_hfa=-3.5, z_score_wfh=-2.5, muac_status=None, edema_status=None)
    write_json(results / "classification_results.json", {"thresholds": classifications, "overlap_example": overlap})
    grouped = {name: [x for x in cases if x["indicator"] == name] for name in ("WAZ", "HAZ", "WLZ", "WHZ")}
    def case_table(items): return table(["Case", "Sex", "Age", "Ht", "Wt", "Expected", "Actual", "Abs diff", "Status"], [[x["scenario"],x["sex"],x["age_months"],x["height_cm"],x["weight_kg"],x["expected_z"],x["actual_z"],x["absolute_difference"],x["status"]] for x in items])
    (reports / "01_who_implementation_inventory.md").write_text("# WHO Implementation Inventory\n\nActive calculator: `backend/utils/who_growth.py:12-165`; clinical classifications: `backend/utils/current_status.py:7-115`; input validation: `backend/utils/measurement_validation.py:59-153`; route calls: `backend/routes/midwife.py:330-345`, `backend/routes/moh.py:141-155`, and `backend/routes/nutritionist.py:294-305`. Existing production checks are `backend/tests/unit/test_who_growth.py:6-16`; they only assert that a valid call returns bounded values and that an invalid sex raises.\n\nThe current WFA tables contain 10 sparse points (0–60 months); LHFA contains 7 sparse points (0–60 months); and the table labelled WFH spans 45–110 cm. This is not complete official reference coverage. `compute_z_scores` performs the standard LMS formula (`112-115`), but interpolates and clamps table keys (`118-138`) and clips every output to ±5 (`160-163`). It accepts no measurement-method argument.\n\nThe prior internal report `research_experiments/reports/02_who_reference_validation.md` correctly described official-case validation as incomplete. This validation supersedes that gap with isolated, independently sourced official table cases; it does not alter application code.\n", encoding="utf-8")
    (reports / "02_official_reference_sources.md").write_text("# Official Reference Sources\n\nOfficial WHO 2006 Child Growth Standards files were downloaded unchanged under `reference_sources/`; exact URLs and SHA-256 values are recorded in `results/official_source_manifest.json`. The standard-library reader and the local copies make the cases repeatable without modifying production reference data.\n\nWHO provides sex-specific standards through 60 completed months and separate length/height-for-age and weight-for-length/height tables. Sources: [WHO standards](https://www.who.int/tools/child-growth-standards), [WFA tables](https://www.who.int/tools/child-growth-standards/standards/weight-for-age), [LHFA tables](https://www.who.int/tools/child-growth-standards/standards/length-height-for-age), [WFL/WFH tables](https://www.who.int/toolkits/child-growth-standards/standards/weight-for-length-height), and [WHO standards methods/development report](https://www.who.int/publications/i/item/924154693X). No expected value in the validation was invented: each comes from an official-table LMS row and its published anthropometric point.\n", encoding="utf-8")
    (reports / "03_waz_validation_results.md").write_text("# WAZ Validation Results\n\nTolerance: absolute difference ≤0.05 z-score. Expected values are recomputed from the matching official sex- and month-specific LMS row.\n\n" + case_table(grouped["WAZ"]) + "\n\n| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |\n| --- | --- | --- | --- | --- |\n| `backend/utils/who_growth.py:12-36` stores `L=1` for WFA. | At 12 months (boy), observed −2.236 vs verified official −2.049338; at 24 months (girl), observed −3.185 vs verified official −2.962170. Official WFA L is age/sex-specific and non-unit. | Critical | WAZ values and threshold classifications can change. | Replace all sparse WFA entries with the versioned official monthly LMS data and retain L. |\n\nThe LMS expression itself (`who_growth.py:112-115`) is structurally correct; the confirmed failure is the incorrect input parameters and sparse interpolation, not the formula branch.\n", encoding="utf-8")
    (reports / "04_haz_validation_results.md").write_text("# HAZ/LHFA Validation Results\n\nTolerance: absolute difference ≤0.05 z-score. The cases use official day-specific LHFA rows, including the 24-month boundary.\n\n" + case_table(grouped["HAZ"]) + "\n\n| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |\n| --- | --- | --- | --- | --- |\n| `backend/utils/who_growth.py:48-56` contains a mismatched, sparse LHFA female table. | At 24 months (day 730, girl), observed −3.372 vs verified official −2.999930. The local S=0.0331 differs from the official S=0.03733. | High | A child at an official −3 threshold is assigned a materially different HAZ, potentially changing severity. | Use the complete official daily/monthly LHFA LMS tables, preserving all parameters. |\n| `backend/utils/who_growth.py:141-165` has no recumbent-length/standing-height input or selection rule. | The function only receives `height_cm`; official references distinguish length and height. | High | Method-dependent measurements cannot be assessed against the proper standard. | Carry the validated measurement method into the calculator and explicitly select/adjust the relevant WHO reference. |\n\nThe birth-boy anchor passed (difference 0.000006), but one matching point does not validate the trimmed table across the supported range.\n", encoding="utf-8")
    (reports / "05_wlz_whz_validation_results.md").write_text("# WLZ/WHZ Validation Results\n\nTolerance: absolute difference ≤0.05 z-score. WLZ cases use official WFL rows and WHZ cases use official WFH rows.\n\n" + case_table(grouped["WLZ"] + grouped["WHZ"]) + "\n\n| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |\n| --- | --- | --- | --- | --- |\n| `backend/utils/who_growth.py:58-109` labels one 45–110 cm table as WFH and hard-codes `L=1`. | All eight official WLZ/WHZ cases failed, including both reference boundaries; absolute differences span 0.224480–2.999951. Official WFL/WFH L is non-unit (for example, −0.3521 in the boy rows tested). | Critical | Wasting classification can be substantially wrong. | Store full, separately versioned official WFL and WFH LMS tables with their published L, M, S values. |\n| `backend/utils/who_growth.py:154-158` always selects that single table by height. | A 65-cm length, 90-cm height, and 100-cm height all use the same local table regardless of method or age. | Critical | WLZ and WHZ are conflated, so clinical threshold statements are unsupported. | Require a valid method, select WFL versus WFH accordingly, and implement the applicable WHO adjustment/eligibility rules. |\n", encoding="utf-8")
    (reports / "06_classification_validation.md").write_text("# Classification Validation\n\n" + table(["Z", "Underweight", "Stunting", "Wasting"], [[x["z"],x["underweight"],x["stunting"],x["wasting"]] for x in classifications]) + "\n\n`backend/utils/current_status.py:49-51` preserves independent underweight, stunting, and wasting values in its breakdown, so overlap is retained. The `current_nutritional_status` field is a precedence-based display summary (`55-70`), not proof that the conditions are mutually exclusive. Threshold boundaries follow the implemented strict comparisons: exact −2 is normal; exact −3 is moderate/non-severe. Clinical review must confirm the desired policy against the approved WHO guidance.\n\n| Confirmed scope problem | Evidence | Severity | Scientific implication | Required correction |\n| --- | --- | --- | --- | --- |\n| `current_status.py:27-34,55-60,85-95` emits `MAM`/`SAM` directly from a computed WFH/WFL result, even though the calculator currently lacks valid WFL/WFH method selection and accepts silently clamped inputs. | The field is returned as a status and used in the top-level summary. | High | The label can appear clinically definitive despite incomplete measurement/reference validity. | Until the WHO calculator is corrected and clinical governance approves wording, expose it as a screening classification with indicator, method, and quality flags; do not claim confirmed MAM/SAM from insufficient inputs. |\n\nNo MUAC or edema feature was added or changed in this validation.\n", encoding="utf-8")
    (reports / "07_boundary_and_invalid_input_tests.md").write_text("# Boundary and Invalid Input Tests\n\n" + table(["Case", "Raises", "Observed"], [[x["case"],x["raises"],x.get("result",x.get("error"))] for x in invalid]) + "\n\n| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |\n| --- | --- | --- | --- | --- |\n| `backend/utils/who_growth.py:125-128` clamps unsupported ages. | Negative age and 61 months returned apparently valid scores rather than an explicit unsupported-input outcome. | High | Results outside the supported WHO age range may be treated as valid. | Validate age before lookup and return an explicit non-score/error outside approved bounds. |\n| `backend/utils/who_growth.py:155-163` clamps height and clips score magnitude. | 44 cm and 111 cm returned scores after table clamping; zero weight returned `(-5.0, -0.315, -5.0)`. | Critical | Out-of-domain or nonpositive inputs can become plausible-looking clinical results. | Reject nonpositive and reference-ineligible anthropometry; retain raw validation errors rather than clip to ±5. |\n| `backend/utils/measurement_validation.py:130-134` validates a method but callers at `midwife.py:332-334`, `moh.py:143-145`, and `nutritionist.py:295` do not pass it to the calculator. | The method cannot affect WFL/WFH reference selection. | High | The wrong reference can be applied even after a user supplies a valid method. | Propagate method to an updated calculator and reject absent method where indicator selection requires it. |\n\nRoute-level validation rejects zero/negative weight or height (`measurement_validation.py:98-110`) and invalid sex, but values merely outside its 1–40 kg / 30–130 cm review ranges remain admissible. The calculator itself must therefore enforce WHO reference eligibility.\n", encoding="utf-8")
    (reports / "08_who_code_correction_plan.md").write_text("# WHO Code Correction Plan\n\nNo production correction has been applied. The required sequence is:\n\n1. Add versioned, unmodified official WHO LMS reference assets for WFA, LHFA, WFL, and WFH; record origin, version, and SHA-256.\n2. Replace the sparse dictionaries at `backend/utils/who_growth.py:12-109` with a dedicated reference reader that retains official L, M, and S values and rejects unsupported table keys.\n3. Change the calculator contract to accept validated age-in-days/months and `recumbent_length` versus `standing_height`; implement the approved WHO WFL/WFH selection and any measurement adjustment rules.\n4. Remove silent key clamping and output clipping at `who_growth.py:125-128,155-163`; return typed validation failures for unsupported ages, nonpositive values, and out-of-table values.\n5. Propagate the method through the three assessment routes and model helper call sites; keep invalid scores absent rather than substituting a plausible number.\n6. Keep WFA, stunting, and wasting as independently exposed indicators. Change MAM/SAM language to a clinician-approved screening/assessment label until input quality and WHO calculation validity are established. Do not add MUAC or edema functionality.\n7. Add immutable official-table regression cases spanning both sexes, infant/older ages, 24-month transition, low/high values, −2/−3 thresholds, and all reference boundaries. Require documented tolerance before deployment.\n\nScientific release gate: rerun the isolated suite, obtain clinical review of scope/wording and method rules, then independently review the production diff before any application change.\n", encoding="utf-8")
    failures = sum(x["status"] == "FAIL" for x in cases)
    indicator_summary = "; ".join(f"{indicator} failed {sum(x['status'] == 'FAIL' for x in grouped[indicator])}/{len(grouped[indicator])}" for indicator in ("WAZ", "HAZ", "WLZ", "WHZ"))
    (reports / "09_ieee_who_validation_summary.md").write_text(f"# IEEE WHO Validation Summary\n\nOfficial WHO source files were obtained and {len(cases)} independent LMS cases were executed; {failures} exceeded the declared 0.05 z-score tolerance. {indicator_summary}.\n\nThe active implementation is **not validated for IEEE clinical-performance claims**. Confirmed issues are incorrect WFA LMS L values; a mismatched sparse LHFA parameter; conflated WFL/WFH data with incorrect L values; missing method selection; and silent clamping/clipping of unsupported inputs. The classification breakdown supports overlapping indicators, but its MAM/SAM wording requires clinical-governance review because the underlying WFL/WFH calculation is not valid.\n\nReference coverage remains incomplete in production: the official 0–60-month tables are not fully represented, the WFL/WFH distinction is absent, and the calculator does not handle recumbent length versus standing height. The deterministic WHO assessment must not be described as clinically validated until the correction plan is implemented and this isolated suite is rerun against the corrected code.\n", encoding="utf-8")


if __name__ == "__main__":
    main()
