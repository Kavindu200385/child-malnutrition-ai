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
