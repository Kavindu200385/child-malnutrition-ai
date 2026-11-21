# Performance Measurements

## Environment and method

Measurements used Flask's in-process test client, Python `time.perf_counter()`, in-memory SQLite, synthetic users/areas/children, disabled email/notifications/rate limits, three warm-up requests, and 30 measured trials. They are local API timings only, not user-completion, browser, MySQL, or production-network latency.

## Results

| Operation | Trials | Mean ms | Median ms | Maximum ms | Minimum ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Midwife valid measurement plus WHO assessment | 30 | 6.477 | 5.589 | 16.768 | 4.346 |
| MOH report-summary request over 25 synthetic children | 30 | 2.519 | 2.436 | 3.017 | 2.288 |

## Exact isolated invocation pattern

Both measurements launched Python with `CMRAS_TESTING=1`, `DATABASE_URL=sqlite:///:memory:`, all email settings false, and `RATELIMIT_ENABLED=false`; each created/dropped its SQLite schema in-process before timing. The measurement operation posted one valid date/method/weight/height payload to `/api/midwife/measurement/add`. The report operation requested `/api/moh/reports/summary?start_date=2022-01-01&end_date=2026-12-31`.

## Interpretation limits

No workflow-completion time, usability timing, browser rendering time, concurrent-load behavior, MySQL performance, or clinical processing time was measured. Do not use these figures to claim a five-minute workflow or production SLA.
