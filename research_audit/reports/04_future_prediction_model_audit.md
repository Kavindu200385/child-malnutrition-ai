# 04 — Future Prediction Model Audit

## Verified data structure

Each longitudinal CSV has 1,200 repeated child IDs and eight dated visits per child. The target is `predicted_risk_next_2_months`; current labels and prior Z-score fields are also present.

## Verified historical inference

The future vector used age, sex, current weight/height, prior weight/height, and their deltas (`backend/ai/predictor.py:605-694`). Production selected the latest prior measurement, prior visit, or birth baseline (`255-333`).

## Risks and limitations

- The generation code and raw follow-up outcomes are absent; synthetic versus observed origin cannot be independently verified from code.
- Repeated child IDs make random row-level splitting invalid: visits from one child can cross train/test boundaries unless grouped.
- A birth baseline can be many months before the current visit, yet the feature vector contains no elapsed-time interval. A claimed fixed two-month horizon is therefore not established by the deployed feature construction.
- Current weight, prior weight, and derived change are mathematically coupled. This is not leakage by itself, but makes validation split design essential.
- No code or artifact establishes that the target was observed two months later rather than deterministically simulated.

## Conclusion

Do not claim validated two-month clinical prediction. Describe this, if retained, as an unvalidated synthetic risk-classification experiment.
