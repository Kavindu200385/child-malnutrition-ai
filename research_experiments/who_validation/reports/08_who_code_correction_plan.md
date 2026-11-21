# WHO Code Correction Plan

No production correction has been applied. The required sequence is:

1. Add versioned, unmodified official WHO LMS reference assets for WFA, LHFA, WFL, and WFH; record origin, version, and SHA-256.
2. Replace the sparse dictionaries at `backend/utils/who_growth.py:12-109` with a dedicated reference reader that retains official L, M, and S values and rejects unsupported table keys.
3. Change the calculator contract to accept validated age-in-days/months and `recumbent_length` versus `standing_height`; implement the approved WHO WFL/WFH selection and any measurement adjustment rules.
4. Remove silent key clamping and output clipping at `who_growth.py:125-128,155-163`; return typed validation failures for unsupported ages, nonpositive values, and out-of-table values.
5. Propagate the method through the three assessment routes and model helper call sites; keep invalid scores absent rather than substituting a plausible number.
6. Keep WFA, stunting, and wasting as independently exposed indicators. Change MAM/SAM language to a clinician-approved screening/assessment label until input quality and WHO calculation validity are established. Do not add MUAC or edema functionality.
7. Add immutable official-table regression cases spanning both sexes, infant/older ages, 24-month transition, low/high values, −2/−3 thresholds, and all reference boundaries. Require documented tolerance before deployment.

Scientific release gate: rerun the isolated suite, obtain clinical review of scope/wording and method rules, then independently review the production diff before any application change.
