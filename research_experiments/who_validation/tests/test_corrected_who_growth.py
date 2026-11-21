"""Isolated regression tests for the corrected WHO calculator."""
import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from research_experiments.who_validation.corrected_who_growth import (  # noqa: E402
    WHOInputError,
    calculate_growth_z_scores,
    calculate_waz,
    calculate_wlz,
    calculate_whz,
    classify_anthropometric_indicators,
)
from research_experiments.who_validation.scripts.who_reference import read_xlsx  # noqa: E402

REFERENCES = ROOT / "research_experiments/who_validation/references"


def row(filename, key, point):
    return next(item for item in read_xlsx(REFERENCES / filename) if item[key] == point)


def oracle_lms(value, source):
    l_value, median, sigma = source["L"], source["M"], source["S"]
    z_score = math.log(value / median) / sigma if l_value == 0 else ((value / median) ** l_value - 1) / (l_value * sigma)
    if z_score > 3:
        return 3 + (value - source["SD3"]) / (source["SD3"] - source["SD2"])
    if z_score < -3:
        return -3 + (value - source["SD3neg"]) / (source["SD2neg"] - source["SD3neg"])
    return z_score


class CorrectedWHOTests(unittest.TestCase):
    def test_waz_uses_official_nonunit_l(self):
        source = row("wfa_boys_0_5_zscores.xlsx", "Month", 12.0)
        expected = oracle_lms(source["SD2neg"], source)
        self.assertLess(abs(calculate_waz(age_months=12, sex="M", weight_kg=source["SD2neg"]) - expected), 0.05)

    def test_wlz_and_whz_use_distinct_references(self):
        wfl = row("wfl_boys_expanded.xlsx", "Length", 65.0)
        wfh = row("wfh_boys_expanded.xlsx", "Height", 90.0)
        self.assertLess(abs(calculate_wlz(sex="M", weight_kg=wfl["SD2neg"], recumbent_length_cm=65) - oracle_lms(wfl["SD2neg"], wfl)), 0.05)
        self.assertLess(abs(calculate_whz(sex="M", weight_kg=wfh["SD2neg"], standing_height_cm=90) - oracle_lms(wfh["SD2neg"], wfh)), 0.05)

    def test_transition_adjusts_method_and_selects_reference(self):
        under_24 = calculate_growth_z_scores(age_months=24, age_days=730, sex="M", weight_kg=6.193, length_height_cm=64.3, measurement_method="standing_height")
        over_24 = calculate_growth_z_scores(age_months=24, age_days=731, sex="M", weight_kg=11.022, length_height_cm=90.7, measurement_method="recumbent_length")
        self.assertEqual((under_24["length_height_indicator"], under_24["adjusted_length_height_cm"]), ("WFL", 65.0))
        self.assertEqual((over_24["length_height_indicator"], over_24["adjusted_length_height_cm"]), ("WFH", 90.0))

    def test_unsupported_inputs_raise_instead_of_clamping(self):
        with self.assertRaises(WHOInputError):
            calculate_growth_z_scores(age_months=61, age_days=1857, sex="M", weight_kg=8, length_height_cm=90, measurement_method="standing_height")
        with self.assertRaises(WHOInputError):
            calculate_growth_z_scores(age_months=12, age_days=365, sex="M", weight_kg=0, length_height_cm=75, measurement_method="recumbent_length")
        with self.assertRaises(WHOInputError):
            calculate_wlz(sex="M", weight_kg=8, recumbent_length_cm=44.9)

    def test_classification_is_independent_and_not_diagnostic(self):
        statuses = classify_anthropometric_indicators(waz=-2.5, haz=-3.5, wlz=-2.5)
        self.assertEqual(statuses, {"underweight": "underweight", "stunting": "severe_stunting", "wasting": "wasting"})

