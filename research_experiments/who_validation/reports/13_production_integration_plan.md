# Production Integration Plan

No production code was changed. A future, separately approved integration must:

1. Add the reviewed reference assets and manifest to a production-controlled location without modifying their contents.
2. Replace `backend/utils/who_growth.py`'s sparse dictionaries and `compute_z_scores` with a reviewed adaptation of `corrected_who_growth.py`'s reference reader, LMS extension, and explicit error behavior.
3. Update `backend/utils/measurement_validation.py` and each assessment caller (`backend/routes/midwife.py`, `backend/routes/moh.py`, `backend/routes/nutritionist.py`, and `backend/models_hierarchical.py`) to pass exact age days, integer WFA month, and measurement method.
4. Keep WFA, stunting, and wasting independent. Integrate only anthropometric screening labels; do not convert them into a clinical MAM/SAM diagnosis without approved clinical criteria and review.
5. Port the immutable 14-case and method/invalid-input regression suite, rerun it in CI, obtain clinician review, and only then consider release.

The current application cannot consume this isolated module without an explicit integration decision because its existing calculator interface does not supply the necessary exact age-day and method contract.
