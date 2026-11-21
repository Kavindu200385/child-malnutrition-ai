# Validation Model Comparison

| schema | model | accuracy | balanced_accuracy | macro_precision | macro_recall | macro_f1 | weighted_f1 | high_recall | severe_recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| no_current_risk | logistic_regression | 0.9125 | 0.9048 | 0.911 | 0.9048 | 0.9077 | 0.9126 | 0.9051 | 0.8959 |
| no_current_risk | xgboost | 0.9112 | 0.9036 | 0.9088 | 0.9036 | 0.906 | 0.9114 | 0.8986 | 0.8934 |
| with_current_risk | logistic_regression | 0.9076 | 0.8979 | 0.9082 | 0.8979 | 0.9027 | 0.9076 | 0.888 | 0.8832 |
| with_current_risk | xgboost | 0.9072 | 0.8994 | 0.9048 | 0.8994 | 0.9019 | 0.9074 | 0.892 | 0.8909 |
| with_current_risk | random_forest | 0.9069 | 0.8992 | 0.9039 | 0.8992 | 0.9015 | 0.907 | 0.8906 | 0.8934 |
| no_current_risk | random_forest | 0.9059 | 0.8983 | 0.9025 | 0.8983 | 0.9002 | 0.906 | 0.8972 | 0.8909 |
| reference | current_risk_persistence | 0.8717 | 0.8444 | 0.8851 | 0.8444 | 0.8606 | 0.8701 | 0.8195 | 0.769 |
| no_current_risk | dummy_majority | 0.375 | 0.25 | 0.0938 | 0.25 | 0.1364 | 0.2045 | 0.0 | 0.0 |
| with_current_risk | dummy_majority | 0.375 | 0.25 | 0.0938 | 0.25 | 0.1364 | 0.2045 | 0.0 | 0.0 |
