# Remaining Integration Issues

1. **Test bootstrap safety — high:** `create_app()` touches its configured database before pytest changes the URI. Test invocations must export `DATABASE_URL=sqlite:///:memory:` before import. Future test configuration should set this at process startup (for example, pytest configuration or a dedicated test settings module).
2. **Stale measurement test payloads — high:** multiple unit and workflow tests omit the newly required date and method. Update fixtures and request JSON with actual values; do not weaken WHO validation.
3. **Legacy MAM/SAM assertions — high:** existing tests still expect diagnostic MAM/SAM output. Update them to assert independent screening labels and clinical-review status under the approved screening-only policy.
4. **Full system suite pending — medium:** only WHO, focused validation, workflow, and security suites were executed. Run the complete backend suite after test payload migration.
5. **No production deployment/readiness claim:** a clinical review remains required before deployment. Historical records were not recalculated.
