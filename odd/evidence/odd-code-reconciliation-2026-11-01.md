# ASEN ODD-code reconciliation - executed batch 2026-11-01

Baseline: PR #45, `feat/t12-integrated-acceptance-merge`, GitHub HEAD `e9229568e457785a884de8e08b1b9ad9404d256b` at audit. This annex records evidence and change boundaries; `odd/tasks/pi-capability-completion.md` remains the canonical task list and `odd/tasks/ecosystem-strict-parity.md` remains the single ECO execution backlog.

## Verified discrepancy matrix

| ID | ODD before | Runtime and tests | Current disposition |
| --- | --- | --- | --- |
| T07 | unchecked/verification pending at an ancestor | `src/interaction/code-intelligence.ts`, `tests/t07-real-asen-codegraph.test.ts`; dedicated real CLI and CI successful on e9229568 | checked, **bounded FULL only**, not full reference parity |
| T09-U4 | unchecked, activation/update/rollback historically unfinished | `src/runtime/managed-lifecycle.ts` exports install/upgrade/rollback; characterization and interrupted-upgrade tests | checked, **implemented/verified bounded**, without aggregate T09 FULL |
| T09 | checked FULL under old self-audit | real managed implementation, but browser launch, malicious same-user removal and inherited Pi dependency debt remain outside scope | unchecked **PARTIAL aggregate**; no new claims |
| T10-6 | FULL by owner waiver alongside missing Pi integration | `src/runtime/session-notifications.ts` bus is unit-tested but **NOT_WIRED** into `extensions/asen.ts`; journal-backed background notices ARE wired to Pi | **ACCEPTED_WITH_WAIVER bounded**; T10-6 bus integration PARTIAL |
| MEM-01..09 | unchecked legacy nine items | existing `memory-v3` R01-R09 evidence map and SQLite/Pi integration | checked **RECONCILED local core**; optional endpoints, live provider and global reference parity not claimed |
| ECO-01..16 | sixteen PARTIAL claims | some smaller T units are accepted within different scopes | registry remains 16 PARTIAL / 0 FULL |
| F5-01/F5-02 | in_progress while earlier Windows CI FAIL recorded | e9229568 CI/Release Gate/Pi/T07/F5 static successful; independent review not supplied | technical baseline PASS, independent R4 PENDING; both tasks remain in_progress |

## Delivery decisions

1. No duplicate managed lifecycle, CodeGraph or memory implementation. Preserve old failed receipts instead of deleting them.
2. Do **not** insert `SessionNotificationBus` between the durable background journal and Pi as a write-time prerequisite. It is not a durable consumer or Pi delivery acknowledgement. Registering it without a proven contract could turn TTL/capacity/restart into silent loss or duplicate delivery. This batch documents its NOT_WIRED state and enforces the distinction in a new repository test.
3. Preserve existing `deliveryConfirmed:false`. Journal `enqueued` denotes acceptance by the Pi transport, not a confirmed human view; restart can re-enqueue a pending item but cannot guarantee exactly once.
4. No changes to `registry/parity/ecosystem-claims-v1.json`, authority assets, packages, runtime security, credentials, provider workflows or `main`.

## Verification

The baseline e9229568 passed CI 41328305297, Release Gate 41328305277, Phase 0 41328305307, Pi runtime 41328305319, F5 static 41328305299 and real T07 CLI 41328305298. Pi Free Smoke 41328305285 was conditional SKIPPED. This batch introduces `tests/odd-state-consistency.test.ts` (positive/source-bound and adversarial in-memory mutation checks) to join the standard discovered test suite. Those new checks and this exact new commit have no historical PASS: require a fresh PR CI/Release Gate and inspect all jobs.

## Deferred functional work, in dependency order

- **T10-N1 / P1:** Design a real Pi consumer/acknowledgement contract from supported public APIs (not a model/provider fabrication). If Pi only supports synchronous enqueue, adopt an explicit best-effort delivery policy rather than pretending a durable ACK. Responsible role: Pi runtime maintainer. Exit: observed API contract, hostile cases and no new authority.
- **T10-N2 / P1:** Only after N1, wire the bus if it provides an observable benefit not already covered by the journal; test same-id dedup, different-id same text, TTL/capacity, monitor and agent notices, process restart, race before/after enqueue and persistence, one session/project at a time. Responsible role: runtime engineer + independent reviewer. Exit: no unauthorized writes, no dropped pending notices, no false deliveryConfirmed or exactly-once promise.
- **T09-S / P1:** Real browser activation, bounded hostile same-user removal threat model and inherited Pi host dependency resolution; require independent security review. Do not mark host-risk mitigation as proven from package-only CI.
- **ECO-C / P1:** Reconcile real reference/source semantic coverage; no global FULL without frozen-source receipts and required platform/host evidence. Responsible role: parity auditor.
- **F5-R4 / P0:** Obtain genuine independent R4 on the final SHA if FULL admission is required. The owner-deferred review is not PASS and cannot be simulated.

## Batch and release boundary

This is one documentation/test batch on the PR branch. Use a single non-force branch update; one resulting PR workflow set (CI + Release Gate + static/architecture/T07 gates) is the final test cycle. Do not merge or publish release packages. On any failure, inspect job artifacts and correct the precise cause; preserve the failed run. Admission of a subsequent fix needs its own exact-SHA CI, not inherited green from this baseline.
