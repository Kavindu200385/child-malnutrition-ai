import pytest

from backend.utils.who_growth import WHOInputError, compute_z_scores


def test_who_growth_scores_are_available_for_valid_measurement():
    wfa, hfa, wfh = compute_z_scores(
        age_days=731, sex="M", weight_kg=12.0, height_cm=87.0,
        measurement_method="standing_height",
    )
    assert all(-5.0 <= score <= 5.0 for score in (wfa, hfa, wfh))


def test_who_growth_rejects_invalid_sex():
    with pytest.raises(WHOInputError):
        compute_z_scores(age_days=731, sex="unknown", weight_kg=12.0, height_cm=87.0, measurement_method="standing_height")


def test_who_growth_rejects_missing_method_and_out_of_range_height():
    with pytest.raises(WHOInputError):
        compute_z_scores(age_days=365, sex="M", weight_kg=8.0, height_cm=75.0, measurement_method=None)
    with pytest.raises(WHOInputError):
        compute_z_scores(age_days=365, sex="M", weight_kg=8.0, height_cm=44.9, measurement_method="recumbent_length")
