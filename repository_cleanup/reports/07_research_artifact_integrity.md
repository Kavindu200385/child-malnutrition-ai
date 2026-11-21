# Research Artifact Integrity

The historical Step 2E artifacts, research audit, Colab material, and prior outputs were retained unchanged. The relocated datasets and membership files all match their pre-cleanup SHA-256 values. The repaired verification script can resolve old paths recorded in immutable output manifests.

Attempting a new Step 2F publication verification package was intentionally stopped before it could create output: the available environments lack `matplotlib` (and therefore cannot import that verifier). No dependency was installed, model retrained, artifact overwritten, or evidence modified. Re-run in the established research/Colab environment with its declared dependencies to regenerate a fresh verification package.
