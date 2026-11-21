# Repository Inventory

Audit branch: `chore/cmras-restructure-cleanup`, created from the validated `research/who-engine-integration` state (`418e951`). Intended PR base: `development`.

| Area | Location | Status |
| --- | --- | --- |
| Flask application | `backend/` | retained; not functionally changed |
| React application | `frontend/` | retained; only an unused fallback component removed |
| WHO engine and official tables | `backend/utils/who_growth.py`, `backend/resources/who_growth_2006/` | retained in place |
| Research audit evidence | `research_audit/` | retained in place as historical evidence |
| Experiment scripts and frozen outputs | `research_experiments/` | retained; paths repaired for the reorganized datasets |
| Versioned datasets | `datasets/` | reorganized without content changes |
| Dataset documentation | `docs/datasets/` | centralized |
| Cleanup evidence | `repository_cleanup/reports/` | added |

The tracked `ROLE_CREDENTIALS.md` name indicates a confidential-document review should occur before sharing the repository. Its contents were not inspected or reproduced in cleanup reports.
