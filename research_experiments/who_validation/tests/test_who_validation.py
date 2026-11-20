"""Isolated standard-library smoke tests for the WHO validation evidence reader."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "research_experiments/who_validation/scripts"))
from who_reference import lms_z, read_xlsx


class OfficialReferenceReaderTests(unittest.TestCase):
    def test_official_wfa_has_non_unit_lms_l(self):
        rows = read_xlsx(ROOT / "research_experiments/who_validation/reference_sources/wfa_boys_0_5_zscores.xlsx")
        self.assertEqual(len(rows), 61)
        self.assertNotEqual(rows[12]["L"], 1)

    def test_lms_median_is_zero(self):
        self.assertLess(abs(lms_z(10.0, -0.35, 10.0, 0.1)), 1e-12)
