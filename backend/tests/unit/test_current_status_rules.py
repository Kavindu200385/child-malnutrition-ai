from datetime import datetime

from backend.models_hierarchical import Measurement
from backend.utils.current_status import assess_current_nutritional_status
from backend.utils.risk_status import normalize_current_status


def test_edema_has_highest_priority():
    result = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-1.0,
        z_score_wfh=-1.0,
        muac_status="NORMAL",
        edema_status="Edema Present",
    )
    assert result["current_nutritional_status"] == "SAM"


def test_wasting_sam_maps_to_current_sam():
    result = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-1.0,
        z_score_wfh=-3.2,
        muac_status="NORMAL",
        edema_status="No Edema",
    )
    assert result["wasting_status"] == "SAM"
    assert result["current_nutritional_status"] == "SAM"


def test_underweight_not_merged_into_mam():
    result = assess_current_nutritional_status(
        z_score_wfa=-2.4,
        z_score_hfa=-1.0,
        z_score_wfh=-1.0,
        muac_status="NORMAL",
        edema_status="No Edema",
    )
    assert result["underweight_status"] == "UNDERWEIGHT"
    assert result["current_nutritional_status"] == "UNDERWEIGHT"
    assert result["legacy_risk_level"] == "NORMAL"


def test_severe_stunting_not_merged_into_sam():
    result = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-3.4,
        z_score_wfh=-1.0,
        muac_status="NORMAL",
        edema_status="No Edema",
    )
    assert result["stunting_status"] == "SEVERE STUNTING"
    assert result["current_nutritional_status"] == "SEVERE STUNTING"
    assert result["legacy_risk_level"] == "NORMAL"


def test_muac_warning_can_drive_mam_without_wasting():
    result = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-1.0,
        z_score_wfh=-1.0,
        muac_status="MAM Warning",
        edema_status="No Edema",
    )
    assert result["current_nutritional_status"] == "MAM"


def test_missing_muac_and_edema_stay_not_recorded():
    result = assess_current_nutritional_status(
        z_score_wfa=-1.0,
        z_score_hfa=-1.0,
        z_score_wfh=-1.0,
        muac_status=None,
        edema_status=None,
    )
    assert result["muac_status"] == "Not Recorded"
    assert result["edema_status"] == "Not Recorded"
    assert result["current_nutritional_status"] == "NORMAL"
    assert result["clinical_action_required"] is False


def test_declining_is_never_a_current_status():
    assert normalize_current_status("DECLINING") == "NEEDS CLINICAL REVIEW"


def test_legacy_measurement_breakdown_is_reconstructed_from_saved_z_scores(
    db,
    assigned_child,
    midwife_user,
):
    measurement = Measurement(
        child_id=assigned_child.id,
        measurement_date=datetime(2026, 6, 16),
        weight_kg=8.0,
        height_cm=75.0,
        z_score_wfa=-2.4,
        z_score_hfa=-1.0,
        z_score_wfh=-3.2,
        risk_level="SAM",
        current_nutritional_status="SAM",
        measured_by_user_id=midwife_user.id,
    )
    db.session.add(measurement)
    db.session.flush()

    summary = assigned_child.latest_assessment_summary()

    assert summary["current_nutritional_status"] == "SAM"
    assert summary["underweight_status"] == "UNDERWEIGHT"
    assert summary["stunting_status"] == "NORMAL"
    assert summary["wasting_status"] == "SAM"
    assert summary["muac_status"] == "Not Recorded"
    assert summary["edema_status"] == "Not Recorded"
    assert summary["current_status_breakdown"]["wasting_status"] == "SAM"


def test_legacy_measurement_breakdown_can_be_reconstructed_from_raw_measurements(
    db,
    assigned_child,
    midwife_user,
):
    measurement = Measurement(
        child_id=assigned_child.id,
        measurement_date=datetime(2023, 1, 1),
        weight_kg=10.5,
        height_cm=80.0,
        risk_level="SAM",
        current_nutritional_status="SAM",
        measured_by_user_id=midwife_user.id,
    )
    db.session.add(measurement)
    db.session.flush()

    summary = assigned_child.latest_assessment_summary()

    assert summary["underweight_status"] != "NOT AVAILABLE"
    assert summary["stunting_status"] != "NOT AVAILABLE"
    assert summary["wasting_status"] != "NOT AVAILABLE"
    assert summary["current_status_breakdown"] is not None
