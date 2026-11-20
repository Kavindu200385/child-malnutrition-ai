"""Minimal standard-library reader for independently downloaded WHO XLSX tables."""
from __future__ import annotations

import math
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _column(ref: str) -> int:
    letters = re.match(r"([A-Z]+)", ref).group(1)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def read_xlsx(path: Path) -> list[dict[str, float]]:
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS):
                strings.append("".join(node.itertext()))
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows = []
    for row in root.findall(".//m:row", NS):
        values = {}
        for cell in row.findall("m:c", NS):
            raw = cell.find("m:v", NS)
            if raw is None:
                continue
            value = strings[int(raw.text)] if cell.get("t") == "s" else raw.text
            values[_column(cell.get("r"))] = value
        if values:
            rows.append([values.get(i, "") for i in range(max(values) + 1)])
    headers = [str(value) for value in rows[0]]
    return [{headers[i]: float(value) for i, value in enumerate(row) if i < len(headers) and value != ""} for row in rows[1:]]


def lms_z(value: float, l: float, m: float, s: float) -> float:
    return math.log(value / m) / s if l == 0 else ((value / m) ** l - 1) / (l * s)


def nearest(rows: list[dict[str, float]], key: str, point: float) -> dict[str, float]:
    return min(rows, key=lambda row: abs(row[key] - point))
