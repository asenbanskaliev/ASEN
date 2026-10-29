# R4 — T05 review freshness audit

Date: 2026-10-28. Base: PR #37 HEAD `18e98728e2e39c8b1a4ebf66019574ee7d1b32a6`.

## Finding: live checkout drift was not revalidated after session creation

- Severity: High.
- Reproduction: create a temporary Git repository with two commits; prepare and bind a candidate; open its review session and result receiver; advance HEAD; attempt to bind the previous candidate result.
- Before correction: session/result validation covered the frozen manifest/view but not the source checkout identity after materialization.
- Correction: private checkout claim retains repository path, directory dev/inode, revision, tree and parent. At session/result boundaries, Git runs with system/global config, fsmonitor, replacement refs, external diff and transport disabled; it checks clean tracked/untracked state and index flags. Session holds its manifest and controller-issued checkout in a private WeakMap. Stale validation invalidates the session and burns the result attempt.
- Independent adversarial pass found the first local draft accepted a caller-provided freshness callback at the session binding boundary. That would let a caller with an open session supply a no-op checker. The final candidate removes the callback parameter: session source binding now accepts only a controller-issued checkout, verifies the checkout claim and exact repository/tree, and calls the controller-owned revalidator internally. A regression verifies forged checkout data is rejected.
- Regression: `tests/work-unit-review-candidate.test.ts`, scenario `F invalidates a session and prior result when the live Git checkout changes`.
- Evidence boundary: this is a local real-Git freshness regression. The fabricated PASS object in the test is only a guard probe; it is not a native RDD observation, reviewer identity or approval.
- Residual risk: a same-user process can race filesystem changes between validations and later reads. The review view is not an OS sandbox or atomic snapshot. Process restart loses WeakMap claims and requires fresh preparation.

## Follow-up R4 — public workspace review composition

The follow-up implementation adds `/asen-review workspace`: capture through a private index, candidate tree inspection, private read-only view/session, exact Git diff and changed-file bytes, explicit provider consent, a fresh Pi `streamSimple` call without tools, schema-checked findings, exact candidate binding, and one bounded correction reviewed by a different configured model. Unexpected untracked paths block dispatch. Session/view drift invalidates the result. The command reports `passed-awaiting-tests`; it does not accept the candidate or authorize delivery.

| Finding | Severity | Evidence and correction | Regression / residual |
| --- | --- | --- | --- |
| Parent path containment treated any relative path beginning `..` as outside. A sibling named `..asen-inside` could be inside the repository. | High | Fixed with segment-aware `..` + separator checks in both view materialization and workspace setup. | `review-view.test.ts` and `workspace-review-session.test.ts` reject in-repo dot-dot-prefixed parents. |
| Untracked files outside the explicit scope were absent from the projection summary and could be missed by the public reviewer. | High | Projection now records all nonignored untracked paths; review fails closed until each is selected or removed. | `workspace-review-projection.test.ts` and public command flow test verify capture and no dispatch. |
| Correction delta needed to be constrained to paths identified by findings and must use a different reviewer. | Medium | One in-memory correction request records prior candidate files, finding paths, author/reviewer model IDs, repo and session. A second failed correction blocks. | `ordinary-review-workspace-flow.test.ts` covers a corrected second candidate and blocks out-of-scope deltas. Restart drops correction state; user must start over. |
| Provider/model labels do not establish a human identity, native RDD authentication or approval authority. | High residual | Fresh `streamSimple` output is treated as analysis only and bound to exact request/session/tree. Explicit provider consent is required. | No live credentials are configured here; model calls are stubbed in tests. Tests are `not-run`, acceptance stays absent and no delivery authority is emitted. |

## R4 perspectives

| Area | Finding / correction | Residual |
| --- | --- | --- |
| Architecture | Reuses candidate, tree-inspection, view, session, result and correction modules; no parallel permission store or delivery path. Public workspace review now composes exact evidence and one correction. | Legacy prepared-checkout command remains separate. Native RDD is not authenticated by this model-backed adapter. |
| Security | Private-index snapshot, exact tree/file contents, unexpected untracked detection, source/view drift validation, provider consent, no reviewer tools, distinct configured model, finding-path correction limit. | Participant model IDs are descriptive; no real provider called. Same-user TOCTOU and temp-file forensic recovery are not closed. |
| Reliability | Public tests cover success-awaiting-tests, finding, bounded correction/new reviewer, out-of-scope untracked block and drift rejection; view disposed on normal/cancel paths. | Correction/session ownership is in-memory; hard process crash can leave a temporary view for later manual cleanup. Simultaneous-edit stress and multi-OS new-flow evidence remain open. |
| Performance | One bounded review call per candidate and at most one bounded correction call. | No reproducible before/after benchmark; candidate capture and full diff are repeated for each new candidate. No speedup claimed. |

### Follow-up — interrupted provider response and retry

A real temporary Git repository integration test now aborts after the reviewer response is yielded but before the result can be bound. The handler rejects the interrupted attempt, emits no approval/result notification, and disposes its owned view in `finally`; a retry reviews the current candidate and returns only `passed-awaiting-tests`. `tests/ordinary-review-workspace-flow.test.ts`: 4/4 PASS. This demonstrates in-process cancellation and safe retry, not SIGKILL/restart recovery, filesystem isolation, provider authentication or candidate acceptance. `TMPDIR=/tmp npm run check` passes after this regression. T05 remains PARTIAL.

## Verification

- Focused workspace/reviewer/session/correction tests: 60/60 PASS; prior-checkout freshness hardening is also in the full suite.
- Typecheck and build: PASS. `TMPDIR=/tmp npm run check`: 2,229 passed, 0 failed, 19 skipped; local parity, skills, skill-parity, memory and tracked-boundary audits pass. Ecosystem normative source proof remains NOT ADMITTED because its retained repository is unavailable.
- `npm run verify:pack`: PASS; installed Pi package verified, 11 RPC commands, 16 tools, 28 public exports, packed install verified. Exact source candidate `8aff8baf0ee1fa199d0d0611323d0adaf4f18ce2` Pi 1.2.0 Linux package matrix: TUI/RPC/JSON/print all PASS; natural shutdown and zero model calls; cleanup confirmed.
- Final documentation candidate `5a231ca080d0696b01d9b1c7b2907ed0df1f9cbf`: CI attempt 2 PASS (Ubuntu/macOS/Windows full suite and Pi host matrix); Release Gate PASS on all three platforms; Phase 0 and Pi 1.2 runtime evidence PASS. The first Windows suite attempt failed the existing two-process journal stress at its fixed 3-second lock boundary; that one job was rerun after the workflow completed and passed, with no code or timeout changes. This was not a T05 failure. Pi Free Smoke was skipped by workflow conditions, not counted as PASS.
- External independent review: not obtained; CodeRabbit service/CLI unavailable. Do not treat this self-audit as independent signoff.
- T05 remains PARTIAL. Critical/high containment and scope omissions found in the local R4 pass were corrected and regression-tested; provider identity/authentication, tests/acceptance, durable crash recovery, OS isolation, external R4 and final exact-SHA CI remain closure gates.

The previous full-suite result predates the final callback-injection correction. The current corrected candidate still requires a full-suite rerun before admission.

## R4 hardening follow-up — 2026-10-29

Independent adversarial inspection of the follow-up identified the issues below. The candidate includes the listed mitigations; the residual high-severity same-user path race remains open. This record does not claim external RDD approval or T05 closure.

| Finding and severity | Reproduction, correction and regression | Residual |
| --- | --- | --- |
| Critical: review diff could execute a configured Git text-conversion command and omit the real change. | A disposable repository with `diff.fixture.textconv` executed a marker in the positive control; workspace diff now uses `--no-textconv` and includes the actual change without executing the marker. `tests/workspace-review-projection.test.ts`. | Same-user filesystem races remain outside the protection of these Git flags. |
| High: replacement Git objects could substitute the candidate diff. | A real `git replace` tree changed the diff while candidate bytes remained unchanged. All projection Git operations now disable replacements and lazy fetching; `tests/workspace-review-session.test.ts` verifies the original diff. | The projection still requires exact source/view revalidation; the view is not an OS sandbox. |
| High: a physically replaced repository or changed index flags could retain an old review/correction. | Temporary Git tests replace a repository with identical bytes and toggle index flags. Projection retains a private binding to the root and Git relationship; correction keeps that binding across rounds. | Identity checks detect observed replacement but cannot eliminate every same-user race between checks. |
| High: failure cleanup could remove foreign data after substitution of the temporary view or hooks directory. | Fault-injection regressions replace those directories and verify foreign data survives. A failed view is retained for inspection; hooks scratch is removed only if still owned and empty. The temporary index was eliminated: trees are built with bounded Git `mktree` batches. | Interrupted or failed materialization can leave candidate bytes in a temporary directory. Manual, identity-safe cleanup may be required. |
| High: cancellation, session switching, changed base or reentrant notification could bind or revive stale correction results. | Public-flow regressions cover cancellation after the final event, retry, session change, base/scope drift, reentrancy, and view cleanup failure. Each attempt has a fresh ID; results are notified only after cleanup and source revalidation. | State remains in memory; hard restart needs a fresh proposal. Tracked-file scope is not yet tied to a live write authorization. |
| Compatibility: Git 2.43 lacks the `--no-lazy-fetch` option. | The no-fetch environment control and disabled protocols were exercised against `/usr/bin/git` 2.43.0; the three focused Git suites passed 43/43, including a real missing-promisor-object test. | Windows/macOS and exact-SHA CI are required for this candidate. |
| High: corrupt HEAD was mistaken for an unborn branch. | A temporary repository with an existing branch reference pointing to a missing object is now rejected; a genuinely unborn repository remains supported. `tests/workspace-review-projection.test.ts`. | Linked-worktree and platform behavior remain subject to exact-candidate CI. |
| High, open: an attacker running as the same user can race path operations during capture or view creation. | Independent inspection reproduced creation of an outside directory and candidate file during a parent substitution; a separate substitution caused capture of unrelated file bytes. Parent checks, per-segment creation, and file-descriptor identity validation narrow the observed windows. | Path-based checks are not atomic. The descriptor check blocks substitution between the initial file stat and open, but a parent can still be swapped before the initial stat or during other operations. An OS-backed boundary or equivalent is required for a strong guarantee. T05 remains PARTIAL. |

The temporary Git tree builder was independently compared with Git's index tree for nested paths, Unicode names, gitlinks, symlinks, executable mode and SHA-256 repositories. No broad performance improvement is claimed: batching depends on path depth and change distribution. The existing committed-candidate evidence executor remains unsuitable for protected execution of an uncommitted workspace candidate: its process can access the host, and this environment does not permit the tested sandbox namespace setup. Real provider invocation, candidate-bound tests, acceptance, durable crash recovery and independent external signoff remain open. T05 remains PARTIAL.
