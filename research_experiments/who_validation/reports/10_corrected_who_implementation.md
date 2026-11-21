# Corrected WHO Implementation

`corrected_who_growth.py` is an isolated implementation. It reads eight unchanged official WHO workbook copies from `references/` and has no imports from the application calculator. It implements `calculate_waz`, `calculate_haz`, `calculate_wlz`, `calculate_whz`, `calculate_growth_z_scores`, and `classify_anthropometric_indicators`.

The calculator preserves sex-specific official L, M, S parameters and exact source keys. It does not interpolate, extrapolate, clamp, or clip values. WFA accepts only official integer monthly keys 0–60; LHFA accepts only exact day keys 0–1856; WFL and WFH accept only exact 0.1-cm reference keys. LMS values outside ±3 use WHO's published SD2–SD3 extension rather than arbitrary clipping.

WHO source version: WHO Child Growth Standards (2006); workbook URL revision token retained below. The same immutable metadata is stored in both `references/reference_manifest.json` and `corrected_results/reference_manifest.json`.

| Reference asset | SHA-256 | Official source URL |
| --- | --- | --- |
| wfa_girls_0_5_zscores.xlsx | 01e9a6fda2f3723dbc74d3c86bfbfcb9f6d474367d1d7b4a804501a2debd2ef1 | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_girls_0-to-5-years_zscores.xlsx?sfvrsn=4c03b8db_7 |
| wfa_boys_0_5_zscores.xlsx | f8f5a77b944ff7a8c1524e76f9d33f8a93cc423d23c2e7f2b10ba6b96a428e69 | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa_boys_0-to-5-years_zscores.xlsx?sfvrsn=97a05331_9 |
| lhfa_girls_expanded.xlsx | 6aa2876319449a6b1f4d825848128902114ff53c67b92b86a0c5140846013059 | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10 |
| lhfa_boys_expanded.xlsx | c4b1c9029ab9751a5f0888e32f35c7c0287a16d361885cf911ecf23b3f7f6b4f | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/expandable-tables/lhfa-boys-zscore-expanded-tables.xlsx?sfvrsn=7b4a3428_12 |
| wfl_girls_expanded.xlsx | ec116b8e618ad311d34a87231346badf16c75f5c4f82222ec846e05c582bf16a | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-girls-zscore-expanded-table.xlsx?sfvrsn=db7b5d6b_8 |
| wfl_boys_expanded.xlsx | 1a6e9a002d2692d038161bc6572a10f8b9fa0657163808141d2981a2132c59cc | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfl-boys-zscore-expanded-table.xlsx?sfvrsn=d307434f_8 |
| wfh_girls_expanded.xlsx | fca340d5f04aa1556ac410b176b65b290e1b9ff467fc854a97f9b54ad94c9b8a | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-girls-zscore-expanded-tables.xlsx?sfvrsn=daac732c_8 |
| wfh_boys_expanded.xlsx | ed3b590f9c65937a138408b13618f33684bb6406a0c56d6a2ce3fd9053a3f59f | https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-length-height/expanded-tables/wfh-boys-zscore-expanded-tables.xlsx?sfvrsn=ac60cb13_8 |

Independent classification check: WAZ −2.5 → `underweight`; HAZ −3.5 → `severe_stunting`; WLZ −2.5 → `wasting`. These independent screening labels coexist and intentionally do not return MAM or SAM diagnostic terminology.
