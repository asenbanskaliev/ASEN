# ASEN — CI portable baseline reconciliation (2026-11-13)

## Scope and authority

Owner requested a fresh GitHub audit of code, documentation and failing CI, followed by repairs. Exact source head: `12fc65be8dd3974aa7856db313597db760dc82a4`; last prior confirmed green candidate: `a49d8ad939921c5f004c4a71c0774885fd728599`. This separate branch is a *repair candidate*, not feature acceptance, native approval, release or authorization to merge into `main`.

No changes to the upstream Pi fork, P32 font/capture/footer implementation, permissions, private fixtures, provider consent, historical stopped proof, or R4 acceptance status. Do not claim green or FULL without new same-SHA receipts.

## Implemented bounded repairs

- Preserve Pi `(args, ctx)` command signature in scoped `registerData` wrapper, including direct zero-argument test calls, without moving publication guard into `args`.
- Distinguish Markdown path from `#fragment` in documented links; explicitly check the two known handoff section titles.
- Align review/persona help tests with actual public read-only usage; do not claim native review approval.
- Align protected-literal CLI argument fixtures with the one explicitly auto-loaded ASEN package extension. These tests still check the exact forwarded literal tail, without removing denials or parser validation.
- Record the ODD workflow selection distinction without treating agents/modes as authorization.
- Replace a test-only dependency on an intentionally deferred private/design path with a **synthetic, versioned public regression oracle** derived from the checked-in WIP runtime colors. It does not replace real design provenance, color approval, host snapshots or P32 verification.

## Still blocked / not repaired by this batch

- `scripts/audit-upstream-boundary.mjs` flags 27 referenced paths, including external provenance documents and native RDD schema literals. Separate security assessment required before any narrowly allowed exceptions; never disable audit globally.
- P05/P10/P11 stateful frozen test roots, `ASEN_AUDIT_ROOT` and ignored legacy helper `.asen-audit/env-c.sh` need independently admitted, portable isolated test fixtures.
- P32 gauge RED is intentional and `STOPPED_BLOCKED`, not a harmless snapshot mismatch. No normalization or fake GREEN.
- Packed Pi RPC first-command timeout, concurrent Pi process/effort 5-second timeouts, and agent state teardown `ENOTEMPTY` need cause-focused reproductions. Do not just extend deadlines to hide a hang.
- CI test-shard coverage, R4 evidence and T12 integrated security are downstream gates; they cannot be promoted to PASS independently of their inputs.

## Verification and acceptance

Static source review only before publication. Publish on separate feature fix branch, open draft PR *into the existing development branch*, run GitHub CI against its exact head, inspect all relevant checks and follow remaining failures with separate test-first fixes. Do not merge automatically, do not alter the base PR #57 or its head, and do not claim `globalFull:true`.
