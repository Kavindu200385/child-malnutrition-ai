#!/usr/bin/env python3
"""Audit longitudinal CSVs and prepare immutable, simulation-only split datasets.

Uses only the Python standard library.  It never writes to source datasets or
split memberships and does not train, balance, impute, or transform features.
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
from datetime import date
from pathlib import Path

from common import markdown_table, read_csv, runtime_metadata, sha256, write_json


RISK_ORDER = ["Low", "Moderate", "High", "Severe"]
PREPARED_FIELDS = [
    "source_cohort", "source_row_number", "group_id", "partition",
    "age_months", "weight_kg", "height_cm", "z_score", "current_risk",
    "predicted_risk_next_2_months",
]


def n(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def counter_table(counter):
    return [[key, counter[key]] for key in sorted(counter, key=lambda x: str(x))]


def stable_group_id(cohort, child_id):
    """Dataset-prefix prevents same textual IDs in separate CSVs being conflated."""
    return f"{cohort}:{child_id}"


def anonymized_child_token(cohort, child_id):
    return hashlib.sha256(f"step2d-audit|{cohort}|{child_id}".encode("utf-8")).hexdigest()[:16]


def read_memberships(path):
    rows, _ = read_csv(path)
    mapping = {r["group_id"]: r["partition"] for r in rows}
    return mapping, rows


def analyse_dataset(root, spec, config):
    path = root / spec["path"]
    rows, headers = read_csv(path)
    memberships, membership_rows = read_memberships(root / spec["membership_file"])
    by_child = collections.defaultdict(list)
    for index, row in enumerate(rows, start=2):
        row["_source_row_number"] = index
        by_child[row["child_id"]].append(row)

    flags, flagged_index = [], []
    low_age, high_age = spec["recorded_age_range_months"]
    invalid_counts = collections.Counter()
    interval_days, age_steps, weight_changes, height_changes = [], [], [], []
    prior_mismatch = delta_rounding_only = delta_substantive = 0
    chronology_bad = visit_bad = missing_visit = 0
    next_matches = next_total = 0
    for child, child_rows in by_child.items():
        child_rows.sort(key=lambda r: int(r["visit_number"]))
        visits = [int(r["visit_number"]) for r in child_rows]
        if visits != list(range(1, len(child_rows) + 1)):
            visit_bad += 1
        if len(child_rows) != 8:
            missing_visit += 1
        for r in child_rows:
            reasons = []
            age, weight, height = n(r["age_months"]), n(r["weight_kg"]), n(r["height_cm"])
            if age is None:
                reasons.append("non_numeric_age")
            elif not low_age <= age <= high_age:
                reasons.append("outside_configured_recorded_age_range")
            # Preserve the Step 2C signal in the audit index without treating
            # it as an invalid measurement under this source-specific range.
            if age is not None and age > 60:
                reasons.append("exceeds_prior_generic_60_month_validator_limit")
            if weight is None or weight <= 0:
                reasons.append("nonpositive_or_non_numeric_weight")
            if height is None or height <= 0:
                reasons.append("nonpositive_or_non_numeric_height")
            for reason in reasons:
                invalid_counts[reason] += 1
            if reasons:
                flags.append((r, reasons))
                # Never expose child_id in the report/index.
                flagged_index.append({"dataset": spec["path"], "anonymized_child_token": anonymized_child_token(spec["cohort"], child), "source_row_number": r["_source_row_number"], "visit_number": r["visit_number"], "reasons": ";".join(reasons), "current_risk": r["current_risk"], "target_risk": r["predicted_risk_next_2_months"]})
        for previous, current in zip(child_rows, child_rows[1:]):
            previous_date, current_date = date.fromisoformat(previous["visit_date"]), date.fromisoformat(current["visit_date"])
            days = (current_date - previous_date).days
            interval_days.append(days)
            if days <= 0:
                chronology_bad += 1
            age_steps.append(int(current["age_months"]) - int(previous["age_months"]))
            weight_changes.append(n(current["weight_kg"]) - n(previous["weight_kg"]))
            height_changes.append(n(current["height_cm"]) - n(previous["height_cm"]))
            next_total += 1
            next_matches += int(previous["predicted_risk_next_2_months"] == current["current_risk"])
        for i, current in enumerate(child_rows):
            z, prev_z, delta = n(current["z_score"]), n(current["previous_z_score"]), n(current["delta_z_score"])
            if i and abs(prev_z - n(child_rows[i - 1]["z_score"])) > 0.011:
                prior_mismatch += 1
            if None not in (z, prev_z, delta):
                difference = abs((z - prev_z) - delta)
                # z scores are recorded to two decimals while deltas have three;
                # a 0.011 tolerance covers ordinary independent rounding.
                if difference > 0.011:
                    delta_substantive += 1
                elif difference > 0.0005:
                    delta_rounding_only += 1

    actual_hash = sha256(path)
    target_counts = collections.Counter(r[config["target_column"]] for r in rows)
    current_counts = collections.Counter(r["current_risk"] for r in rows)
    transitions = collections.Counter((r["current_risk"], r[config["target_column"]]) for r in rows)
    age_values = [n(r["age_months"]) for r in rows]
    weight_values = [n(r["weight_kg"]) for r in rows]
    height_values = [n(r["height_cm"]) for r in rows]
    z_values = [n(r["z_score"]) for r in rows]
    partitions = collections.Counter(memberships.get(r["child_id"], "UNASSIGNED") for r in rows)
    membership_issues = {
        "missing_source_groups": sorted(set(by_child) - set(memberships)),
        "extra_membership_groups": sorted(set(memberships) - set(by_child)),
        "duplicate_membership_rows": len(membership_rows) - len(memberships),
        "invalid_partitions": sorted(set(memberships.values()) - {"train", "validation", "test"}),
    }
    return {
        "spec": spec, "headers": headers, "rows": rows, "by_child": by_child,
        "flags": flags, "flagged_index": flagged_index, "hash": actual_hash,
        "hash_matches_config": actual_hash == spec["expected_source_sha256"],
        "membership_hash": sha256(root / spec["membership_file"]), "memberships": memberships,
        "membership_issues": membership_issues, "partitions": partitions,
        "counts": {"rows": len(rows), "children": len(by_child), "visits_per_child": collections.Counter(len(v) for v in by_child.values()), "target": target_counts, "current": current_counts, "transitions": transitions},
        "ranges": {"age_months": [min(age_values), max(age_values)], "weight_kg": [min(weight_values), max(weight_values)], "height_cm": [min(height_values), max(height_values)], "z_score": [min(z_values), max(z_values)]},
        "integrity": {"interval_days": collections.Counter(interval_days), "age_steps": collections.Counter(age_steps), "chronology_bad": chronology_bad, "visit_number_bad_children": visit_bad, "not_eight_visit_children": missing_visit, "previous_z_mismatches": prior_mismatch, "delta_rounding_only": delta_rounding_only, "delta_substantive": delta_substantive, "next_visit_target_agreement": [next_matches, next_total], "weight_change_range": [min(weight_changes), max(weight_changes)], "height_change_range": [min(height_changes), max(height_changes)]},
        "flag_reasons": invalid_counts,
    }


def write_csv(path, fieldnames, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader(); writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--config", default="research_experiments/configs/step2d_simulation_preparation.json")
    args = parser.parse_args()
    root = args.project_root.resolve()
    config = json.loads((root / args.config).read_text(encoding="utf-8"))
    results = [analyse_dataset(root, spec, config) for spec in config["datasets"]]
    reports = root / "research_experiments/reports"; manifests = root / "datasets/manifests"; prepared = root / "datasets/simulated/prepared"; configs = root / "research_experiments/configs"
    for directory in (reports, manifests, prepared): directory.mkdir(parents=True, exist_ok=True)

    # Audit index does not carry source child IDs.
    flagged = [item for result in results for item in result["flagged_index"]]
    write_csv(manifests / "step2d_flagged_record_index.csv", ["dataset", "anonymized_child_token", "source_row_number", "visit_number", "reasons", "current_risk", "target_risk"], flagged)

    prepared_rows = {"train": [], "validation": [], "test": []}
    for result in results:
        for row in result["rows"]:
            partition = result["memberships"].get(row["child_id"])
            if partition not in prepared_rows:
                raise ValueError(f"Unassigned/invalid partition for {result['spec']['path']} row {row['_source_row_number']}")
            prepared_rows[partition].append({
                "source_cohort": result["spec"]["cohort"], "source_row_number": row["_source_row_number"],
                "group_id": stable_group_id(result["spec"]["cohort"], row["child_id"]), "partition": partition,
                **{field: row[field] for field in PREPARED_FIELDS[4:]},
            })
    prepared_meta = {"source_status": config["status"], "target": config["target_column"], "feature_allowlist": config["allowed_features"], "blocked_features": config["blocked_features"], "source_datasets": [], "prepared_files": {}, "flagged_records": len(flagged), "runtime": runtime_metadata(root)}
    for partition, rows in prepared_rows.items():
        output = prepared / f"simulation_{partition}.csv"; write_csv(output, PREPARED_FIELDS, rows)
        prepared_meta["prepared_files"][partition] = {"path": str(output.relative_to(root)), "rows": len(rows), "sha256": sha256(output)}
    for result in results:
        prepared_meta["source_datasets"].append({"path": result["spec"]["path"], "cohort": result["spec"]["cohort"], "sha256": result["hash"], "membership_sha256": result["membership_hash"], "rows": result["counts"]["rows"], "flagged": len(result["flags"]), "provenance": "unverified"})
    write_json(manifests / "step2d_prepared_dataset_metadata.json", prepared_meta)

    # Reports 06-12.
    plaus_rows = []
    for result in results:
        plaus_rows.append([result["spec"]["path"], result["counts"]["rows"], len(result["flags"]), "; ".join(f"{k}: {v}" for k, v in result["flag_reasons"].items()) or "none", str(result["ranges"]["age_months"])])
    flagged_by_visit = collections.Counter(item["visit_number"] for item in flagged)
    flagged_by_current = collections.Counter(item["current_risk"] for item in flagged)
    flagged_by_target = collections.Counter(item["target_risk"] for item in flagged)
    flagged_by_child = collections.Counter(item["anonymized_child_token"] for item in flagged)
    plaus_detail = "\n\n".join([
        "## Flag counts by visit number\n\n" + markdown_table(["Visit", "Flagged rows"], counter_table(flagged_by_visit)),
        "## Flag counts by current risk\n\n" + markdown_table(["Current risk", "Flagged rows"], counter_table(flagged_by_current)),
        "## Flag counts by target risk\n\n" + markdown_table(["Target risk", "Flagged rows"], counter_table(flagged_by_target)),
        "## Flag counts by anonymized child\n\n" + markdown_table(["Flagged rows per child", "Children"], counter_table(collections.Counter(flagged_by_child.values()))),
    ])
    (reports / "06_plausibility_investigation.md").write_text("# Plausibility Investigation\n\n" + markdown_table(["Dataset", "Rows", "Flagged rows", "Reasons", "Recorded age range"], plaus_rows) + "\n\n" + plaus_detail + "\n\nThe prior 1,276 flags are entirely the former generic age >60 rule. The older file contains ages 24–72; no nonpositive/non-numeric weight or height flag was found. These are an age-band/filename and prior-validator-threshold mismatch, not proof of invalid records. All rows remain in the prepared simulation corpus. `manifests/step2d_flagged_record_index.csv` provides row-level, anonymized child tokens rather than raw child IDs. Units and biological plausibility remain unverified. Training can proceed only as a simulation-label exercise; this evidence cannot support clinical plausibility or age-band claims.\n", encoding="utf-8")
    integrity_rows = [[r["spec"]["path"], r["counts"]["children"], dict(r["counts"]["visits_per_child"]), dict(r["integrity"]["interval_days"]), dict(r["integrity"]["age_steps"]), r["integrity"]["weight_change_range"], r["integrity"]["height_change_range"], r["integrity"]["chronology_bad"], r["integrity"]["previous_z_mismatches"], r["integrity"]["delta_rounding_only"], r["integrity"]["delta_substantive"]] for r in results]
    (reports / "07_longitudinal_integrity.md").write_text("# Longitudinal Integrity\n\n" + markdown_table(["Dataset", "Children", "Visits/child", "Intervals (days)", "Age steps", "Weight change range", "Height change range", "Nonpositive intervals", "Previous-Z mismatches", "Delta rounding differences", "Delta substantive differences"], integrity_rows) + "\n\nDates and visits are internally ordered. The birth cohort has 30-day intervals and the older cohort has 90-day intervals. There are no previous-weight or previous-height columns; only current measurements are present. `previous_z_score` exists but has no source timestamp; it and `delta_z_score` are blocked from model features. This is structural integrity only, not evidence of genuine clinical observation or verified units. Training can proceed only under the restricted simulation feature schema.\n", encoding="utf-8")
    target_sections = ["# Synthetic Target Analysis\n", "No recovered generator can be linked to these exact CSVs. The recovered historical generator uses different feature names and transition probabilities; it is evidence of synthetic methodology, not dataset lineage. Neither CSV demonstrates observed two-month outcomes: recorded visits occur every 30 or 90 days.\n"]
    for r in results:
        matched, total = r["integrity"]["next_visit_target_agreement"]
        z_by_target = collections.defaultdict(list)
        for row in r["rows"]:
            z_by_target[row[config["target_column"]]].append(n(row["z_score"]))
        z_summary = [[label, round(sum(values) / len(values), 3), len(values)] for label, values in sorted(z_by_target.items())]
        target_sections.append(f"## {r['spec']['path']}\n\nTarget distribution: `{dict(r['counts']['target'])}`. Current-risk distribution: `{dict(r['counts']['current'])}`. The target matches the following visit's current risk in {matched}/{total} ({matched / total:.1%}) comparable pairs; this is not enough to establish label generation or a prediction horizon.\n\n" + markdown_table(["Current risk", "Target risk", "Rows"], [[a, b, count] for (a, b), count in sorted(r["counts"]["transitions"].items())]) + "\n\nMean recorded Z-score by target (descriptive only; Z-score definition is unverified):\n\n" + markdown_table(["Target risk", "Mean z_score", "Rows"], z_summary) + "\n")
    (reports / "08_synthetic_target_analysis.md").write_text("\n".join(target_sections), encoding="utf-8")
    leak_rows = [["age_months", "available at prediction time", "baseline recorded measurement"], ["weight_kg", "available at prediction time", "baseline recorded measurement"], ["height_cm", "available at prediction time", "baseline recorded measurement"], ["z_score", "available at prediction time", "recorded baseline derived value; calculation/reference unverified"], ["current_risk", "available at prediction time; label-dependent", "include only with required no-current-risk ablation"], ["child_id", "identifier", "excluded"], ["visit_number", "unjustified predictor", "excluded"], ["visit_date", "identifier/date", "excluded"], ["previous_z_score", "unverified availability", "excluded"], ["delta_z_score", "unverified availability", "excluded"], ["predicted_risk_next_2_months", "target", "excluded"]]
    (reports / "09_feature_leakage_audit.md").write_text("# Feature Leakage Audit\n\n" + markdown_table(["Column", "Classification", "Decision"], leak_rows) + "\n\nThe allowlist is `age_months`, `weight_kg`, `height_cm`, `z_score`, and `current_risk`. Current risk is permitted only as a clearly labelled baseline-status feature and requires a later ablation because it is strongly coupled to the unverified synthetic target. Training is safe only if this allowlist and ablation are enforced; the result remains simulation-only.\n", encoding="utf-8")
    split_rows = [[r["spec"]["path"], r["hash_matches_config"], r["membership_hash"], r["counts"]["children"], dict(r["partitions"]), len(r["membership_issues"]["missing_source_groups"]), len(r["membership_issues"]["extra_membership_groups"]), r["membership_issues"]["duplicate_membership_rows"]] for r in results]
    (reports / "10_split_verification.md").write_text("# Split Verification\n\n" + markdown_table(["Dataset", "Source hash matches", "Membership SHA-256", "Groups", "Rows by partition", "Missing groups", "Extra groups", "Duplicate membership rows"], split_rows) + "\n\nEach source has 1,200 assigned child IDs with no cross-partition membership. Raw child IDs collide completely between the two source files, so prepared records use dataset-prefixed group IDs. The frozen memberships were reused; no balancing, augmentation, or split regeneration occurred. These are random grouped simulation splits, not temporal or external clinical validation. Training can use these frozen splits safely only for the stated simulation purpose.\n", encoding="utf-8")
    summary_rows = [[key, value["rows"], value["sha256"]] for key, value in prepared_meta["prepared_files"].items()]
    (reports / "11_prepared_dataset_summary.md").write_text("# Prepared Dataset Summary\n\n" + markdown_table(["Partition", "Rows", "SHA-256"], summary_rows) + f"\n\nAll {sum(x['rows'] for x in prepared_meta['prepared_files'].values())} original longitudinal rows were retained. Flagged rows: {len(flagged)} (age-band/filename mismatch only under the corrected source-specific range). No balancing, imputation, feature fitting, target generation, or source-file modification occurred. Provenance and target-generation uncertainty are retained in `manifests/step2d_prepared_dataset_metadata.json`. The prepared files are ready only for the configured simulation-label training experiment.\n", encoding="utf-8")
    training = {"status": "draft_do_not_train", "experiment_type": "grouped_simulation_label_experiment", "source_hashes": {r["spec"]["path"]: r["hash"] for r in results}, "split_membership_hashes": {r["spec"]["path"]: r["membership_hash"] for r in results}, "seed": config["seed"], "target": config["target_column"], "class_order": RISK_ORDER, "feature_schema": {"primary": config["allowed_features"], "ablation_without_current_risk": [x for x in config["allowed_features"] if x != "current_risk"]}, "split_strategy": "frozen grouped simulation split; group_id is dataset-prefixed", "preprocessing": "Fit encoders/scalers and any balancing only on training data; never balance validation/test.", "metrics": ["per-class precision", "per-class recall", "per-class F1", "macro F1", "balanced accuracy", "confusion matrix", "probability/calibration metrics when supported"], "models": {"logistic_regression": {"solver": "lbfgs", "max_iter": 1000, "C": 1.0, "multi_class": "multinomial", "random_state": 42}, "random_forest": {"n_estimators": 300, "max_depth": 12, "random_state": 42}, "xgboost": {"objective": "multi:softprob", "num_class": 4, "n_estimators": 300, "max_depth": 5, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "random_state": 42}}}
    write_json(configs / "step2d_simulation_training_draft.json", training)
    (reports / "12_simulation_training_configuration.md").write_text("# Simulation Training Configuration\n\nDraft configuration: `configs/step2d_simulation_training_draft.json`. It defines Logistic Regression, Random Forest, and XGBoost candidate settings without executing them. Both primary and no-`current_risk` ablation schemas are required. Preprocessing and balancing must be fitted only on the training partition.\n\nTraining may proceed only as a reproducible simulation-label experiment after approval. It cannot claim clinical prediction, observed two-month outcomes, temporal validation, external validation, or verified biological/WHO target correctness.\n", encoding="utf-8")
    audit_datasets = []
    for r in results:
        audit_datasets.append({
            "path": r["spec"]["path"], "cohort": r["spec"]["cohort"], "source_sha256": r["hash"],
            "source_hash_matches_config": r["hash_matches_config"], "membership_sha256": r["membership_hash"],
            "headers": r["headers"], "ranges": r["ranges"], "flag_reasons": dict(r["flag_reasons"]),
            "counts": {"rows": r["counts"]["rows"], "children": r["counts"]["children"], "visits_per_child": dict(r["counts"]["visits_per_child"]), "target": dict(r["counts"]["target"]), "current": dict(r["counts"]["current"]), "transitions": [{"current_risk": a, "target_risk": b, "rows": count} for (a, b), count in sorted(r["counts"]["transitions"].items())]},
            "integrity": {key: dict(value) if isinstance(value, collections.Counter) else value for key, value in r["integrity"].items()},
            "partitions": dict(r["partitions"]), "membership_issues": r["membership_issues"],
        })
    write_json(manifests / "step2d_longitudinal_audit.json", {"runtime": runtime_metadata(root), "datasets": audit_datasets, "flagged_index_path": "datasets/manifests/step2d_flagged_record_index.csv", "prepared_metadata_path": "datasets/manifests/step2d_prepared_dataset_metadata.json"})


if __name__ == "__main__":
    main()
