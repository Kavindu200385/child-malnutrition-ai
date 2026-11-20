# 03 — Current Risk Model Audit

## Verified implementation

Historical inference used four values: age, encoded sex, weight, and height (`backend/ai/predictor.py:502-585`). It calculated Z-scores before model inference, encoded sex as M=1/F=0 (`495-499`), and loaded a joblib model and label encoder.

For age ≤1 month, it bypassed the model and assigned Normal/MAM/SAM from birth-weight thresholds (`523-544`). This makes one portion of the reported “model” deterministic clinical logic.

## Scientific concerns

- The historical comparison Logistic Regression was trained at runtime on synthetic samples constructed from Z-score thresholds (`22-101`), not on an independently observed cohort.
- The target class mapping/artifact class list is unavailable.
- Static datasets contain multi-condition fields (Underweight, Stunting, Wasting) but one exclusive `Final_Decision`; precedence/mapping documentation is missing.
- The LMS tables are explicitly described as trimmed (`336-338`), so the WHO implementation requires verification against complete official reference tables.

## Conclusion

Current-status classification and ML prediction must be reported separately. The available evidence supports neither an externally validated classifier nor any claimed accuracy.
