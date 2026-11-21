#!/usr/bin/env python3
"""Standard-library regression checks for generated Step 2D research outputs."""
from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class Step2DPreparationTests(unittest.TestCase):
    def test_prepared_counts_and_partitions(self):
        expected = {"train": 13376, "validation": 3040, "test": 2784}
        for partition, expected_rows in expected.items():
            with (ROOT / "datasets/simulated/prepared" / f"simulation_{partition}.csv").open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), expected_rows)
            self.assertTrue(all(row["partition"] == partition for row in rows))
            self.assertTrue(all(row["group_id"].startswith(("birth_to_2_as_recorded:", "older_as_recorded_24_to_72_months:")) for row in rows))

    def test_source_hashes_and_flag_index(self):
        metadata = json.loads((ROOT / "datasets/manifests/step2d_prepared_dataset_metadata.json").read_text())
        self.assertEqual(sum(item["rows"] for item in metadata["prepared_files"].values()), 19200)
        self.assertEqual(metadata["flagged_records"], 1276)
        with (ROOT / "datasets/manifests/step2d_flagged_record_index.csv").open(newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 1276)
        self.assertNotIn("child_id", rows[0])
        self.assertTrue(all(row["anonymized_child_token"] for row in rows))


if __name__ == "__main__":
    unittest.main()
