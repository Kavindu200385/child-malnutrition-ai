# Final Repository Cleanup

## Scope and result

Original branch: `development`  
Cleanup branch: `chore/cmras-final-cleanup`

This cleanup removed only confirmed redundant or generated material. Application
behavior, datasets, WHO calculations, frozen model artifacts, experiment metrics,
and research evidence were not changed. The branch is ready for pull-request
review after normal human review.

## Removals

### Version-controlled files: 13

| Removed material | Count | Reason |
| --- | ---: | --- |
| Root-level duplicate frontend logo copies | 2 | Exact duplicates of the referenced assets under `frontend/public/`; no source, build, or email-service reference uses the root copies. |
| `repository_cleanup/reports/` intermediate reports | 11 | Superseded cleanup-progress documents consolidated into this single final report. Their dataset, test, migration, and Step 2F evidence is preserved below and in frozen research outputs. |

### Local ignored artifacts

- Removed 11 `.DS_Store` files.
- Removed 17 generated cache/build directories (`__pycache__`, `.pytest_cache`,
  and `frontend/dist`).
- Removed the now-empty `repository_cleanup/reports/` and `repository_cleanup/`
  directories.

Active `frontend/node_modules/`, `.venv-who-test/`, and
`research_experiments/.venv/` were retained. Local `backend/data/` was retained
because it can contain a developer database and was not proven disposable.

## Documentation and evidence retained

The main README, setup/migration guidance, dataset manifests, WHO reference
documentation, research audit, WHO validation, system validation, Colab package,
all frozen Step 2E/2F runs, model artifacts, charts, confusion matrices, and
reproducibility metadata remain. Frozen historical runs were kept even when
byte-identical because they form the reproducibility chain.

No assistant configuration, Codex instruction, Claude instruction, or prompt
archive is tracked by this repository. No source-code comments were removed:
the reviewed comments explain clinical, WHO, security, migration, or non-obvious
business logic and are not disposable conversational text.

The current Step 2F verification output remains intentionally uncommitted at
`research_experiments/outputs/step2f_reproducibility_verification_20261121T105518Z/`.
It is protected research evidence for this cleanup branch.

## Integrity verification

| Check | Result |
| --- | --- |
| Prepared simulation records | 19,200 total: 13,376 train, 3,040 validation, 2,784 test |
| Prepared dataset SHA-256 values | matched manifests |
| Frozen membership SHA-256 values | matched manifests |
| Child/source group overlap | zero across train/test, train/validation, and test/validation |
| Step 2F model artifact hashes | 8/8 matched |
| Step 2F publication verification | PASS; maximum metric difference `0.0` |
| Selected frozen-test macro-F1 | unchanged: `0.8880257560016871` (88.80%) |

Research results remain simulation-based and are not clinical future-risk
prediction validation. The persistence baseline remains without a saved raw
prediction file, as documented in the frozen Step 2F evidence.

## Test results

| Suite | Result |
| --- | --- |
| Backend, WHO, API, authentication, authorization, integration, and security tests | 206 passed, 1 intentional skip |
| Frontend Vitest | 41 passed |
| Frontend production build | passed |
| `git diff --check` | passed |

Existing warnings are non-blocking: Python/SQLAlchemy datetime deprecations and
the Vite warning for frontend chunks exceeding 500 kB. Neither was modified in
this cleanup.

## Manual Git review suggestions

There is one required remote, `origin`; it was not changed. All listed topic
branches are already merged into `development`. After confirming no branch is
still needed, a maintainer may remove local and remote copies manually:

```sh
git branch -d chore/cmras-restructure-cleanup
git branch -d production-clinical-safety-upgrade
git branch -d research/dataset-audit
git branch -d research/who-engine-integration
git push origin --delete chore/cmras-restructure-cleanup
git push origin --delete production-clinical-safety-upgrade
git push origin --delete research/dataset-audit
git push origin --delete research/who-engine-integration
```

`origin/HEAD` currently points to `main`; a repository administrator should
confirm the intended GitHub default branch before changing that remote setting.

## Remaining risks

- `ROLE_CREDENTIALS.md` and `backend/DEMO_CREDENTIALS.md` require confidential
  manual review; their content was not exposed or rewritten.
- Dataset provenance and future-risk labels remain unverified/simulation-only.
- The two active local environments are intentionally retained and ignored; they
  should be recreated from pinned requirements when needed rather than committed.
