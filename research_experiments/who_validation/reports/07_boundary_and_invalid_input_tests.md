# Boundary and Invalid Input Tests

| Case | Raises | Observed |
| --- | --- | --- |
| invalid_sex | True | Gender must be one of: male, female, M, F, boy, or girl. |
| negative_age | False | (5.0, 5.0, 0.813) |
| over_60_months | False | (-0.113, 0.153, 1.885) |
| zero_weight | False | (-5.0, -0.315, -5.0) |
| height_below_wfh_table | False | (-1.892, -5.0, 5.0) |
| height_above_wfh_table | False | (-0.715, 2.289, -0.265) |

| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |
| --- | --- | --- | --- | --- |
| `backend/utils/who_growth.py:125-128` clamps unsupported ages. | Negative age and 61 months returned apparently valid scores rather than an explicit unsupported-input outcome. | High | Results outside the supported WHO age range may be treated as valid. | Validate age before lookup and return an explicit non-score/error outside approved bounds. |
| `backend/utils/who_growth.py:155-163` clamps height and clips score magnitude. | 44 cm and 111 cm returned scores after table clamping; zero weight returned `(-5.0, -0.315, -5.0)`. | Critical | Out-of-domain or nonpositive inputs can become plausible-looking clinical results. | Reject nonpositive and reference-ineligible anthropometry; retain raw validation errors rather than clip to ±5. |
| `backend/utils/measurement_validation.py:130-134` validates a method but callers at `midwife.py:332-334`, `moh.py:143-145`, and `nutritionist.py:295` do not pass it to the calculator. | The method cannot affect WFL/WFH reference selection. | High | The wrong reference can be applied even after a user supplies a valid method. | Propagate method to an updated calculator and reject absent method where indicator selection requires it. |

Route-level validation rejects zero/negative weight or height (`measurement_validation.py:98-110`) and invalid sex, but values merely outside its 1–40 kg / 30–130 cm review ranges remain admissible. The calculator itself must therefore enforce WHO reference eligibility.
