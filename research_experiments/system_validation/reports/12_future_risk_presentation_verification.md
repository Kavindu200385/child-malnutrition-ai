# Step 3C Future-Risk Presentation Verification

## Deployment status

No clinically validated future-risk model is deployed by the application. Research experiment artifacts remain outside the running application and were not loaded, retrained, changed, or deployed.

## Display rules implemented

| Input condition | Frontend behavior |
| --- | --- |
| No future-risk field | Displays `NOT AVAILABLE` and states that no clinically validated prediction model is deployed. |
| Historical non-empty future-risk field | Shows the stored label only as historical research simulation output, explicitly not clinically validated or a confirmed outcome. |
| Clinical action/referral presentation | Does not use future-risk output to trigger alerts, recommendations, treatment guidance, follow-up frequency, referral, or prioritisation. |
| Measurement result view | Does not generate a future-risk prediction from local measurements or placeholder values. |

## Verification

Focused Vitest cases cover unavailable and stored future-risk values through `getFutureRiskPresentation`. The child profile and growth chart use this shared presentation state. The prior client-side random/trend-based future-prediction calculation was removed.

## Remaining limitation

Historical nullable prediction fields may remain in records for research traceability. They must not be cited as deployed clinical prediction results in the IEEE manuscript.
