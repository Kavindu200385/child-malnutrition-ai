# Corrected Reference Test Results

The original 14 cases are evaluated against an independent oracle that reads the downloaded WHO tables directly; expected values are not obtained from `corrected_who_growth.py`. Tolerance is ≤0.05 z-score.

| Case | Ind | Sex | Age mo | Age d | Method | L/H cm | Wt kg | Reference | Expected | Calculated | Abs diff | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low/-2 | WAZ | M | 12 | None | recumbent_length | 75.7488 | 7.7 | wfa_boys_0_5_zscores.xlsx | -2.049338 | -2.049338 | 0.000000 | PASS |
| high/+2 | WAZ | M | 12 | None | recumbent_length | 75.7488 | 12.0 | wfa_boys_0_5_zscores.xlsx | 2.011041 | 2.011041 | 0.000000 | PASS |
| low/-3 | WAZ | F | 24 | None | standing_height | 86.363 | 8.1 | wfa_girls_0_5_zscores.xlsx | -2.962170 | -2.962170 | 0.000000 | PASS |
| infant low/-2 | HAZ | M | 0 | 0 | recumbent_length | 46.098 | 46.098 | lhfa_boys_expanded.xlsx | -1.999994 | -1.999994 | 0.000000 | PASS |
| 24m low/-3 | HAZ | F | 24 | 730 | recumbent_length | 76.725 | 76.725 | lhfa_girls_expanded.xlsx | -2.999930 | -2.999930 | 0.000000 | PASS |
| 24m high/+2 | HAZ | F | 24 | 730 | recumbent_length | 92.851 | 92.851 | lhfa_girls_expanded.xlsx | 1.999850 | 1.999850 | 0.000000 | PASS |
| lower reference boundary | WLZ | M | 0 | None | recumbent_length | 45.0 | 2.043 | wfl_boys_expanded.xlsx | -2.000480 | -2.000480 | 0.000000 | PASS |
| low/-2 | WLZ | M | 12 | None | recumbent_length | 65.0 | 6.193 | wfl_boys_expanded.xlsx | -1.999927 | -1.999927 | 0.000000 | PASS |
| low/-3 | WLZ | F | 18 | None | recumbent_length | 80.0 | 7.816 | wfl_girls_expanded.xlsx | -2.999888 | -2.999888 | 0.000000 | PASS |
| high/+2 | WLZ | M | 12 | None | recumbent_length | 65.0 | 8.608 | wfl_boys_expanded.xlsx | 1.999882 | 1.999882 | 0.000000 | PASS |
| low/-2 | WHZ | M | 36 | None | standing_height | 90.0 | 11.022 | wfh_boys_expanded.xlsx | -2.000235 | -2.000235 | 0.000000 | PASS |
| low/-3 | WHZ | F | 48 | None | standing_height | 100.0 | 11.747 | wfh_girls_expanded.xlsx | -2.999998 | -2.999998 | 0.000000 | PASS |
| high/+2 | WHZ | M | 36 | None | standing_height | 90.0 | 15.204 | wfh_boys_expanded.xlsx | 2.000283 | 2.000283 | 0.000000 | PASS |
| upper reference boundary | WHZ | F | 59 | None | standing_height | 120.0 | 27.991 | wfh_girls_expanded.xlsx | 2.000049 | 2.000049 | 0.000000 | PASS |

Pass/fail: 14/14 passed; 0/14 failed. Maximum absolute difference: 0.000000000; mean absolute difference: 0.000000000.

Additional independent extreme-value case: | Case | Expected | Calculated | Abs diff | Status |
| --- | --- | --- | --- | --- |
| extended z below -3 | -3.625000 | -3.625000 | 0.000000 | PASS |
