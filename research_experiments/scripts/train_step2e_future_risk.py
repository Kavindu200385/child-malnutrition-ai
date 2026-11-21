#!/usr/bin/env python3
"""Train isolated, reproducible simulation-label future-risk experiments."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, classification_report,
                             confusion_matrix, f1_score, log_loss, precision_recall_fscore_support)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

CLASSES = ["Low", "Moderate", "High", "Severe"]
CLASS_TO_INT = {name: index for index, name in enumerate(CLASSES)}
NUMERIC = ["age_months", "weight_kg", "height_cm", "z_score"]
FEATURES = {"no_current_risk": NUMERIC, "with_current_risk": NUMERIC + ["current_risk"]}
TARGET = "predicted_risk_next_2_months"
SEED = 42


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_dump(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str) + "\n", encoding="utf-8")


def markdown_table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"] + ["| " + " | ".join(str(value) for value in row) + " |" for row in rows])


def integrity_gate(root: Path, metadata: dict) -> None:
    expected = {"train": 13376, "validation": 3040, "test": 2784}
    all_groups = set()
    for partition, expected_rows in expected.items():
        item = metadata["prepared_files"].get(partition)
        if not item:
            raise RuntimeError(f"Missing manifest for {partition}")
        path = root / item["path"]
        if not path.exists() or sha256(path) != item["sha256"]:
            raise RuntimeError(f"Prepared {partition} hash mismatch")
        # Test is read only after validation selection; validate its bytes/hash and
        # count physical data lines here without parsing target values.
        with path.open("r", encoding="utf-8") as handle:
            actual_rows = sum(1 for _ in handle) - 1
        if actual_rows != expected_rows or actual_rows != item["rows"]:
            raise RuntimeError(f"Unexpected {partition} row count: {actual_rows}")
        if partition == "test":
            # Reading identifiers/partition only does not expose frozen labels.
            groups_frame = pd.read_csv(path, usecols=["group_id", "partition"])
            if set(groups_frame["partition"]) != {"test"}:
                raise RuntimeError("Invalid test partition marker")
            groups = set(groups_frame["group_id"])
            if all_groups & groups:
                raise RuntimeError("A namespaced source group crosses partitions")
            all_groups |= groups
        else:
            frame = pd.read_csv(path)
            required = {"group_id", "partition", *FEATURES["with_current_risk"], TARGET}
            if not required.issubset(frame.columns) or set(frame["partition"]) != {partition}:
                raise RuntimeError(f"Invalid {partition} schema or partition marker")
            if not set(frame[TARGET]).issubset(CLASSES):
                raise RuntimeError(f"Unexpected {partition} target class")
            groups = set(frame["group_id"])
            if all_groups & groups:
                raise RuntimeError("A namespaced source group crosses partitions")
            all_groups |= groups
    if metadata["source_status"] != "simulation_only_unverified_labels":
        raise RuntimeError("Simulation-only provenance marker missing")
    if metadata["flagged_records"] != 1276:
        raise RuntimeError("Older-cohort age discrepancy marker changed")


def preprocessor(feature_set):
    transformers = [("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), NUMERIC)]
    if "current_risk" in feature_set:
        transformers.append(("current_risk", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), ["current_risk"]))
    return ColumnTransformer(transformers=transformers, remainder="drop")


def model_specs():
    return {
        "dummy_majority": lambda: DummyClassifier(strategy="most_frequent"),
        "logistic_regression": lambda: LogisticRegression(C=1.0, max_iter=1000, solver="lbfgs", random_state=SEED),
        "random_forest": lambda: RandomForestClassifier(n_estimators=300, max_depth=12, random_state=SEED, n_jobs=-1),
        "xgboost": lambda: XGBClassifier(objective="multi:softprob", num_class=4, n_estimators=300, max_depth=5, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, random_state=SEED, eval_metric="mlogloss", n_jobs=1),
    }


def metrics(y_true, y_pred, probabilities=None):
    precision, recall, f1, support = precision_recall_fscore_support(y_true, y_pred, labels=list(range(4)), zero_division=0)
    result = {
        "accuracy": float(accuracy_score(y_true, y_pred)), "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "macro_precision": float(np.mean(precision)), "macro_recall": float(np.mean(recall)), "macro_f1": float(f1_score(y_true, y_pred, labels=list(range(4)), average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, labels=list(range(4)), average="weighted", zero_division=0)),
        "high_recall": float(recall[2]), "severe_recall": float(recall[3]),
        "per_class": {CLASSES[i]: {"precision": float(precision[i]), "recall": float(recall[i]), "f1": float(f1[i]), "support": int(support[i])} for i in range(4)},
    }
    if probabilities is not None:
        result["log_loss"] = float(log_loss(y_true, probabilities, labels=list(range(4))))
        result["multiclass_brier"] = float(np.mean(np.sum((probabilities - np.eye(4)[y_true]) ** 2, axis=1)))
    return result


def save_confusion(output: Path, y_true, y_pred, title):
    matrix = confusion_matrix(y_true, y_pred, labels=list(range(4)))
    pd.DataFrame(matrix, index=CLASSES, columns=CLASSES).to_csv(output.with_suffix(".csv"))
    fig, ax = plt.subplots(figsize=(5, 4)); image = ax.imshow(matrix, cmap="Blues")
    ax.set_xticks(range(4), CLASSES); ax.set_yticks(range(4), CLASSES); ax.set_xlabel("Predicted"); ax.set_ylabel("True"); ax.set_title(title)
    for i in range(4):
        for j in range(4): ax.text(j, i, str(matrix[i, j]), ha="center", va="center")
    fig.colorbar(image, ax=ax); fig.tight_layout(); fig.savefig(output.with_suffix(".png"), dpi=200); plt.close(fig)
    return matrix.tolist()


def environment(root: Path):
    try: revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    except Exception: revision = None
    return {"python": sys.version, "platform": platform.platform(), "git_revision": revision, "packages": {"numpy": np.__version__, "pandas": pd.__version__, "scikit_learn": sklearn.__version__, "xgboost": xgboost.__version__, "matplotlib": matplotlib.__version__, "joblib": joblib.__version__}}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--project-root", type=Path, default=Path.cwd()); parser.add_argument("--run-id")
    args = parser.parse_args(); root = args.project_root.resolve()
    metadata = json.loads((root / "datasets/manifests/step2d_prepared_dataset_metadata.json").read_text())
    integrity_gate(root, metadata)
    run_id = args.run_id or "step2e_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = root / "research_experiments/outputs" / run_id; art = root / "research_experiments/artifacts" / run_id
    if out.exists() or art.exists(): raise RuntimeError(f"Run ID already exists: {run_id}")
    for directory in [out, art, out / "classification_reports", out / "confusion_matrices", out / "predictions", out / "figures", out / "model_cards"]: directory.mkdir(parents=True, exist_ok=True)
    train = pd.read_csv(root / metadata["prepared_files"]["train"]["path"]); validation = pd.read_csv(root / metadata["prepared_files"]["validation"]["path"])
    y_train = train[TARGET].map(CLASS_TO_INT).to_numpy(); y_validation = validation[TARGET].map(CLASS_TO_INT).to_numpy()
    env = environment(root); json_dump(out / "environment.json", env)
    json_dump(out / "dataset_manifest.json", metadata)
    (out / "requirements.lock.txt").write_text(subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True), encoding="utf-8")
    config = {"run_id": run_id, "seed": SEED, "class_order": CLASSES, "target": TARGET, "features": FEATURES, "selection": "validation macro-F1; ties: Severe recall, High recall, balanced accuracy, Logistic Regression > Random Forest > XGBoost", "simulation_only": True, "models": {name: str(factory()) for name, factory in model_specs().items()}}
    json_dump(out / "experiment_config.json", config)
    rows, validation_results, training_results, fitted, artifact_records = [], {}, {}, {}, {}
    for schema, feature_set in FEATURES.items():
        for name, factory in model_specs().items():
            pipeline = Pipeline([("preprocessing", preprocessor(feature_set)), ("model", factory())])
            pipeline.fit(train[feature_set], y_train)
            prediction = pipeline.predict(validation[feature_set]).astype(int)
            probability = pipeline.predict_proba(validation[feature_set]) if hasattr(pipeline, "predict_proba") else None
            result = metrics(y_validation, prediction, probability)
            key = f"{schema}__{name}"; result.update({"schema": schema, "model": name, "partition": "validation"}); validation_results[key] = result
            fitted[key] = pipeline
            train_prediction = pipeline.predict(train[feature_set]).astype(int)
            train_probability = pipeline.predict_proba(train[feature_set]) if hasattr(pipeline, "predict_proba") else None
            train_result = metrics(y_train, train_prediction, train_probability)
            train_result.update({"schema": schema, "model": name, "partition": "train_resubstitution"}); training_results[key] = train_result
            artifact_path = art / f"{key}.joblib"; joblib.dump(pipeline, artifact_path)
            artifact_records[key] = {"path": artifact_path.name, "sha256": sha256(artifact_path)}
            pd.DataFrame({"group_id": validation["group_id"], "y_true": validation[TARGET], "y_pred": [CLASSES[i] for i in prediction]}).to_csv(out / "predictions" / f"validation_{key}.csv", index=False)
            (out / "classification_reports" / f"validation_{key}.json").write_text(json.dumps(classification_report(y_validation, prediction, labels=list(range(4)), target_names=CLASSES, output_dict=True, zero_division=0), indent=2), encoding="utf-8")
            save_confusion(out / "confusion_matrices" / f"validation_{key}", y_validation, prediction, f"Validation: {key}")
            rows.append({"schema": schema, "model": name, **{k: result[k] for k in ["accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1", "high_recall", "severe_recall"]}})
    # Persistence reference uses current_risk directly; it is a reference, never a selected ML model.
    persist = validation["current_risk"].map(CLASS_TO_INT).to_numpy(); persist_result = metrics(y_validation, persist); persist_result.update({"schema": "reference", "model": "current_risk_persistence", "partition": "validation"}); validation_results["reference__current_risk_persistence"] = persist_result
    rows.append({"schema": "reference", "model": "current_risk_persistence", **{k: persist_result[k] for k in ["accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1", "high_recall", "severe_recall"]}})
    save_confusion(out / "confusion_matrices" / "validation_reference__current_risk_persistence", y_validation, persist, "Validation: persistence")
    comparison = pd.DataFrame(rows).sort_values(["macro_f1", "severe_recall", "high_recall", "balanced_accuracy"], ascending=False)
    comparison.to_csv(out / "model_comparison.csv", index=False); (out / "model_comparison.md").write_text("# Validation Model Comparison\n\n" + markdown_table(list(comparison.columns), comparison.round(4).values.tolist()) + "\n", encoding="utf-8")
    fig, ax = plt.subplots(figsize=(9, 4))
    labels = [f"{row.schema}\n{row.model}" for row in comparison.itertuples()]
    ax.bar(range(len(comparison)), comparison["macro_f1"], color="#1f77b4")
    ax.set_xticks(range(len(comparison)), labels, rotation=35, ha="right"); ax.set_ylabel("Validation macro-F1"); ax.set_ylim(0, 1); ax.set_title("Simulation-label model comparison")
    fig.tight_layout(); fig.savefig(out / "figures" / "validation_macro_f1_comparison.png", dpi=220); plt.close(fig)
    json_dump(out / "validation_metrics.json", validation_results)
    json_dump(out / "training_metrics.json", training_results)
    candidates = [item for item in rows if item["model"] not in {"dummy_majority", "current_risk_persistence"}]
    order = {"logistic_regression": 0, "random_forest": 1, "xgboost": 2}
    selected = sorted(candidates, key=lambda x: (-x["macro_f1"], -x["severe_recall"], -x["high_recall"], -x["balanced_accuracy"], order[x["model"]]))[0]
    selected_key = f"{selected['schema']}__{selected['model']}"; selected_model = fitted[selected_key]
    # Only now read frozen test labels and evaluate the selected validation winner.
    test = pd.read_csv(root / metadata["prepared_files"]["test"]["path"]); y_test = test[TARGET].map(CLASS_TO_INT).to_numpy()
    if set(test["partition"]) != {"test"} or not set(test[TARGET]).issubset(CLASSES): raise RuntimeError("Invalid test schema")
    test_pred = selected_model.predict(test[FEATURES[selected["schema"]]]).astype(int); test_prob = selected_model.predict_proba(test[FEATURES[selected["schema"]]])
    test_result = metrics(y_test, test_pred, test_prob); test_result.update({"selected_model": selected_key, "partition": "test", "test_opened_after_selection": True})
    json_dump(out / "test_metrics.json", test_result)
    pd.DataFrame({"group_id": test["group_id"], "y_true": test[TARGET], "y_pred": [CLASSES[i] for i in test_pred]}).to_csv(out / "predictions" / f"test_{selected_key}.csv", index=False)
    (out / "classification_reports" / f"test_{selected_key}.json").write_text(json.dumps(classification_report(y_test, test_pred, labels=list(range(4)), target_names=CLASSES, output_dict=True, zero_division=0), indent=2), encoding="utf-8")
    matrix = save_confusion(out / "confusion_matrices" / f"test_{selected_key}", y_test, test_pred, f"Test: {selected_key}")
    json_dump(art / "artifact_manifest.json", {"run_id": run_id, "selected_model": selected_key, "artifacts": artifact_records})
    (out / "model_cards" / f"{selected_key}.md").write_text(f"# Model Card: {selected_key}\n\nThis is a research-only model trained against unverified simulated labels. It is not clinically validated, externally validated, temporally validated, or evidence of two-month clinical prediction. Source provenance, target-generation rules, and observed outcomes remain unavailable.\n", encoding="utf-8")
    # IEEE-ready summaries are deliberately simulation-only.
    reports = root / "research_experiments/reports"
    summary = f"Run `{run_id}` passed the frozen-data integrity gate. Validation selected `{selected_key}` by macro-F1={selected['macro_f1']:.4f}; the frozen test was then evaluated once (macro-F1={test_result['macro_f1']:.4f}). Results are performance against unverified simulated labels, not clinical prediction.\n"
    (reports / "13_future_model_training_results.md").write_text("# Future Model Training Results\n\n" + summary, encoding="utf-8")
    (reports / "14_model_comparison.md").write_text("# Model Comparison\n\n" + (out / "model_comparison.md").read_text() + "\n" + summary, encoding="utf-8")
    ablation = comparison[comparison["model"].isin(["logistic_regression", "random_forest", "xgboost"])].pivot(index="model", columns="schema", values="macro_f1").reset_index()
    (reports / "15_ablation_study.md").write_text("# Current-Risk Ablation\n\n" + markdown_table(list(ablation.columns), ablation.round(4).values.tolist()) + "\n\nCurrent-risk results can reflect synthetic target coupling and are not clinical evidence.\n", encoding="utf-8")
    (reports / "16_reproducibility_verification.md").write_text("# Reproducibility Verification\n\n" + f"Integrity gate passed. Environment, exact package lock, source/prepared hashes, split hashes, configuration, predictions, metrics, confusion matrices, and selected artifact hash are stored in `{out.relative_to(root)}` and `{art.relative_to(root)}`.\n", encoding="utf-8")
    (reports / "17_ieee_results_summary.md").write_text("# IEEE Results Summary\n\n" + summary + "Do not state these values as real-world, clinical, or observed two-month prediction accuracy. The remaining blockers are unverified data provenance, no recovered exact generator, no observed future outcomes, no temporal/external cohort, and no clinician-approved outcome definition.\n", encoding="utf-8")
    print(json.dumps({"run_id": run_id, "output": str(out), "artifact": str(art), "selected_model": selected_key, "validation_macro_f1": selected["macro_f1"], "test_macro_f1": test_result["macro_f1"]}, indent=2))


if __name__ == "__main__":
    main()
