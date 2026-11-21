# HAZ/LHFA Validation Results

Tolerance: absolute difference ≤0.05 z-score. The cases use official day-specific LHFA rows, including the 24-month boundary.

| Case | Sex | Age | Ht | Wt | Expected | Actual | Abs diff | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| infant low/-2 | M | 0 | 46.098 | 46.098 | -1.999994 | -2.0 | 6e-06 | PASS |
| 24m low/-3 | F | 24 | 76.725 | 76.725 | -2.99993 | -3.372 | 0.37207 | FAIL |
| 24m high/+2 | F | 24 | 92.851 | 92.851 | 1.99985 | 2.27 | 0.27015 | FAIL |

| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |
| --- | --- | --- | --- | --- |
| `backend/utils/who_growth.py:48-56` contains a mismatched, sparse LHFA female table. | At 24 months (day 730, girl), observed −3.372 vs verified official −2.999930. The local S=0.0331 differs from the official S=0.03733. | High | A child at an official −3 threshold is assigned a materially different HAZ, potentially changing severity. | Use the complete official daily/monthly LHFA LMS tables, preserving all parameters. |
| `backend/utils/who_growth.py:141-165` has no recumbent-length/standing-height input or selection rule. | The function only receives `height_cm`; official references distinguish length and height. | High | Method-dependent measurements cannot be assessed against the proper standard. | Carry the validated measurement method into the calculator and explicitly select/adjust the relevant WHO reference. |

The birth-boy anchor passed (difference 0.000006), but one matching point does not validate the trimmed table across the supported range.
