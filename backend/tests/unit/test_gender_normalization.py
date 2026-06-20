from backend.utils.gender import normalize_gender, normalize_gender_to_sex, validate_gender


def test_male_formats_normalize_correctly():
    for value in ("male", "Male", "MALE", "M", "m", "boy"):
        assert normalize_gender(value) == "male"
        assert normalize_gender_to_sex(value) == "M"


def test_female_formats_normalize_correctly():
    for value in ("female", "Female", "FEMALE", "F", "f", "girl"):
        assert normalize_gender(value) == "female"
        assert normalize_gender_to_sex(value) == "F"


def test_invalid_gender_returns_validation_error():
    normalized, error = validate_gender("unknown")
    assert normalized is None
    assert error == "Gender must be one of: male, female, M, F, boy, or girl."
