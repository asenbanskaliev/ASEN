# ASEN External ecosystem parity audit

This registry measures observable capability parity. It does not measure file count or source-code similarity.

Baselines:
- ASEN: `3c76ed7aa9be124288397ca8baf35ceacfe5889c`
- Reference A: `fe61793e7cb3e75462ba53c7631e87d78e989354`
- Reference B: `a9e36e9b8a4d7885244466cd9ea6cc3ad330a69b`
- Reference C: `618e30f68f0f2e3b736df91fcfbaaad279ccd3d2`

Statuses: PARITY, PARTIAL, MISSING, N/A.

Rules:
1. PARITY requires an observable ASEN implementation and automated evidence.
2. PARTIAL means the core behavior exists but relevant observable cases are missing.
3. MISSING means a useful in-scope behavior has no ASEN implementation/evidence.
4. N/A is an explicit architectural exclusion, not a failure.
5. No External runtime dependency or source copying is permitted.
6. Every remediation must preserve Pi as the execution/model/auth/session platform.
