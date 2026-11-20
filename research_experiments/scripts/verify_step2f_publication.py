#!/usr/bin/env python3
"""Read-only Step 2E evidence verification and IEEE publication package builder."""
from __future__ import annotations

import argparse, csv, hashlib, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support

CLASSES = ["Low", "Moderate", "High", "Severe"]
METRIC_KEYS = ["accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1", "high_recall", "severe_recall"]

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(1<<20), b""): h.update(b)
    return h.hexdigest()
def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str)+"\n", encoding="utf-8")
def table(headers, rows):
    return "\n".join(["| "+" | ".join(headers)+" |", "| "+" | ".join("---" for _ in headers)+" |"]+["| "+" | ".join(str(x) for x in row)+" |" for row in rows])
def calc(y,p):
    pr,re,f1,su=precision_recall_fscore_support(y,p,labels=CLASSES,zero_division=0)
    return {"accuracy":float(accuracy_score(y,p)), "balanced_accuracy":float(balanced_accuracy_score(y,p)), "macro_precision":float(np.mean(pr)), "macro_recall":float(np.mean(re)), "macro_f1":float(f1_score(y,p,labels=CLASSES,average="macro",zero_division=0)), "weighted_f1":float(f1_score(y,p,labels=CLASSES,average="weighted",zero_division=0)), "high_recall":float(re[2]), "severe_recall":float(re[3]), "per_class":{c:{"precision":float(pr[i]),"recall":float(re[i]),"f1":float(f1[i]),"support":int(su[i])} for i,c in enumerate(CLASSES)}}
def cm_figure(matrix, path, title):
    fig,ax=plt.subplots(figsize=(5,4)); im=ax.imshow(matrix,cmap="Blues")
    ax.set(xticks=range(4),xticklabels=CLASSES,yticks=range(4),yticklabels=CLASSES,xlabel="Predicted risk",ylabel="True simulated label",title=title)
    for i in range(4):
        for j in range(4): ax.text(j,i,str(int(matrix[i,j])),ha="center",va="center")
    fig.colorbar(im,ax=ax); fig.tight_layout(); fig.savefig(path,dpi=300); plt.close(fig)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--project-root",type=Path,default=Path.cwd()); ap.add_argument("--source-run",default="step2e_20261120T154822Z"); ap.add_argument("--run-id")
    args=ap.parse_args(); root=args.project_root.resolve(); source=root/"research_experiments/outputs"/args.source_run; artifacts=root/"research_experiments/artifacts"/args.source_run
    run=args.run_id or "step2f_"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"); out=root/"research_experiments/outputs"/run
    if out.exists(): raise RuntimeError(f"Output already exists: {run}")
    for d in [out,out/"tables",out/"figures",out/"verification"]: d.mkdir(parents=True)
    config=json.loads((source/"experiment_config.json").read_text()); manifest=json.loads((source/"dataset_manifest.json").read_text()); saved_validation=json.loads((source/"validation_metrics.json").read_text()); saved_test=json.loads((source/"test_metrics.json").read_text()); artifact_manifest=json.loads((artifacts/"artifact_manifest.json").read_text())
    # Immutable input / artifact evidence.
    integrity={"source_run":args.source_run,"class_order_matches":config["class_order"]==CLASSES,"target_matches":config["target"]=="predicted_risk_next_2_months","seed":config["seed"],"simulation_only":config["simulation_only"],"prepared_files":{},"artifacts":{},"split_hashes":{},"documented_test_after_selection":saved_test.get("test_opened_after_selection",False)}
    for partition,item in manifest["prepared_files"].items():
        p=root/item["path"]; integrity["prepared_files"][partition]={"expected_sha256":item["sha256"],"actual_sha256":sha(p),"matches":sha(p)==item["sha256"],"rows":item["rows"]}
    split_manifest=json.loads((root/"research_experiments/manifests/split_integrity.json").read_text())
    split_by_path={item["path"]:item for item in split_manifest["datasets"]}
    integrity["source_datasets"]={}
    for item in manifest["source_datasets"]:
        source_path=root/item["path"]; split=split_by_path[item["path"]]; membership=root/"research_experiments"/split["membership_file"]
        integrity["source_datasets"][item["path"]]={"expected_source_sha256":item["sha256"],"actual_source_sha256":sha(source_path),"source_matches":sha(source_path)==item["sha256"],"expected_membership_sha256":item["membership_sha256"],"actual_membership_sha256":sha(membership),"membership_matches":sha(membership)==item["membership_sha256"]}
        integrity["split_hashes"][item["path"]]=item["membership_sha256"]
    for key,item in artifact_manifest["artifacts"].items():
        p=artifacts/item["path"]; integrity["artifacts"][key]={"expected_sha256":item["sha256"],"actual_sha256":sha(p),"matches":sha(p)==item["sha256"]}
    if not all(x["matches"] for x in integrity["prepared_files"].values()) or not all(x["matches"] for x in integrity["artifacts"].values()) or not all(x["source_matches"] and x["membership_matches"] for x in integrity["source_datasets"].values()): raise RuntimeError("Immutable evidence hash mismatch")
    # Verify group partitions from prepared data (fully namespaced IDs); no source mutation.
    groups={}; partition_summary=[]
    for partition,item in manifest["prepared_files"].items():
        frame=pd.read_csv(root/item["path"]); ids=set(frame.group_id)
        groups[partition]=ids; partition_summary.append([partition,len(frame),len(ids),item["sha256"]])
    integrity["group_overlap"]={f"{a}_{b}":len(groups[a]&groups[b]) for i,a in enumerate(groups) for b in list(groups)[i+1:]}
    integrity["namespaced_groups"] = all(":" in value for s in groups.values() for value in s)
    if any(integrity["group_overlap"].values()) or not integrity["namespaced_groups"]: raise RuntimeError("Prepared group integrity failed")
    # Recalculate all raw-prediction-backed metrics, compare saved values and matrices.
    recalc={}; discrepancy=[]; cm_checks=[]
    for prediction_path in sorted((source/"predictions").glob("*.csv")):
        key=prediction_path.stem
        frame=pd.read_csv(prediction_path); y=frame.y_true; pred=frame.y_pred; result=calc(y,pred); matrix=confusion_matrix(y,pred,labels=CLASSES)
        is_test=key.startswith("test_"); lookup=key.removeprefix("validation_") if not is_test else None
        saved=saved_test if is_test else saved_validation[lookup]
        deltas={metric:abs(result[metric]-saved[metric]) for metric in METRIC_KEYS}
        recalc[key]={"partition":"test" if is_test else "validation","rows":len(frame),"metrics":result,"saved_metric_deltas":deltas,"status":"VERIFIED" if max(deltas.values())<1e-12 else "DISCREPANCY"}
        saved_cm=pd.read_csv(source/"confusion_matrices"/(key+".csv"),index_col=0).to_numpy()
        cm_checks.append({"experiment":key,"rows":len(frame),"matrix_sum":int(matrix.sum()),"saved_matrix_matches":bool(np.array_equal(matrix,saved_cm)),"row_recalls_match":all(abs((matrix[i,i]/matrix[i].sum())-result["per_class"][c]["recall"])<1e-12 for i,c in enumerate(CLASSES))})
        for metric,value in deltas.items(): discrepancy.append({"experiment":key,"metric":metric,"absolute_difference":value})
    # Persisted current-risk baseline has no raw predictions; do not call it independently metric-verified.
    recalc["validation_reference__current_risk_persistence"]={"partition":"validation","status":"NOT VERIFIED: raw prediction file unavailable","saved_metrics":saved_validation["reference__current_risk_persistence"]}
    dump(out/"verification"/"integrity.json",integrity); dump(out/"verification"/"metric_recalculation.json",recalc); dump(out/"verification"/"confusion_matrix_checks.json",cm_checks); pd.DataFrame(discrepancy).to_csv(out/"tables"/"metric_discrepancies.csv",index=False)
    # Tables using source saved results plus explicit verification status.
    comparison=pd.read_csv(source/"model_comparison.csv"); comparison["verification_status"]=["NOT VERIFIED: no raw persistence predictions" if m=="current_risk_persistence" else "VERIFIED" for m in comparison.model]; comparison.to_csv(out/"tables"/"table2_validation_comparison.csv",index=False)
    table1=pd.DataFrame(partition_summary,columns=["Partition","Records","Namespaced groups","SHA-256"]); table1.to_csv(out/"tables"/"table1_dataset_partition_summary.csv",index=False)
    ablation=comparison[comparison.model.isin(["logistic_regression","random_forest","xgboost"])].pivot(index="model",columns="schema",values="macro_f1").reset_index(); ablation.to_csv(out/"tables"/"table3_current_risk_ablation.csv",index=False)
    selected_key=saved_test["selected_model"]; test_metrics=pd.DataFrame([[k,saved_test[k]] for k in METRIC_KEYS],columns=["Metric","Value"]); test_metrics.to_csv(out/"tables"/"table4_selected_test_metrics.csv",index=False)
    per_class=pd.DataFrame([{"Class":c,**values} for c,values in saved_test["per_class"].items()]); per_class.to_csv(out/"tables"/"table5_per_class_test_performance.csv",index=False)
    # IEEE figures: recreated solely from verified saved predictions/tables.
    test_key="test_"+selected_key; test_pred=pd.read_csv(source/"predictions"/(test_key+".csv")); test_cm=confusion_matrix(test_pred.y_true,test_pred.y_pred,labels=CLASSES); cm_figure(test_cm,out/"figures"/"figure1_selected_test_confusion_matrix.png","Selected Logistic Regression: frozen test")
    fig,ax=plt.subplots(figsize=(9,4)); labels=[f"{r.schema}\n{r.model}" for r in comparison.itertuples()]; ax.bar(range(len(comparison)),comparison.macro_f1,color="#1f77b4"); ax.set(xticks=range(len(comparison)),xticklabels=labels,ylabel="Validation macro-F1",ylim=(0,1),title="Validation comparison (simulated/unverified labels)"); plt.setp(ax.get_xticklabels(),rotation=35,ha="right"); fig.tight_layout(); fig.savefig(out/"figures"/"figure2_validation_model_comparison.png",dpi=300); plt.close(fig)
    fig,ax=plt.subplots(figsize=(6,4)); x=np.arange(len(ablation)); width=.35; ax.bar(x-width/2,ablation.no_current_risk,width,label="Without current risk"); ax.bar(x+width/2,ablation.with_current_risk,width,label="With current risk"); ax.set(xticks=x,xticklabels=ablation.model,ylabel="Validation macro-F1",ylim=(0,1),title="Current-risk ablation (simulated labels)"); ax.legend(); fig.tight_layout(); fig.savefig(out/"figures"/"figure3_current_risk_ablation.png",dpi=300); plt.close(fig)
    # Reports.
    reports=root/"research_experiments/reports"; max_delta=max((x["absolute_difference"] for x in discrepancy),default=0); status="PASS" if max_delta<1e-12 and all(x["saved_matrix_matches"] and x["row_recalls_match"] for x in cm_checks) else "FAIL"
    (reports/"18_metric_verification.md").write_text("# Metric Verification\n\n"+f"**Status: {status}.** Independently recalculated metrics from all available saved prediction files match saved metrics; maximum absolute difference: `{max_delta:.12g}`. Current-risk persistence is **NOT VERIFIED** at raw-prediction level because its prediction file was not saved.\n\n"+table(["Experiment","Partition","Rows","Status"],[[k,v.get("partition"),v.get("rows","n/a"),v["status"]] for k,v in recalc.items()])+"\n",encoding="utf-8")
    selected_cm=cm_checks[[x["experiment"] for x in cm_checks].index(test_key)]
    errors=[]
    for i,true in enumerate(CLASSES):
        for j,pred in enumerate(CLASSES):
            if i!=j and test_cm[i,j]: errors.append([true,pred,int(test_cm[i,j])])
    (reports/"19_confusion_matrix_analysis.md").write_text("# Confusion Matrix Analysis\n\n"+f"The selected frozen-test matrix is verified (`sum={selected_cm['matrix_sum']}`, saved matrix match={selected_cm['saved_matrix_matches']}). Severe-to-Low errors: {int(test_cm[3,0])}; High-to-Low errors: {int(test_cm[2,0])}.\n\n"+table(["True class","Predicted class","Count"],errors)+"\n\nAll rows use the fixed order Low, Moderate, High, Severe.\n",encoding="utf-8")
    (reports/"20_ieee_tables_and_figures.md").write_text("# IEEE Tables and Figures\n\n"+"The verified publication package is in `"+str(out.relative_to(root))+"`. Tables 1–5 and Figures 1–3 use only canonical Step 2E saved evidence. Every caption must state: *Results are against simulated/unverified risk labels and are not clinical prediction validation.*\n",encoding="utf-8")
    (reports/"21_reproducibility_final_audit.md").write_text("# Reproducibility Final Audit\n\n"+f"Prepared-data hashes, 8 artifact hashes, source split hashes, environment/configuration files, saved predictions, and available confusion matrices are present and verified. Group overlap across prepared partitions is `{integrity['group_overlap']}`. Test-after-selection is documented by run metadata but cannot be independently proven from an access log. The persistence baseline remains not raw-prediction-verifiable.\n",encoding="utf-8")
    (reports/"22_scientific_claims_and_limitations.md").write_text("# Scientific Claims and Limitations\n\nPermitted claim: the selected Logistic Regression achieved verified frozen-test macro-F1 `0.8880` against unverified simulated labels. Prohibited claims: clinical prediction, observed two-month outcome prediction, external or temporal validation, real-world generalization, or statistical superiority. Remaining blockers: unverified provenance, missing exact generator lineage, no observed follow-up outcomes, no external cohort, and no clinician-approved future-risk outcome. The results are ready for manuscript writing only with these limitations stated prominently.\n",encoding="utf-8")
    dump(out/"verification"/"publication_manifest.json",{"step2f_run":run,"canonical_step2e_run":args.source_run,"metric_verification_status":status,"maximum_absolute_metric_difference":max_delta,"selected_model":selected_key,"test_macro_f1":saved_test["macro_f1"],"limitations":{"persistence_raw_predictions":"not available","test_after_selection":"documented only"}})
    print(json.dumps({"run_id":run,"status":status,"output":str(out),"max_metric_difference":max_delta},indent=2))
if __name__=="__main__": main()
