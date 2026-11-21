#!/usr/bin/env python3
"""Create deterministic simulation-only grouped splits when repeated child IDs exist."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from common import markdown_table, read_csv, runtime_metadata, write_json

SEED = 42


def partition(group_id: str) -> str:
    value = int(hashlib.sha256(f"{SEED}:{group_id}".encode()).hexdigest(), 16) % 100
    return "train" if value < 70 else "validation" if value < 85 else "test"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--config", type=Path, default=Path("datasets/manifests/dataset_registry.json"))
    parser.add_argument("--output-root", type=Path, default=Path("datasets"))
    args = parser.parse_args()
    root = args.project_root.resolve()
    entries = json.loads((root / args.config).read_text(encoding="utf-8"))["datasets"]
    outcomes, report_rows = [], []
    split_dir = root / args.output_root / "splits"
    split_dir.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        path = root / entry["path"]
        group, date = entry.get("id_column"), entry.get("date_column")
        item = {"path": entry["path"], "seed": SEED, "grouping_column": group, "status": "blocked", "reason": None}
        if not path.is_file():
            item["reason"] = "dataset unavailable"
        elif not group or not date:
            item["reason"] = "stable repeated-child IDs with timestamps are not established"
        else:
            rows, headers = read_csv(path)
            if group not in headers or date not in headers:
                item["reason"] = "configured grouping/date column is missing"
            else:
                counts = Counter(row[group] for row in rows)
                if not counts or not all(count > 1 for count in counts.values()):
                    item["reason"] = "repeated child histories are not established"
                else:
                    chronology = 0
                    by_group = defaultdict(list)
                    for row in rows:
                        try: by_group[row[group]].append(datetime.fromisoformat(row[date]))
                        except ValueError: chronology += 1
                    chronology += sum(values != sorted(values) for values in by_group.values())
                    if chronology:
                        item["reason"] = f"chronology validation failed ({chronology} flags)"
                    else:
                        membership = [(entry["path"], gid, partition(gid)) for gid in sorted(counts)]
                        sets = defaultdict(set)
                        for _, gid, part in membership: sets[part].add(gid)
                        overlap = any(sets[a] & sets[b] for a in sets for b in sets if a < b)
                        item.update({"status": "created_simulation_only", "reason": "unverified provenance prevents independent clinical-evaluation claims", "group_count": len(counts), "row_count": len(rows), "partition_groups": {key: len(value) for key, value in sets.items()}, "overlap_count": int(overlap), "temporal_validation": False})
                        name = hashlib.sha256(entry["path"].encode()).hexdigest()[:12] + "_membership.csv"
                        with (split_dir / name).open("w", newline="", encoding="utf-8") as handle:
                            writer = csv.writer(handle); writer.writerow(["dataset_path", "group_id", "partition"]); writer.writerows(membership)
                        item["membership_file"] = str(args.output_root / "splits" / name)
        outcomes.append(item)
        report_rows.append([item["path"], item["status"], item.get("grouping_column") or "none", item.get("group_count", "n/a"), item["reason"] or "none"])
    payload = {"runtime": runtime_metadata(root), "seed": SEED, "policy": "No split is claimed independent or temporal unless source lineage/temporal evidence is available.", "datasets": outcomes}
    write_json(root / args.output_root / "manifests" / "split_integrity.json", payload)
    report = "# Split Integrity Report\n\n" + markdown_table(["Dataset", "Status", "Group column", "Groups", "Reason"], report_rows)
    report += "\n\nMembership files contain group IDs only and are for simulation-only preparation. No static or lineage-unverified dataset is presented as an independent clinical test set. Random grouped allocation is not temporal validation.\n"
    out = root / args.output_root / "reports" / "04_split_integrity_report.md"; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
