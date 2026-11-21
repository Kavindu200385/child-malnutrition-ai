# WLZ/WHZ Validation Results

Tolerance: absolute difference ≤0.05 z-score. WLZ cases use official WFL rows and WHZ cases use official WFH rows.

| Case | Sex | Age | Ht | Wt | Expected | Actual | Abs diff | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lower reference boundary | M | 0 | 45 | 2.043 | -2.00048 | -1.776 | 0.22448 | FAIL |
| low/-2 | M | 12 | 65 | 6.193 | -1.999927 | -0.538 | 1.461927 | FAIL |
| low/-3 | F | 18 | 80 | 7.816 | -2.999888 | -1.926 | 1.073888 | FAIL |
| high/+2 | M | 12 | 65 | 8.608 | 1.999882 | 3.561 | 1.561118 | FAIL |
| low/-2 | M | 36 | 90 | 11.022 | -2.000235 | 0.473 | 2.473235 | FAIL |
| low/-3 | F | 48 | 100 | 11.747 | -2.999998 | -0.811 | 2.188998 | FAIL |
| high/+2 | M | 36 | 90 | 15.204 | 2.000283 | 4.753 | 2.752717 | FAIL |
| upper reference boundary | F | 59 | 120 | 27.991 | 2.000049 | 5.0 | 2.999951 | FAIL |

| Confirmed issue | Evidence | Severity | Scientific implication | Required correction |
| --- | --- | --- | --- | --- |
| `backend/utils/who_growth.py:58-109` labels one 45–110 cm table as WFH and hard-codes `L=1`. | All eight official WLZ/WHZ cases failed, including both reference boundaries; absolute differences span 0.224480–2.999951. Official WFL/WFH L is non-unit (for example, −0.3521 in the boy rows tested). | Critical | Wasting classification can be substantially wrong. | Store full, separately versioned official WFL and WFH LMS tables with their published L, M, S values. |
| `backend/utils/who_growth.py:154-158` always selects that single table by height. | A 65-cm length, 90-cm height, and 100-cm height all use the same local table regardless of method or age. | Critical | WLZ and WHZ are conflated, so clinical threshold statements are unsupported. | Require a valid method, select WFL versus WFH accordingly, and implement the applicable WHO adjustment/eligibility rules. |
