# ECO-07 R4 — independent readiness review (unexecuted)

## R1: requirements
- Existing Pi Todo and agent stores remain authoritative.
- Correlation must never dispatch or authorize work.
- Restart must not replay writes.
- No implicit task completion based on agent outcome.

## R2: risks
- A standalone link journal cannot be atomically committed with agent enqueue.
- Current public TaskAgentLinkStore.bind checks uniqueness but **does not authenticate that either linked record exists**. It must never be exposed to untrusted callers.
- Orchestrator plan agent IDs are not automatically the IDs used by the production Pi runtime.
- Cross-store reads are not atomic snapshots; concurrent updates can temporarily differ.
- Current journal parser rejects malformed content but lacks independent quarantine and recovery.
- Path aliases, PID reuse, race windows and receipt-key storage require targeted security tests.

## R3: review of changes
- Read-only projection implemented, using immutable session-scoped links and a conservative exact-ID fallback.
- Pi command is observational only. No automatic link creation has been wired.
- Existing schemas remain untouched.
- Tests authored for identity separation, restart projection, immutable links and malformed data.
- None of these tests has been run.

## R4: release readiness
**NOT APPROVED**. Before approval: implement a trusted, validated binding transaction with crash-gap reconciliation; define explicit plan/task ownership and prove no authority escalation; add real Pi restart and multi-process tests; execute typecheck, unit tests, full Linux/Windows/macOS CI, and independent security audit. No CI was requested. Unattached commits must not be described as production changes.

Do not merge PR #32 on this evidence.
