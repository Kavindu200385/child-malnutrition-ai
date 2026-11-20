"""Shared, standard-library-only utilities for isolated research checks."""
from __future__ import annotations

import csv
import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_csv(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader), reader.fieldnames or []


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def runtime_metadata(project_root: Path) -> dict:
    try:
        revision = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=project_root, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        revision = None
    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "python_version": sys.version,
        "platform": platform.platform(),
        "git_revision": revision,
        "dependencies": "Python standard library only; no ML package imported",
    }


def safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def markdown_table(headers, rows):
    text = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for row in rows:
        text.append("| " + " | ".join(str(item).replace("|", "\\|") for item in row) + " |")
    return "\n".join(text)
