# Remaining System Issues

## No automated test failures

The Step 3B backend/WHO suite finished with 199 passed, 0 failed and 1 skipped. Frontend Vitest finished with 39 passed, 0 failed; the production build passed.

## Remaining limitations and follow-up items

1. **Clinical terminology — high:** several legacy React views still describe MAM/SAM as diagnoses or derive treatment guidance from display risk. The corrected WHO backend is screening-only. These views need clinician-approved wording before clinical/release claims.
2. **Future-risk claims — high:** historical nullable prediction fields and research-only model artifacts exist, but no production model was loaded or validated in this step. Frontend future-risk messages must not be presented as clinically validated prediction.
3. **Browser coverage — medium:** no browser E2E/mobile/accessibility suite is configured or executed.
4. **Rate-limit evidence — medium:** one rate-limit test remains skipped in isolated tests because the limiter is disabled there.
5. **Legacy API wrapper — low:** unused `childrenAPI.getHistory()` names an endpoint not provided by the active hierarchical blueprint.
6. **Dependency/build health — medium:** `npm ci` reported 23 dependency vulnerabilities; Vite warned about a large main chunk. Neither prevented the current build.
7. **Deprecation warnings — low:** backend tests still emit `datetime.utcnow()` and legacy SQLAlchemy `Query.get()` warnings.

None of these items was hidden by changing WHO references, reducing validation, or fabricating test results.
