# API Integration Tests

Routes now pass exact age days and the required measurement method and return a validation response before persistence when the calculator rejects input. Full Flask API tests are blocked because `pytest` is not installed in the active environment. Authentication and authorization code was not changed.
