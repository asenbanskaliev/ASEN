# Engineering State Machine

Canonical lifecycle:

DISCOVERING -> PLANNING -> IMPLEMENTING -> TESTING -> REVIEWING -> VERIFYING -> VERIFIED

Additional states: BLOCKED, FAILED, ROLLED_BACK.

## Gates
- IMPLEMENTING requires explicit scope and an accepted plan/preflight for workflows that declare them mandatory.
- TESTING records executed evidence.
- REVIEWING operates on an identified candidate.
- VERIFYING may only consume evidence for that same candidate.
- VERIFIED is invalidated when candidate identity changes.
- failure after a mutating lifecycle step invokes the applicable rollback/recovery policy.

Narrative model output cannot directly set VERIFIED.
