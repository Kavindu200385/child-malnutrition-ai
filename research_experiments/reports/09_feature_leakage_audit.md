# Feature Leakage Audit

| Column | Classification | Decision |
| --- | --- | --- |
| age_months | available at prediction time | baseline recorded measurement |
| weight_kg | available at prediction time | baseline recorded measurement |
| height_cm | available at prediction time | baseline recorded measurement |
| z_score | available at prediction time | recorded baseline derived value; calculation/reference unverified |
| current_risk | available at prediction time; label-dependent | include only with required no-current-risk ablation |
| child_id | identifier | excluded |
| visit_number | unjustified predictor | excluded |
| visit_date | identifier/date | excluded |
| previous_z_score | unverified availability | excluded |
| delta_z_score | unverified availability | excluded |
| predicted_risk_next_2_months | target | excluded |

The allowlist is `age_months`, `weight_kg`, `height_cm`, `z_score`, and `current_risk`. Current risk is permitted only as a clearly labelled baseline-status feature and requires a later ablation because it is strongly coupled to the unverified synthetic target. Training is safe only if this allowlist and ablation are enforced; the result remains simulation-only.
