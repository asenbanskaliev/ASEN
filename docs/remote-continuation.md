# Remote continuation plan

## Checkpoint status

This publication is a **WIP checkpoint, not FULL parity**. Start from base `f2ed915d475408481aeec648cba248a13957e09f` on `feat/strict-parity-prerequisites`, then inspect the exact pushed candidate rather than assuming every local historical receipt is portable.

The remote continuation began from published checkpoint `4a4c7e71a876b83f76c0bbfc0d26163dfa2c1b0f`. The owner now authorizes clean-clone setup, work branches and reviewable PRs against `feat/strict-parity-prerequisites`, without merge/releases, provider credits or installed Reference/Pi changes. Keep the old quarantined-child incident separate. L474 onward records the new scoped checks; older local-only restrictions describe their historical runs.

The canonical source of truth is the latest log in [`odd/tasks/pi-capability-completion.md`](../odd/tasks/pi-capability-completion.md). The earlier [`resume handoff`](../odd/handoffs/pi-capability-completion-resume.md) is historical context. Keep the tracked [`parity map`](../odd/tasks/ecosystem-final-parity-map.md) and registry/claim files aligned, but do not let an older summary override the canonical log. Cached receipts unavailable in a clean clone are historical claims, not remote approval.

Static local metadata that reported Reference Shell 4.3.0 and Pi Coding Agent 1.4.0 is neither a complete immutable reference binding nor proof of the versions loaded by a live runtime.

## Clean-clone setup and verification

1. Read `package.json` before setup. It currently requires Node `>=22.19.0`.
2. In a disposable remote environment, use `npm ci` to install the lockfile's supported versions. Do not copy `node_modules`, cached SDKs, local profiles, `.cache`, or `.codegraph` from another machine.
3. Before executing tests, inspect `scripts/run-tests.mjs` and the selected tests for timeouts, child-process cleanup, filesystem effects, and state locations. Give stateful checks isolated project-owned home/config/cache/data/temp roots.
4. Run focused tests for the bounded change first, then `npm run typecheck` and `npm run build`. Before T12, run the broader audits plus applicable package and platform checks defined in `package.json` and the workflow.
5. These commands are instructions only; this document does **not** claim they passed.

GitHub Actions runs on `pull_request` and on pushes to `main`; a push only to this feature branch does not by itself produce a green CI run. The workflow currently uses `npm install` in its main test job and `npm ci` in the Pi support matrix, so review the exact remote results rather than assuming local setup and CI are identical.

## Ordered continuation

### A. Reconcile the remote baseline

Compare the clean clone, pushed diff, canonical latest log, parity map/registry, and available tracked evidence. Preserve historical failures and admissions. Do not promote a capability from file presence, broad tests, or unavailable cache receipts.

### B. Finish T09 maintenance

Use the audited, phased execution checklist in [`docs/t09-autopilot-closure-plan.md`](t09-autopilot-closure-plan.md). Its current baseline is the PR #37 head recorded in that document; reconcile it again before implementation or publication. The plan is operational guidance, not evidence of completion.

Advance real update/restore/managed removal/browser/bootstrap/distribution work. Reuse admitted selection, launch, doctor, finite backup, reader, isolated restore-stage, preview, and expected-byte staging pieces. Version rollback is not data restore; a preview is not an executed installation. Keep acquisition, authenticity, activation, live restore, uninstall preservation, clean-machine behavior, and platform proof explicit.

L478 adds the public lifecycle commands (signed install/upgrade/rollback, backup/restore, managed-only uninstall, browser consent). T09-U9d adds explicit local `managed update ... --stage --yes` composition plus a reproduced POSIX directory-link-count correction; staging does not download, select or run a version. PR #37 baseline `18e9872` had passing Linux/macOS/Windows CI/package/Release Gate, Pi matrices and Pi runtime evidence; this was not a full lifecycle receipt. T09 remains PARTIAL under the renegotiated bounded scope in [`docs/t09-autopilot-closure-plan.md`](t09-autopilot-closure-plan.md). The current candidate adds restart recovery for interrupted restore staging/publication and staged-config creation, plus fail-closed uninstall locking. Independent review of the staged-config recovery delta found no concrete issue. Exact candidate `57e706b3dada312dd195f75d849f1d566a5ed05d` passed CI and Release Gate on Linux/macOS/Windows, plus Phase 0, Pi runtime evidence and the Pi support matrix; Pi Free Smoke was skipped. Its packed Windows smoke confirms the renamed-marker correction. Concurrent uninstall route-substitution evidence remains outstanding, so T09 is still PARTIAL. OS browser launching and the inherited non-bundled Pi advisory remain disclosed external debt. The full immutable Reference 4.3.0 binding is still missing; no new reference equivalence is inferred.

### C. T05 exact-change review and correction — renegotiated local FULL

The approved FULL scope is limited to the deterministic public `/asen-review workspace` contract in `docs/audit/t04-t05-full-closure-plan-2026-10-30.md`; it does not claim original S6 or Reference Shell parity. PR #38 candidate `a523fd5a7f9d970d7ea471a031197506dbaa2e7e` passes the exact-SHA CI suites and Pi support matrices on Linux/macOS/Windows, Release Gate on all three systems, Phase 0, Pi runtime evidence and `t05-r4-audit`. Independent manual R4 review found no remaining issue. Its focused T04/T05/T10/R4 suite passes 104/104; the renegotiated T04/T05 acceptance set passes 52/52. Keep real-provider authentication, restart-durable public review state, OS sandboxing and formal external signoff visible as excluded debt. A reviewer/model result never grants delivery authority.

The initial independent R4 review found a MEDIUM sensitive-path disclosure on the old PR head: selected `.env*`, `*.pem`, and `*.key` contents could reach the reviewer provider. The reconciled candidate rejects those paths before snapshot creation and again at the provider boundary. The live NVIDIA CI job is opt-in via `ASEN_ENABLE_LIVE_T04_T05_NVIDIA=true`; Pi Free Smoke and NVIDIA were skipped, and no provider was invoked. The full local test run on Node 26 retained two child-process failures because `--experimental-transform-types` is unsupported there; supported Node 22 CI passed. T04 is FULL only for its renegotiated local recovery contract; original S5 and broader host parity remain PARTIAL. The canonical ODD records both bounded FULL claims without promoting the global parity registry.

Complete owned materialization and lifetime, then public candidate/controller/correction/acceptance integration. Preserve admitted A1/A2a1/A2a2 units. Do not treat a writable copy, stale result, model output, or cached verdict as authority. The retained Windows ACL fixture and restoration uncertainty require an ownership-safe disposition before claiming a ready review view.

### D. Finish T10 workspace behavior

Implement bounded units for observed background-job exits, agents, cross-session boundaries, workspace actions/conflicts, notifications, and accessibility. Preserve admitted A3 history projection. A4 agent-status sanitization remains unadmitted because the verifier lifecycle failed/quarantined even though scoped functional evidence and PASS text exist.

### E. Start T11 only from a real mapping

Add client adapters only after mapping an actual reference client and its capabilities. Keep Pi guarantees shared where valid, but do not fabricate identical tools, delegation, permissions, or host behavior across clients.

### F. Resolve T04 and T07 honestly

T04's renegotiated provider-free durable local recovery contract is FULL, but original S5 still needs real Pi/provider interruption and controller evidence. T07 needs a real disposable-project CodeGraph/offline lifecycle. Mocks, an ancestor/existing index, or launcher presence are insufficient. Preserve prior stopped jobs and failed envelopes; do not retry blindly.

### G. Run T12 last

Bind one exact candidate and run its focused tests, broader audits, package checks, and applicable Windows/platform proof. No parity claim is valid while required implementation or evidence is missing.

## Delivery shape

Use PR-sized units with their tests, docs, and old/new differentials for shared contracts. Mark unavailable capabilities blocked rather than documenting them as complete. No merge, release, destructive maintenance, provider action, or native approval is implied by this checkpoint.

Initial GitHub coding-agent assignment: first reconcile the clean remote baseline and canonical task state; then take the next coherent T09 gap through bounded PRs, beginning with the smallest dependency-ready part of executable managed update/restore/bootstrap work. Do not launch another agent from this document; no remote agent is launched here.

## Exact candidate checkpoint — 2026-10-28

PR #37 remains open on `feat/t09-managed-update-stage`. Initial remote HEAD was `c0d5caa0dbe7e4da835af5681b7396d2307fb532`; the diagnostic candidate `c3da3bd40faf644a897241580b751e882dae4e91` adds bounded, test-only Pi verifier shutdown tracing and a regression for the forced-kill case. On that exact candidate, Phase 0 Architecture, Pi 1.2 runtime evidence and Release Gate passed. Release Gate's packed real-Pi install receipts report three natural process exits and successful restart/cross-session execution on Linux, macOS and Windows. Its real-package smoke passed the signed local install/backup/restore/uninstall cycle described below on all three systems. Runners used Node 22.23.3 on Ubuntu 24.04 and macOS 26.6.2 arm64, Node 22.23.4 on Windows Server 2025, and Pi 1.2.0 throughout. Exact artifacts: Linux `12802685497`, macOS `12802520922`, Windows `12801479491` (run `40657477870`). Pi Free Smoke was skipped by its workflow condition. CI run `40657477741` was still in progress when this checkpoint was prepared; do not claim it passed until its final conclusion is observed.

The historical Release Gate failure on `c0d5caa` was `verify:package-receipts -- stateful-evidence` on Windows. The nested Pi package verifier did not close naturally within its existing 5-second grace after stdin EOF and was force-killed; the verifier correctly failed. The diagnostic candidate passed without changing shutdown behavior or increasing timeouts. Therefore the historical failure is **not reproduced, not causally resolved**; whether it was timing-sensitive cleanup or a runner/Pi-host issue remains unknown. See the exact workflow and candidate artifacts linked in the PR.

T09 remains **PARTIAL**. The packed-package smoke includes a local Ed25519-signed install under an ephemeral explicit trust anchor, doctor and installed CLI checks, backup plus integrity verification, restore to a clean target with data/config comparison, managed uninstall, and preservation of sample user data. It does not prove remote HTTPS acquisition, A-to-B activation/rollback, SQLite-active consistency, corrupt/interrupted restore recovery, symlink/concurrent-route uninstall protection, or a real browser launch. Keep T05, T10 and T11 statuses tied to their own evidence.

### R4 residual: Pi host dependency advisory

`npm audit --json` on this candidate's development/test dependency graph reports 2 advisories (1 moderate, 1 high) in `@earendil-works/pi-coding-agent@1.2.0` → `undici@8.10.2`, including TLS certificate validation bypass [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx). Pi imports its Undici HTTP dispatcher. This is in the development Pi host dependency graph, not the packed ASEN tarball; ASEN declares Pi as an optional peer and does not bundle its dependency tree. npm's suggested Pi fix is `0.75.3`, a major-version downgrade incompatible with the required Pi 1.2.0 baseline. No dependency override or host-version substitution was made. Treat Pi 1.2.0's vulnerable Undici as a high inherited host risk and keep T09 security closure PARTIAL until a supported Pi-side fix is available and verified.

### T09 follow-up — 2026-10-28

Continuation began from reconfirmed PR #37 HEAD `425170f02db2fa69327d4cc415b059a09ce004ec`. Added regression coverage through the public CLI for signed HTTPS loopback install, A→B upgrade, rollback, user-data preservation, and explicit TLS trust (unknown CA rejected with no install effects; trusted test CA accepted). Full local suite passed 2,211 / 0 failures / 19 conditional skips; typecheck, build, `npm run check`, `npm run verify:pack` and diff check passed. `verify:pack` validated the real generated ASEN tarball's host boundary (361 files, 28 exports, 11 commands, 16 tools). These local checks are distinct from the existing three-OS Release Gate real-package lifecycle receipts; this added upgrade/TLS regression has not yet run in CI or against the real packed artifact.

R4 review retains the Pi 1.2.0 → Undici advisories as inherited and unresolved. The checked dispatcher setup contains no function-valued TLS option identified by GHSA-2m5v-pch6-74hx as the trigger for its TLS bypass, but that observation does not prove all Pi paths unaffected. T09 remains PARTIAL pending exact-SHA CI and real-package/platform/update, restore recovery, uninstall race, browser-launch and dependency remediation evidence. Do not change T05/T10/T11 states.

### T09 real-package acquisition extension — 2026-10-28

The disposable real npm-package smoke now performs signed HTTPS upgrade of the packed ASEN product from 0.1.0 to a versioned 0.1.1 copy and rollback, checking the installed CLI version and user-data invariance. The copy changes only its package version and the two compiled CLI version literals; all other package files derive from the real tarball. It also corrupts a real generated backup, verifies restore fails without creating target paths, then restores the valid backup to that same target and compares data/config before managed uninstall and data-preservation checks. Linux Node 24.22.1 passed this cycle. The first attempt uncovered a harness defect: synchronous `execFileSync` blocked the loopback HTTPS server event loop; asynchronous `execFile` fixed the reproduction. Typecheck, build and `verify:pack` pass. This harness extension still needs exact-SHA Release Gate on Windows/macOS and does not close interruption/SQLite restore, concurrent uninstall substitution, actual browser opening, or inherited Pi dependency risk. T09 remains PARTIAL.

The first Release Gate for the extended smoke (`2d50f464bc054045d7ef57146f0f9dee9fc239d6`) failed on Ubuntu with `ENOENT` for the TLS test key because the job changes into its temporary npm project before invoking the script. The script incorrectly resolved repository fixtures relative to process cwd. The fix anchors fixtures at the script's module URL. Reproduction with the same temporary cwd passed locally; macOS/Windows package jobs were cancelled after the Ubuntu failure and are not evidence. A corrected exact-SHA CI round is required; CI for the failed candidate remained in progress when this note was updated.


## T09 next-priority result — SQLite-consistent backup and restore failure recovery (2026-10-28)

Working branch remains `feat/t09-managed-update-stage`, PR #37, base candidate `9a235e15ce523c610cc7a5a726c77e8601fe2c13`. No branch or PR was created. A live-WAL SQLite regression initially failed because whole-home backup serialized raw database sidecars; the implementation now snapshots through read-only `VACUUM INTO`, integrity-checks and bounds the snapshot, omits WAL/SHM/journal sidecars, and binds the original database path to its observed file identity. Regression proves committed WAL data is backed up, post-snapshot writes are excluded, and restored SQLite integrity is `ok`. A handled staging-failure test proves cleanup, preservation and successful retry. Full local suite: 2,214 passed, 0 failed, 19 conditional skips; `npm run check`, typecheck, build and `verify:pack` passed after the lazy SQLite import and child-process version regression.

This does **not** prove abrupt process/power-loss recovery during restore publication. A caught injected error is not equivalent to SIGKILL; a durable journal/recovery protocol may be required to close that criterion. The actual packed smoke has not yet run this new SQLite case on Windows/macOS. Keep T09 PARTIAL and T05/T10/T11 unchanged until exact-SHA CI and outstanding criteria are evidenced.


The first CI candidate `49aa9e9c61cd01e82e4f78b724e4d8673b87fed3` exposed a cross-platform regression from eager `node:sqlite` import: Node 22 wrote an experimental warning to stderr for unrelated CLI invocations, causing Release Gate's packed version probe to fail and 50 Windows/Linux assertions to fail. The log identifies `stderr-not-empty` and the warning; the fix lazy-loads SQLite only when a database file is detected and adds a child-process clean-stderr regression. The failed candidate is not considered green. Its exact Phase 0/Pi evidence passed; CI/Release Gate require a new exact SHA.

### T09 macOS smoke timeout and SQLite WAL follow-up — 2026-10-28

On candidate `a1e389dc8b1d7461f1b35bb5e49449d3942d700a`, Phase 0/Pi runtime passed; Release Gate Linux and Windows passed, while macOS real-package `managed upgrade` was terminated by the harness after 60 seconds with empty stdout/stderr. The product acquisition timeout is 60 seconds too, so the smoke had a deadline collision and suppressed the product's own terminal failure report. Root cause of the macOS request reaching that deadline is not yet established. The runner now gives only that child 75 seconds (product limit plus bounded reporting/cleanup margin) and records local HTTPS request paths plus TLS/client errors if it fails; no product timeout or retry was changed.

Locally on Linux/Node 24.22.1, the actual npm tarball completed signed loopback HTTPS upgrade and rollback, data preservation, backup of active SQLite WAL, integrity-checked snapshot-time restore, corrupt restore no-effects/retry, and uninstall retaining user data. The lifecycle suite passed 30/30 including SIGKILL during restore staging: the pre-existing target remained intact and retry completed, though an unpublished private staging directory remains after abrupt termination. Exact-candidate macOS/Windows evidence for these latest smoke assertions is pending; T09 remains PARTIAL. The inherited Pi 1.2.0/Undici advisories and uninstall route-substitution/browser-opening gaps remain open. T05/T10/T11 unchanged.

### macOS full-suite chunk correction — 2026-10-28

Final candidate `12e3f08d57810bdb34aded2df3193699750d9c36`: Phase 0, Pi runtime, Pi support matrix and Release Gate passed; real npm tarball upgrade/rollback plus active SQLite WAL snapshot/restore passed in Linux, macOS and Windows. Ubuntu full CI passed. macOS full CI failed only because `planTestRuns` submitted all test files in one chunk and the unchanged 600,000 ms chunk watchdog returned 124 at 600,183 ms with cleanup confirmed. A new planner regression reproduces one chunk for 121 macOS files; the correction splits macOS into 50-file sequential chunks, preserving all tests and unchanged per-chunk/global deadlines. Focused runner tests pass 21/21. Full local checks and a corrective exact-SHA CI run are pending; Windows full-suite conclusion on `12e3f08` is also pending. T09 remains PARTIAL.

The same candidate's Windows suite identified an added-test portability defect: its child ESM import used a raw Windows drive path and failed with `ERR_UNSUPPORTED_ESM_URL_SCHEME` before reaching the restore checkpoint. The test now uses `pathToFileURL`; its isolated Linux reproduction passes. A first local check also caught and fixed a TypeScript implicit-any annotation in the planner regression. Full consolidated validation is rerunning before publication.

Corrected local validation is green: `npm run check` reports 2,216 passed, 0 failed, 19 conditional skips; parity/skills/memory/upstream-boundary audits pass. Ecosystem normative-source evidence remains NOT ADMITTED because the retained reference checkout is unavailable. Typecheck, build, verify-pack and diff-check pass. Package product code is unchanged from the Linux/macOS/Windows Release Gate success on `12e3f08`; still require Release Gate and full CI on the corrective SHA. T09 PARTIAL.
