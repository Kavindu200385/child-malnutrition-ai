# WAZ Validation Results

Tolerance: absolute difference ≤0.05 z-score. Expected values are recomputed from the matching official sex- and month-specific LMS row.

| Case | Sex | Age | Ht | Wt | Expected | Actual | Abs diff | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low/-2 | M | 12 | 75.7488 | 7.7 | -2.049338 | -2.236 | 0.186662 | FAIL |
| high/+2 | M | 12 | 75.7488 | 12.0 | 2.011041 | 2.7 | 0.688959 | FAIL |
| low/-3 | F | 24 | 86.363 | 8.1 | -2.96217 | -3.185 | 0.22283 | FAIL |

| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |
| --- | --- | --- | --- | --- |
| `backend/utils/who_growth.py:12-36` stores `L=1` for WFA. | At 12 months (boy), observed −2.236 vs verified official −2.049338; at 24 months (girl), observed −3.185 vs verified official −2.962170. Official WFA L is age/sex-specific and non-unit. | Critical | WAZ values and threshold classifications can change. | Replace all sparse WFA entries with the versioned official monthly LMS data and retain L. |

The LMS expression itself (`who_growth.py:112-115`) is structurally correct; the confirmed failure is the incorrect input parameters and sparse interpolation, not the formula branch.
