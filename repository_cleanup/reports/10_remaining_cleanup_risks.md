# Remaining Cleanup Risks

1. Dataset provenance remains unverified; simulated labels are not clinical outcomes.
2. Frozen membership CSVs embed historical source-path values by design. Do not rewrite them without replacing their manifests and reproducibility evidence.
3. Historical output manifests and the Colab snapshot preserve original paths; the verifier provides read-time compatibility for outputs.
4. The Step 2F package cannot be regenerated in the current environments because `matplotlib` is absent. Use the declared research/Colab environment, not ad-hoc dependency changes.
5. Existing datetime and SQLAlchemy deprecation warnings remain and should be addressed in a separate compatibility task.
6. Large frontend bundle warnings remain; address with a separately reviewed performance task.
7. `ROLE_CREDENTIALS.md` warrants a confidential pre-PR security review; its content was intentionally not disclosed here.
