# ECO-01C-2 source-adjudication evidence

## Current reconciliation — exact B0 candidate `2b3a83938fd4a54923c7da351a5f93ba2602d035`

The verified two-commit slice is `c5964f0` → `5a41c34` → `2b3a839`: 10 paths, +308/-27, tree `e5f5d3899b3fa55452f9c1b4b7dcb464bf679926`, diff `842c34d98f2879b2fdbb0cf8490ef12b5848aee4`. B0 is DONE. B1 remains in progress until parent-observed structural verification and the parent metadata commit; B2 remains pending publication. The later metadata commit must not inherit or restate the full-run result as same-SHA evidence.

Frozen source commit `08de420ca29be16b6f6bee725a30b599b061df16` still has 167 tracked manifest objects and 988 scanner references. Its 164 raw unresolved/absent/outside-root references have 164 identity-bound adjudications and zero rows remaining in that cohort. This is not broad semantic closure: ECO-01C and ECO-01E remain `PARTIAL`, claims remain 16 `PARTIAL` / 0 `FULL`, and all 988 semantics are not asserted closed. The 25 `source-runtime-edge` rows retain their exact dispositions: 3 tracked file/set edges, 12 self-owned code contracts, and 10 external/dynamic runtime inputs. No source change is auto-adopted.

## Exact-candidate verification

- One full `npm run check` selected 1,020 tests: core 970 selected / 967 passed / 3 platform skips / 0 failed or cancelled in 1,167,285.3485 ms; serial process batch 50/50 passed with 0 skipped, failed, or cancelled in 156,842.0789 ms. Combined: 1,017 passed, 3 skips, 0 failures, 0 cancellations. Skips: POSIX private-mode/symlink behavior, Windows symlink `EPERM`, and nonportable recursive `fs.watch` delivery.
- Typecheck and six audits passed: parity 500 IDs / 350 actionable / 6 of 6; skills 27; skill parity 12; memory source inspected only, not a runtime claim; ecosystem 167 objects / 16 `PARTIAL`; upstream 475 paths. The selected full run covered the 167-source-object adjudication; no separate 23/23 execution is claimed.
- `verify:pack` passed through prepack/typecheck with 225 files, 28 exports, and isolated-install verification. `npm audit --json` reported 0 advisories. The earlier install report of one high advisory versus current zero remains unexplained, not repaired; no dependency or lockfile mutation is attributed to this unit.
- Exact-candidate R1/R2/R3/R4 passed. Classification RED (8 total / 7 passed / 1 failed), GREEN (8/8), and serial 50/50 are reconstructable. Original marker-RED history remains unavailable and disclosed. Full log SHA-256: `7f6bf2396dcdb7407e4c4d63a49806b070bb950afb2fe0bd4b5ba3d9247e0f24`; no private absolute temporary path is committed.
- Parent facade invocation for exact candidate `2b3a839` returned pre-native `operation_timeout` / `not_started`; the independent functional verifier performed no native call. Native authority creation did not start, so no lineage, acknowledgement, approval, or native PASS exists. Review `review-c947795ac6dafe15` remains a separate historically stopped, manually unapproved transaction.

## Historical failed baseline — preserved

At `c5964f0`, the fresh Windows/Node 24 retained-source run failed after about 28 minutes: 1,012 total, 1,004 passed, 4 failed, 1 cancelled, and 3 skipped. Its reported process/RPC failures and one-high-advisory install report remain historical evidence. Earlier exact-SHA GitHub runs for `c5964f0` were green and Pi Free Smoke was skipped; neither those results nor the current `2b3a839` result transfers to another SHA.

## Historical evidence below

The remaining sections preserve the earlier 34-row / 130-remaining slice and subsequent correction chronology. Their counts and pending-work statements are historical, not the current closure state above.

## Historical scope and identity

- Repository: `asenbanskaliev/ASEN`
- Branch: `feat/strict-parity-prerequisites`
- PR: #32 (open, draft)
- Validated candidate: `47e9d0fcb6dca57215f1e024b4a1bd7417b5c3f8`
- Candidate parent: `8d6a8b51a687b6df8fe73d3b85cb6beba9eb5fd8`
- Main at reconciliation: `49129b616c5349fbf323b74860136fc1593f9b2a`
- Frozen source identity: commit `08de420ca29be16b6f6bee725a30b599b061df16`, tree `9af648106ed75fa270476e9d474bad93aa38af6b`.
- Source inputs were fetched as Git objects into a temporary bare repository in Actions. The workflow checked the frozen commit and tree before running the retained-source verifier. Source was not checked out or executed.

## Historical 34-row slice

The slice adjudicates 14 unresolved `asset` references in two frozen source files:

- `lib/review-candidate-view-owner.ts`: 7 rows.
- `lib/review-object-store.ts`: 7 rows.

The rows bind to imported `node:fs` `readFileSync` calls. Classification: `runtime-state-read`. Disposition: `runtime-state-not-source-edge`. The exact spans, call lines, frozen object identity, byte lengths and SHA-256 values are bound by the overlay and checked by the retained-source verifier.

The overlay now has 34 rows. The raw manifest is unchanged: 167 tracked objects, 988 references, 164 raw unresolved/absent/outside-root references. After subtracting overlay adjudications, 130 semantic adjudications remain. Claims remain 16 PARTIAL, 0 FULL. No R01–R20 claim changed.

## Historical workflow evidence for exact SHA

| Workflow | Run | Result | Detail |
| --- | ---: | --- | --- |
| Push CI | 37812221460 | SUCCESS | Ubuntu 1,006 passed/0 failed/0 skipped; macOS 1,006/0/0; Windows 1,004 passed/0 failed/2 skipped. |
| PR CI | 37812227887 | SUCCESS | Same platform counts as push CI. |
| Phase 0 Architecture | 37812227873 | SUCCESS | Architecture job passed. |
| Pi 1.0 runtime evidence | 37812227874 | SUCCESS | Runtime evidence job passed. |
| Release Gate | 37812227854 | SUCCESS | Ubuntu, macOS and Windows package jobs passed, including pack/install checks. |
| Pi Free Smoke | 37812227925 | SKIPPED | Skipped; not a PASS. |

On every CI platform, test 138 (`thirty-four-reference overlay adjudicates four frozen filesystem sources without mutating scanner evidence`) and test 139 (`four-source overlay rejects identity, ordering, binding, span and authority mutations`) passed. Windows' two skips were unrelated, platform-specific tests: POSIX private-mode/symlink behavior and recursive `fs.watch` delivery. Baseline object verification reported all 167 tracked objects; claims validation reported 16 PARTIAL.

These results apply only to `47e9d0f`; no PASS is transferred to another SHA. No local ASEN test execution occurred.

## Failed attempts and corrections

- At `85fc6163468f5b6ad2e4db92c2481b6360cd08d6`, push CI run 37811551326 and PR CI run 37811558233 failed in “Prepare frozen ecosystem Git objects”: the helper incorrectly fetched the frozen source commit from the ASEN repository, where that commit is not advertised. No semantic result was claimed.
- At `993c0dbc86512a76936e7897cfc81016ae3fec17`, retained-source adjudication test 138 passed. Adversarial test 139 failed because the “fourth source” mutation reused an earlier source ID and was rejected first by the duplicate/order guard, while the assertion expected a later identity-mismatch error. The mutation was changed to an unknown source ID so the intended identity check is exercised. This was a test expectation/order issue, not a production defect.
- At `47e9d0f`, tests 138 and 139 both passed on all three operating systems.

## TDD limitation

The earlier candidate was committed while the retained-source tests skipped because `ECOSYSTEM_BASELINE_REPOSITORY` was unavailable in CI. CI was then changed to resolve the frozen public Git commit by exact SHA and fetch it into a bare repository. When the semantic tests finally ran, the proposed overlay passed. No meaningful semantic RED was observed before the overlay implementation; the only observed RED was the incorrect adversarial-test expectation at `993c0db`. This report does not present that test failure as a reproduced source-adjudication bug or claim a complete historical TDD cycle.

## Historical cost and then-remaining work

- External model/provider calls: 0.
- New CI runs for the correction: push, PR, Phase 0, Pi runtime, Release Gate and Pi Free Smoke at the exact candidate SHA; no reruns of the successful final SHA.
- Remaining source semantic adjudications: 130.
- Next work stays within ECO-01C-2. ECO-01E, runtime work and any parity promotion remain out of scope until the next bounded unit is closed with exact-source evidence.
