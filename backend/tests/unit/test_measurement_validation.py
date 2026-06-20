from datetime import date, timedelta
from types import SimpleNamespace

from backend.utils.current_status import assess_current_nutritional_status
from backend.utils.measurement_validation import validate_measurement_payload


def make_child(*, dob=None, gender="male"):
    return SimpleNamespace(
        dob=dob or date(2022, 1, 1),
        gender=gender,
    )


def test_assessment_works_without_muac_and_edema():
    child = make_child()
    result = validate_measurement_payload(
        {
            "weight_kg": 10.5,
            "height_cm": 80.0,
            "measurement_date": "2023-01-01",
        },
        child,
    )

    assert result["ok"] is True
    assert result["muac_status"] == "Not Recorded"
    assert result["edema_status"] == "Not Recorded"
    assert result["clinical_review_required"] is False


def test_missing_muac_does_not_block_submission_or_trigger_review():
    child = make_child()
    result = validate_measurement_payload(
        {
            "weight_kg": 10.5,
            "height_cm": 80.0,
        },
        child,
    )

    assert result["ok"] is True
    assert result["muac_cm"] is None
    assert result["muac_status"] == "Not Recorded"
    assert result["clinical_review_required"] is False
    assert result["clinical_review_reasons"] == []


def test_missing_edema_returns_not_recorded_without_blocking():
    child = make_child()
    result = validate_measurement_payload(
        {
            "weight_kg": 9.8,
            "height_cm": 78.0,
        },
        child,
    )

    assert result["ok"] is True
    assert result["edema_present"] is None
    assert result["edema_status"] == "Not Recorded"


def test_edema_yes_triggers_clinical_review_and_sam():
    child = make_child()
    validation = validate_measurement_payload(
        {
            "weight_kg": 9.8,
            "height_cm": 78.0,
            "edema": "yes",
        },
        child,
    )
    assessment = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-1.0,
        z_score_wfh=-1.0,
        muac_status=validation["muac_status"],
        edema_status=validation["edema_status"],
    )

    assert validation["ok"] is True
    assert validation["edema_status"] == "Edema Present"
    assert validation["clinical_review_required"] is True
    assert "Bilateral pitting edema recorded." in validation["clinical_review_reasons"]
    assert assessment["current_nutritional_status"] == "SAM"
    assert assessment["clinical_action_required"] is True


def test_invalid_gender_returns_validation_error():
    child = make_child(gender="unknown")
    result = validate_measurement_payload(
        {"weight_kg": 10.0, "height_cm": 78.0},
        child,
    )

    assert result["ok"] is False
    assert "Gender must be Male or Female" in result["error"]


def test_negative_weight_is_rejected():
    child = make_child()
    result = validate_measurement_payload(
        {"weight_kg": -1, "height_cm": 78.0},
        child,
    )

    assert result["ok"] is False
    assert "Weight cannot be negative." in result["error"]


def test_negative_height_is_rejected():
    child = make_child()
    result = validate_measurement_payload(
        {"weight_kg": 10.0, "height_cm": -5},
        child,
    )

    assert result["ok"] is False
    assert "Height/length cannot be negative." in result["error"]


def test_negative_muac_is_rejected_only_when_provided():
    child = make_child()
    missing_muac = validate_measurement_payload(
        {"weight_kg": 10.0, "height_cm": 78.0},
        child,
    )
    negative_muac = validate_measurement_payload(
        {"weight_kg": 10.0, "height_cm": 78.0, "muac_cm": -1},
        child,
    )

    assert missing_muac["ok"] is True
    assert negative_muac["ok"] is False
    assert "MUAC cannot be negative." in negative_muac["error"]


def test_future_dob_is_rejected():
    child = make_child(dob=date.today() + timedelta(days=2))
    result = validate_measurement_payload(
        {"weight_kg": 10.0, "height_cm": 78.0},
        child,
    )

    assert result["ok"] is False
    assert "Date of birth cannot be in the future." in result["error"]


def test_measurement_date_before_dob_is_rejected():
    child = make_child(dob=date(2024, 1, 1))
    result = validate_measurement_payload(
        {
            "weight_kg": 10.0,
            "height_cm": 78.0,
            "measurement_date": "2023-12-01",
        },
        child,
    )

    assert result["ok"] is False
    assert "Measurement date cannot be before date of birth." in result["error"]
