# R4 — T05 review freshness audit

Date: 2026-10-28. Base: PR #37 HEAD `18e98728e2e39c8b1a4ebf66019574ee7d1b32a6`.

## Finding: live checkout drift was not revalidated after session creation

- Severity: High.
- Reproduction: create a temporary Git repository with two commits; prepare and bind a candidate; open its review session and result receiver; advance HEAD; attempt to bind the previous candidate result.
- Before correction: session/result validation covered the frozen manifest/view but not the source checkout identity after materialization.
- Correction: private checkout claim retains repository path, directory dev/inode, revision, tree and parent. At session/result boundaries, Git runs with system/global config, fsmonitor, replacement refs, external diff and transport disabled; it checks clean tracked/untracked state and index flags. Session holds its manifest and source validator in a private WeakMap. Stale validation invalidates the session and burns the result attempt.
- Regression: `tests/work-unit-review-candidate.test.ts`, scenario `F invalidates a session and prior result when the live Git checkout changes`.
- Evidence boundary: this is a local real-Git freshness regression. The fabricated PASS object in the test is only a guard probe; it is not a native RDD observation, reviewer identity or approval.
- Residual risk: a same-user process can race filesystem changes between validations and later reads. The review view is not an OS sandbox or atomic snapshot. Process restart loses WeakMap claims and requires fresh preparation.

## R4 perspectives

| Area | Finding / correction | Residual |
| --- | --- | --- |
| Architecture | Reused candidate, tree-inspection, view, session and result modules; no second permission store or delivery authority added. | Public `/asen-review` still stops before real review/result/correction composition. |
| Security | Exact checkout freshness is retained privately and checked at session and result use; stale result is rejected. | Participant IDs are not authenticated; no real RDD provider was called. Same-user TOCTOU remains. |
| Reliability | Stale attempts burn their receiver; owned view is explicitly disposed in regression. | Restart recovery, interrupted cleanup and multi-OS behavior are not demonstrated for this new code. |
| Performance | Freshness checks are limited to session/result boundaries and inspect source identity, not model calls. | No before/after benchmark or Git-call measurement; no performance gain claimed. |

## Verification

- Focused candidate/session/review-chain tests: 26/26 PASS.
- Typecheck: PASS.
- Full test suite: 2,217 passed, 0 failed, 19 skipped; build and package verification pass.
- Exact Pi 1.2.0 Linux package matrix on `1e8d486e7c0bf32547a8c3cdbd895ca3bbb8d2ee`: TUI/RPC/JSON/print all PASS, natural shutdown observed, zero model calls.
- Local parity/skills/memory/upstream-boundary audits pass. Ecosystem normative source proof remains NOT ADMITTED because its retained repository is unavailable.
- Independent external review: not obtained; CodeRabbit CLI is unavailable in the environment.
- T05 admission: PARTIAL. No critical/high finding remains known in the narrow freshness correction, but this is not a full R4 signoff of T05.

Final local suite result on the hardened candidate source: `TMPDIR=/tmp npm run test` — 2,217 passed, 0 failed, 19 skipped. The earlier test-runner failures used a nonstandard temporary directory and are not counted; focused suites also pass under `/tmp`.
