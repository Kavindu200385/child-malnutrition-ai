# WHO Implementation Inventory

Active calculator: `backend/utils/who_growth.py:12-165`; clinical classifications: `backend/utils/current_status.py:7-115`; input validation: `backend/utils/measurement_validation.py:59-153`; route calls: `backend/routes/midwife.py:330-345`, `backend/routes/moh.py:141-155`, and `backend/routes/nutritionist.py:294-305`. Existing production checks are `backend/tests/unit/test_who_growth.py:6-16`; they only assert that a valid call returns bounded values and that an invalid sex raises.

The current WFA tables contain 10 sparse points (0–60 months); LHFA contains 7 sparse points (0–60 months); and the table labelled WFH spans 45–110 cm. This is not complete official reference coverage. `compute_z_scores` performs the standard LMS formula (`112-115`), but interpolates and clamps table keys (`118-138`) and clips every output to ±5 (`160-163`). It accepts no measurement-method argument.

The prior internal report `research_experiments/reports/02_who_reference_validation.md` correctly described official-case validation as incomplete. This validation supersedes that gap with isolated, independently sourced official table cases; it does not alter application code.
