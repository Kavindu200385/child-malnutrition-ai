import pytest

from backend.utils.who_growth import compute_z_scores


def test_who_growth_scores_are_available_for_valid_measurement():
    wfa, hfa, wfh = compute_z_scores(
        age_months=24, sex="M", weight_kg=12.0, height_cm=87.0
    )
    assert all(-5.0 <= score <= 5.0 for score in (wfa, hfa, wfh))


def test_who_growth_rejects_invalid_sex():
    with pytest.raises(ValueError):
        compute_z_scores(age_months=24, sex="unknown", weight_kg=12.0, height_cm=87.0)
