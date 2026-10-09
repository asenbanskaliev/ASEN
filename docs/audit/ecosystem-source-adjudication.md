# ECO-01C-2 source-adjudication evidence

## Superseding reconciliation — 2026-10-09

The production source/runtime candidate remains unchanged at `c5964f0c0dabc7c1abc0ce8c831caf6efa6831ce`; the current B0 working tree additionally changes only the test harness, focused tests, and matching audit/task records. Frozen source commit `08de420ca29be16b6f6bee725a30b599b061df16` still has 167 tracked manifest objects and 988 scanner references. Its 164 raw unresolved/absent/outside-root references are covered by **164 adjudications / 0 remaining** without changing the manifest or raw references. Claims remain 16 PARTIAL / 0 FULL; ECO-01C remains `PARTIAL` because complete normative semantics remain open.

The 25 `source-runtime-edge` adjudications have exact span-bound dispositions in `registry/parity/ecosystem-runtime-edge-mappings-v1.json`: 3 tracked file/set edges, 12 self-owned code contracts, and 10 external/dynamic runtime inputs. The two selector rows refer to the same `assets/agents/*.md` direct-child set; the pinned tree contains 10 regular Markdown blobs. Drift behavior includes report-only classifications, reverse invalidation, unique-hash-only renames, all-path invalidation for duplicate hashes, and changed/added/removed tracked-selector fixtures. No source change is auto-adopted or asserted equivalent merely because it is mapped.

Initial exact-SHA GitHub evidence for `c5964f0` is green: CI runs `37894164914` and `37894160142`, Phase 0 Architecture `37894164830`, Pi 1.0 runtime evidence `37894164801`, and Release Gate `37894164816` succeeded. Pi Free Smoke `37894164792` was SKIPPED, not PASS. The branch is 305 ahead / 0 behind `main` `49129b616c5349fbf323b74860136fc1593f9b2a`; PR #32 is OPEN + DRAFT with CLEAN merge state. These observations do not transfer to another SHA or promote a claim.

## Reproduction boundary and fresh local result

- Runtime contract: Node 22.19 or newer and Git. The observed fresh Windows run used Node 24.14.0 and npm 11.9.0.
- Dependency setup: `npm ci --ignore-scripts` and the subsequent ordinary `npm ci` both succeeded and materialized 150 packages. npm reported one high-severity audit advisory; it remains pending investigation, and no dependency change is included here.
- Retained source: use the existing `.github/scripts/prepare-frozen-ecosystem-baseline.mjs` workflow helper to create the frozen bare Git repository, then provide its path as `ECOSYSTEM_BASELINE_REPOSITORY`. The source is read as Git objects, not checked out or executed.
- Windows containment: Windows PowerShell, `Add-Type`, and Job Object support are prerequisites; the environment must permit assigning the suspended child process to the kill-on-close job.
- Fresh baseline: retained-source `npm run check` **FAILED** after about 28 minutes with 1,012 total, 1,004 passed, 4 failed, 1 cancelled, and 3 skipped. The reported failures were the offline Pi RPC timeout, the execution-descendant start assertion, Pi cancellation descendant handling, and the policy/read-only Pi runner timing out instead of reporting the disabled tool. The contained-process test was cancelled at 10 seconds. No environmental cause is inferred.
- Delivery consequence: this Windows/Node 24 failure is distinct from the historical exact-SHA GitHub green runs. B0 Windows process isolation/fix is in progress; B1 awaits its isolated baseline, B2 remains pending, and publication is blocked. No fresh full-suite passing count or B1 completion is claimed.
- Independent 4R evidence before this correction reported the retained-source baseline 23/23, `npm run build`, and `npm run verify:pack` passing. The install summary separately reported one high-severity audit advisory, but its exact `npm audit` identity was not established in this bounded unit. This discrepancy remains open; no dependency or lockfile change is authorized.
- B0 now has deterministic focused RED/GREEN coverage for complete discovery, Windows batch separation, serial orchestration, option ordering, import safety, and first-failure propagation. The focused execution-timeout fixture passes with its rejection handler attached before marker polling. The expensive full `npm test`/`npm run check` remains delegated to independent verification, so B0, B1, and B2 stay unchecked.

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
