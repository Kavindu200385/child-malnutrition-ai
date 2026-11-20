# IEEE WHO Validation Summary

Official WHO source files were obtained and 14 independent LMS cases were executed; 13 exceeded the declared 0.05 z-score tolerance. WAZ failed 3/3; HAZ failed 2/3; WLZ failed 4/4; WHZ failed 4/4.

The active implementation is **not validated for IEEE clinical-performance claims**. Confirmed issues are incorrect WFA LMS L values; a mismatched sparse LHFA parameter; conflated WFL/WFH data with incorrect L values; missing method selection; and silent clamping/clipping of unsupported inputs. The classification breakdown supports overlapping indicators, but its MAM/SAM wording requires clinical-governance review because the underlying WFL/WFH calculation is not valid.

Reference coverage remains incomplete in production: the official 0–60-month tables are not fully represented, the WFL/WFH distinction is absent, and the calculator does not handle recumbent length versus standing height. The deterministic WHO assessment must not be described as clinically validated until the correction plan is implemented and this isolated suite is rerun against the corrected code.
