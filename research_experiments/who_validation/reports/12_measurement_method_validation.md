# Measurement-Method and Invalid-Input Validation

WHO guidance recommends recumbent length before 731 days and standing height from 731 days, adding 0.7 cm when standing height is supplied below 24 months and subtracting 0.7 cm when recumbent length is supplied at or above 24 months. The isolated calculator follows those rules and rejects standing measurements below nine months.

| Case | Expected ind/error | Actual ind | Expected cm | Actual cm | Abs diff | Status |
| --- | --- | --- | --- | --- | --- | --- |
| standing height converted to length at 730 days | WFL | WFL | 65.0 | 65.0 | 0.0 | PASS |
| recumbent length converted to height at 731 days | WFH | WFH | 90.0 | 90.0 | 0.0 | PASS |
| invalid sex | error |  |  |  |  | PASS |
| age over 60-month reference | error |  |  |  |  | PASS |
| zero weight | error |  |  |  |  | PASS |
| WFL below official boundary | error |  |  |  |  | PASS |
| WFH above official boundary | error |  |  |  |  | PASS |
| standing measurement under nine months | error |  |  |  |  | PASS |
| unknown method | error |  |  |  |  | PASS |

Method tests: 2/2 passed. Invalid-input tests: 7/7 correctly raised `WHOInputError`.
