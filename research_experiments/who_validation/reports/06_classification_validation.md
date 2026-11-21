# Classification Validation

| Z | Underweight | Stunting | Wasting |
| --- | --- | --- | --- |
| -3.001 | SEVERE UNDERWEIGHT | SEVERE STUNTING | SAM |
| -3.0 | UNDERWEIGHT | STUNTING | MAM |
| -2.001 | UNDERWEIGHT | STUNTING | MAM |
| -2.0 | NORMAL | NORMAL | NORMAL |
| None | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |

`backend/utils/current_status.py:49-51` preserves independent underweight, stunting, and wasting values in its breakdown, so overlap is retained. The `current_nutritional_status` field is a precedence-based display summary (`55-70`), not proof that the conditions are mutually exclusive. Threshold boundaries follow the implemented strict comparisons: exact −2 is normal; exact −3 is moderate/non-severe. Clinical review must confirm the desired policy against the approved WHO guidance.

| Confirmed scope problem | Evidence | Severity | Scientific implication | Required correction |
| --- | --- | --- | --- | --- |
| `current_status.py:27-34,55-60,85-95` emits `MAM`/`SAM` directly from a computed WFH/WFL result, even though the calculator currently lacks valid WFL/WFH method selection and accepts silently clamped inputs. | The field is returned as a status and used in the top-level summary. | High | The label can appear clinically definitive despite incomplete measurement/reference validity. | Until the WHO calculator is corrected and clinical governance approves wording, expose it as a screening classification with indicator, method, and quality flags; do not claim confirmed MAM/SAM from insufficient inputs. |

No MUAC or edema feature was added or changed in this validation.
