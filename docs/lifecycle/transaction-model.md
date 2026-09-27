# Transaction and Recovery Model

For ASEN-owned state-changing operations:

PREPARE -> SNAPSHOT/BACKUP -> APPLY -> VERIFY -> COMMIT

On failure after APPLY:
- determine whether outcome is known or ambiguous
- do not blindly retry non-idempotent operations
- rollback when rollback is defined and safe
- otherwise enter BLOCKED/FAILED with evidence

The lifecycle must make partial success observable rather than presenting it as completion.
