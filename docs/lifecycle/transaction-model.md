# Transaction and Recovery Model

For ASEN-owned state-changing operations:

PREPARE -> SNAPSHOT/BACKUP -> APPLY -> VERIFY -> COMMIT

On failure after APPLY:
- determine whether outcome is known or ambiguous
- do not blindly retry non-idempotent operations
- rollback when rollback is defined and safe
- otherwise enter BLOCKED/FAILED with evidence

The lifecycle must make partial success observable rather than presenting it as completion.

## Recovery integrity and TDD completion

Lifecycle and evidence v2 snapshots use domain-separated HMACs. A valid HMAC proves the persisted bytes were unchanged under that domain and that the writer possessed the signing key. Recovery also requires the caller-supplied task, repository, candidate, and current revision to match exactly, so a valid snapshot for a different or stale revision is rejected.

This is integrity and exact-binding protection, not rollback resistance. Replaying an older valid snapshot with the identical task, repository, candidate, and revision binding cannot be detected without external monotonic state such as a ledger, trusted counter, or trusted timestamp.

The `asen-tdd` verification gate accepts only exact `lifecycle-completion` evidence admitted by a live lifecycle or signed-recovered v2 lifecycle. Legacy v1 generic RED/GREEN/REFACTOR evidence remains audit-readable but cannot satisfy that gate. A `verified-non-tdd-alternative` may satisfy only this narrow completion gate; it remains explicitly labeled as an alternative, is not TDD, and grants no generic test, review, mutation, or release evidence.
