# Final ecosystem parity map

## Purpose

This is the controlling reverse-audit map for final ASEN ecosystem closure; `ecosystem-strict-parity.md` remains the sole execution backlog. A numbered ECO unit is not sufficient evidence by itself. Closure requires every observable Reference A surface to map to an ASEN behavior, an automated/runtime proof, or an honestly disclosed disposition.

The authoritative frozen machine snapshot of Reference A remains pinned to `08de420ca29be16b6f6bee725a30b599b061df16`. The [supplemental extension comparison](reference-extension-parity.md) is a later version of the same Reference A product at `6e681f1d08fff3092273cf305206094d15cacd18`, not a second provider or memory source. It is source analysis only—not an automatic rebaseline, drift adoption, runtime proof or `FULL` claim. Existing registry records and snapshot counts remain untouched. Do not copy branding, artwork, prose, names or provider-private authority.

## Closure rule

For every row use:

`Reference surface -> ASEN surface -> implementation -> deterministic evidence -> host/platform evidence -> status`

Allowed statuses are `FULL`, `PARTIAL`, `MISSING`, `OUT_OF_SCOPE`, and `PARTIAL_BY_ACCEPTED_SCOPE`. No row becomes `FULL` from file presence or a green broad suite alone.

## Route map

| Route | Observable surface | ECO owner | Current state | Closure target |
| --- | --- | --- | --- | --- |
| R01 | install, executable, package root, project/user homes, setup/link | ECO-09 | PARTIAL | clean install, idempotency, rollback, permissions, spaces/Unicode, Windows/macOS/Linux |
| R02 | public commands, arguments, errors and availability | ECO-09/14/15 | PARTIAL | exact command inventory and behavior-backed validation |
| R03 | configuration, settings, precedence and invalid values | ECO-11 | PARTIAL | schema, deterministic precedence, diagnostics, rollback, live/restart semantics |
| R04 | profiles, routing and customization | ECO-11 | PARTIAL | safe overrides/fallbacks and exact routing evidence |
| R05 | actor/owner/session attribution for changes | ECO-10 | PARTIAL | exact actor/session/project/worktree attribution without authority inflation |
| R06 | workspace state/actions and concurrent updates | ECO-10 | PARTIAL | accessible narrow-terminal UI, conflicts, restart and isolation |
| R07 | theme, colors, banner, pretty/quiet and non-TTY presentation | ECO-14 | PARTIAL | ASEN-owned presentation contract; width/color/accessibility snapshots and host evidence |
| R08 | keyboard/interaction/dialog behavior | ECO-03/14 | PARTIAL | choice/question plus applicable shortcuts/actions, cancel/error/unavailable behavior |
| R09 | agent lifecycle/UI/RPC | ECO-05/06 | PARTIAL | ECO-05 child lifecycle independently preserves pinned authority confirmation and exact tool exclusion before dispatch; queue/cancel/continue/status/history/ownership/restart then compose with the later ECO-06 primary orchestrator without making EP-003 a child prerequisite |
| R10 | Todo/plans/replay | ECO-07 | PARTIAL | durable transitions, replay, conflicts, stale plans, crash/session isolation |
| R11 | Skill discovery/registry lifecycle | ECO-08 | PARTIAL | missing/recreated sources and cross-platform startup/restart evidence |
| R12 | tools and authority | ECO-03/04/05/06 | PARTIAL | complete public inventory, fail-closed forbidden calls and no acquired authority; keep ECO-05 child authority/tool exclusion distinct from ECO-06 primary-session safety, with child shell disabled unless separately user-admitted behind its own guards |
| R13 | sessions/resume/recovery | ECO-14 | PARTIAL | startup/restart/corruption recovery and presentation integration |
| R14 | private prompt history | ECO-12 | PARTIAL | explicit opt-in, redact-before-write, retention/search/export/delete/tombstones/recovery |
| R15 | local usage and optional telemetry | ECO-13 | PARTIAL | local-first metrics, explicit one-shot consent/preview, minimization, disable/delete, no hidden send |
| R16 | public package/API/extension exports | ECO-02/15 | PARTIAL | packed artifact and private-path rejection on final candidate/platforms |
| R17 | docs, links, examples, command references and media provenance | ECO-01/15 | PARTIAL | behavior-backed docs and automated link/command/claim/media validation |
| R18 | reverse inventory completeness | ECO-01C/01E/16 | PARTIAL | every frozen command/tool/event/config/asset/reference adjudicated; drift invalidates affected claims |
| R19 | memory integration with ecosystem | MEM R01-R09 + ECO composition | PARTIAL | do not redesign memory; prove only ecosystem-facing composition |
| R20 | failure/recovery/platform matrix | ECO-16 | PARTIAL | positive, rejection, failure, recovery, restart and applicable Windows/macOS/Linux evidence |

## Current capability execution overlay — L440

The owner approved the functional-equivalence completion plan with "hazlo asi"; see `pi-capability-completion.md` S14/L440. This overlay routes current work to the existing T/ECO owners. It is not a new backlog, reference rebaseline, registry promotion or replacement for the historical exact-candidate records below.

Working behavior target: the previously studied Reference Shell **4.3.0**. A complete immutable source/inventory binding for that target is **not yet established here**. The frozen Reference A/B identities above remain authoritative only for their own recorded evidence. Full4.3.0 equivalence requires its own pinned inventory and shared behavior/platform evidence; version labels and installed mutable paths are insufficient. Explicitly excluded optional behavior still prevents full-reference parity even when adopted-scope work is complete.

| Capability / owner | Current ASEN public surface or implementation | Recorded evidence (bounded, not full parity) | Remaining acceptance outcome |
| --- | --- | --- | --- |
| Recovery — T04 / R09,R13 | `scripts/eco06-pi-writer-e2e.mjs`; interruption inspection and dirty-candidate rejection | Local deterministic cases through L48 | Controlled abrupt child interruption, restart, retained edits and newly bound authority; explicit proof/consent stop remains |
| Exact-change review — T05 / R12,R18 | `src/review/workspace-review-projection.ts`, `review-tree-paths.ts`, `review-tree-inspection.ts`; not yet public workspace-snapshot composition | A1/A2a1/A2a2 local admissions L401/L405/L415 | Owned materialized view and safe disposal, public controller/result/correction integration, stale-result rejection and platform write-restriction proof |
| Code knowledge — T07 / R12 | `src/interaction/code-intelligence.ts`, public tool registration in `extensions/asen.ts` | Existing local tests/source evidence; no admitted lifecycle journey | Disposable-project initialization/query/change/error/restart proof and honest optional-docs availability; existing stop remains |
| Managed maintenance — T09 / R01,R02 | `src/cli.ts`: setup preview, doctor, retained selection/run, backup preview, update preview and explicit local `--stage --yes`; signed lifecycle, backup/restore and managed removal primitives | Historical admissions through L452; Windows root cause and exact 14-test red/green evidence recorded below; PR SHA `459d84c415ba2feb068968268e71eb0a0ee4d99f` Release Gate passed Ubuntu/macOS/Windows including real packed-package install lifecycle; local exact-tree lifecycle 24/24 and packed smoke PASS | **PARTIAL**. Pending: final code-candidate CI after dedicated alias regression, real interactive browser launch, same-user race-proof uninstall proof, and any remaining acquisition/activation host evidence |
| Workspace experience — T10 / R05–R10,R13–R15 | `extensions/asen.ts`; `src/runtime/command-catalog.ts`; partial status/agents/changes/todos/history/usage/profiles/memory wiring | T10-A2 display sanitization locally admitted L455:26tests/types0/2differential scenarios and independent Risk2/3 PASS; host receipts remain candidate-specific | Background jobs with observed exit, cross-session boundaries, workspace actions/conflicts, notifications, accessibility/narrow terminals and current host proof |
| Additional clients — T11 (adopted Pi-only scope, S11/L480) | Pi host contract in `src/runtime/pi-host.ts`; Pi composition in `extensions/asen.ts`; external runtimes deferred | Exact candidate `111d74a48557ccf410a94e51b4c594cd3e25041e`: CI run `40505625662` passed Linux/macOS/Windows full suites, eight Pi host cells on each platform and required audits; Release Gate `40505625687` passed package/install smoke on all three platforms; Pi 1.2 runtime evidence `40505625611` passed, artifact `12734876804` (`sha256:5bb709d1084e7a616e0386b6a9f1e7151703b0f8e3fbb3ae82e68e6f8e60c60c`). R4 finding R4-01 corrected; see `docs/audit/r4-t11-review-view-2026-10-27.md` | `FULL` within the formally adopted Pi-only scope. External clients remain deferred; no full Reference Shell parity claim |
| Final equivalence — T12 / R16–R20 | Existing reverse inventory, package/claim validators and parity registry | Registry remains16PARTIAL/0FULL; old-SHA results stay historical | One exact ASEN candidate and pinned reference, same public success/refusal/failure/recovery scenarios, supported platforms and documentation validation |

The preceding R01–R20 routes remain the completeness checklist: completed local T02/T03/T06/T08 prerequisites are not erased or automatically promoted to full equivalence. Shared scenario coverage must still include routing, permissions, memory/skills, settings, package exports and optional integrations. No missing surface is silently renamed "not applicable".

Current execution: **T09-U9d** composes confirmed local staging and corrects POSIX destination directory-link-count handling, with new clean-clone evidence at L474 onward. T09 remains partial. **T05-A2b** is blocked on identity-safe disposition of its restrictive fixture. **T10-A2/A3** are historically admitted locally; **T10-A4** remains unadmitted after its failed verifier lifecycle. Keep that incident separate. T11 is `FULL` within the adopted Pi-only scope at exact candidate `111d74a48557ccf410a94e51b4c594cd3e25041e`; this does not promote the overall Reference Shell parity registry. Current owner order for remaining work: T09 → T05 → T10 → T04/T07 remaining proof → T12 acceptance. Work branches and reviewable PRs are now authorized; merge/releases, installed-runtime mutation, provider credits and destructive host actions are excluded. Existing immutable reference pins and PARTIAL registry claims are unchanged.

### T09 execution evidence update — 2026-10-27

- Historical Windows CI run `40403608285` on `037f17317631e1231d161b130d83e9667336fba1` failed 14 managed CLI scenarios in the full-suite job. Each stalled at roughly 10 seconds with no child output; the readiness marker was absent and the child was killed. This is consistent with launch failure/hang before the CLI script ran, not a deadlock in its operation.
- The primary cause was the Windows inherited-policy launcher invoking PowerShell plus a C# `Add-Type` bridge to start the contained child suspended under a Job Object. On hosted runners that bridge could wait indefinitely before the CLI script ran; the ordinary 10-second operation deadline then terminated the launcher. The fix bypasses/removes that PowerShell bridge for this path and uses native Node spawn with `shell:false`, `detached:false` and inherited host policy (`5223c83`, `72cebf0`, `6ffd848`). The separate child-tree/close handling remains bounded. A secondary defect also existed: `realpath` could produce an 8.3 alias used as child `cwd`/argv; `edcaad4` now keeps physical identity for ownership checks and launches from an absolute lexical path. `973de8b` retains the minimum native Windows environment bootstrap; `71656e3` normalizes case-insensitive environment-key assertions.
- PR CI run `40571444978` at `3635ca8e2ef0a206ac2cbe74f5f098486c28a09c` passed the Windows full suite. The same managed CLI scenarios now complete generally in ~0.1–1.6 seconds; the 7-second deadline test is intentionally slow and passed at ~7.2 seconds. CI and Release Gate also passed Linux/macOS for that candidate.
- On the exact source tree of `3635ca8`, local Linux verification passed: all managed tests 272/272; `tests/t09-lifecycle.test.ts` 24/24; typecheck, build, `verify:pack`, and diff check. A separately executed `npm pack` → install into a fresh temporary project → `scripts/t09-real-package-smoke.mjs` passed signed installation, doctor, installed CLI, backup/integrity check, clean restore, managed uninstall and user-data preservation. This is an actual package lifecycle smoke, not merely fixture coverage.
- After adding the dedicated lexical-path assertion, local `npm test` passed 2,209 tests, with 0 failures and 19 skips (the prior 18 plus the Windows-only regression skipped on Linux); the three managed CLI test files passed 16/16 with that one platform skip. Typecheck, build and diff check passed on the same working tree.
- A dedicated regression test now captures the child entry argument and, on Windows, asserts it remains the lexical absolute path when `realpath` yields a different canonical/8.3 path. It is skipped on non-Windows by design; its Windows acceptance belongs to CI for the code candidate containing it.
- `npm ci` in a fresh Linux worktree could not build `node-pty`: Node header extraction failed with `TAR_ENTRY_ERROR EINVAL: invalid argument, fchown`. This environment failure is recorded, not converted into a pass or bypassed by changing dependencies. The CI Release Gate used its declared setup and passed.

T09 remains **PARTIAL**: automated loopback consent tests are not a real browser launch; the exact-code Windows regression still needs its final CI result; uninstall race proof and any required live acquisition/activation evidence must be assessed against the implementation. No CI result or local fixture is promoted to full T09 parity.

## Canonical implementation order

Reverse-inventory preparation remains first so omitted surfaces are visible, but it does not reorder execution. The strict tracker phases control:

1. Prepare/continue reverse inventory R02/R03/R07/R08/R18 under ECO-01C/E and preserve the frozen source baseline.
2. Complete ECO-01 and ECO-02, including the minimal ECO-02A package/host preflight needed before essential runtime.
3. Complete essential runtime ECO-03 through ECO-08.
4. Complete runtime ECO-09 through ECO-14, composing rather than duplicating stores, usage, registry, dispatcher or ODD cores.
5. Complete ECO-15A, ECO-15B and ECO-15C after corresponding shipped behavior exists.
6. Run ECO-16 in both directions: ASEN -> requirements and Reference A -> ASEN, then run exact-candidate platform/host gates.

Nonadopted optional features do not gate adopted-scope closure. Explicit exclusions and deferred Reference A behavior—including the user-excluded NaN provider—remain disclosed limitations, so full-reference parity remains incomplete. Merge, release and source rebaseline remain separate human decisions.

## Audit invariants

- Search existing ASEN implementation and tests before writing anything.
- A missing roadmap row does not make a Reference A behavior optional.
- Memory R01-R09 is not an implementation queue.
- GSP-06 remains closed at the accepted provider-limited scope; do not fabricate provider PASS.
- Model output cannot mint write/review/delivery/merge/release authority.
- ECO-05 child lifecycle does not wait for ECO-06 primary safety: the existing pinned child authority and exact tool exclusion remain mandatory before prompt dispatch. Child shell/background support remains disabled by default and requires a separate user decision plus its own recognizer, destructive-command, wrapper and job constraints.
- Forbidden tools: zero executions. A blocked attempt may be recorded only as an attempt.
- Prefer deterministic/local evidence; use consolidated remote CI only for platform/host boundaries.
- Keep every stable work block independently reviewable. The reconciliation and portable-handoff documentation units are already committed; do not duplicate them. The parent-controlled metadata seal needs no predicted SHA, and delivery authority ends with the feature-branch push. It is not standing authority for later commits or work.

## Task replay ownership and evidence

Current route-by-route evidence and remaining gaps are recorded in `docs/audit/ecosystem-current-state-r03-r10.md`.

These three surfaces have separate responsibilities and do not create competing sources of truth:

| Surface | Responsibility | Durable source |
| --- | --- | --- |
| `src/runtime/task-replay.ts` | Validate ordered task state transitions and reject stale revisions or identity changes. | None by itself; pure validation/projection only. |
| `src/flow/odd-task-tracking.ts` | Mirror the complete bound ODD task document and TODO/resume data; append validated task events to that same record. | Existing project/session `MemoryStore`, under the existing ODD tracking item. |
| `src/tasks/task.ts` (`EngineeringTask`) | Track ASEN's own in-process engineering phase while running. | Process memory only; it is not the user task or its replay log. |

Replay survives close/reopen through the ODD tracking MemoryStore item. A changed task document or mismatched task/project/candidate remains a hard resume rejection. Memory internals are unchanged.

## Current handoff evidence

The current FULL-5 handoff is the [non-promoting checkpoint](../../docs/audit/eco02a-full5-non-promoting-checkpoint.md), observed before the parent-owned work-unit commit at HEAD `be8a652c4e7c70392541592f5c5fff3132dc23d9`. The work-unit commit identity is pending the parent commit. All R16, R18, and R20 routes remain `PARTIAL`; the registry remains 16 `PARTIAL` / 0 `FULL`.

Candidate `fb26e5ae0092cfbebeeec115614db0b401f15871` is historical exact-candidate FULL-3/FULL-4 evidence, not current HEAD admission. Candidate `cea70e3d2dcf7af416d8c9c58d83990a416f4475` has 24 cells, 24 receipts, and stateful consistency, but its closeout remains `PARTIAL`: native review is unavailable/not approved, two gates remain, and no promotion occurred. Neither candidate-to-observed-HEAD path set satisfies the validator's evidence-only overlay rule. The pinned-source-to-itself drift record does not inspect newer upstream.

The older fully observed checkpoint `bc6160d598dfd4e9a5b369d15177bf0c8d6a17e6` and its recorded workflow results remain historical evidence; they no longer control current FULL-5 execution. Scanner source commit `95ad615a04c60b6947e1bfa813be77984efb397f` and CodeGraph source commit `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` likewise retain only their recorded source evidence. Every later source candidate must earn exact-candidate evidence and pass overlay admission before any route promotion. Delivery authority remains feature-branch-only and excludes install outside test sandboxes, force updates, merge, release, PR mutation, secrets access, NaN work, or unrelated changes.

## Historical platform defect

Candidate `74defb28a77dd028da56c3870fbd60661818689c` previously failed the recursive Skill-registry watcher test on Windows. This is historical evidence, not a current blocker: at `46c81fa67ce39aee9186c481d278cbd7e398d448`, CI's Windows job completed `npm run check` successfully (run `37523687820`, job `112475190061`). Do not add a second watcher unless a later exact-SHA run reproduces a failure.

## Final definition

Adopted-scope closure is ready only when the reverse inventory finds no adopted observable Reference A behavior without one of:

1. a demonstrated ASEN equivalent;
2. an explicitly permitted branding/prose/artwork/private-authority difference; or
3. an honestly recorded accepted-scope limitation or nonadopted optional disposition.

Optional nonadopted features do not gate adopted scope. They and the explicitly deferred NaN provider still prevent a claim of full Reference A parity. Completing all numbered ECO checkboxes without this reverse proof is not sufficient.

### T09 exact candidate update — 2026-10-28

Initial HEAD `c0d5caa0dbe7e4da835af5681b7396d2307fb532` had a Windows Release Gate failure: the packed Pi verifier exceeded its existing natural-exit grace after stdin EOF and was force-killed. Diagnostic candidate `c3da3bd40faf644a897241580b751e882dae4e91` adds bounded failure traces and a regression retaining fail-closed forced-shutdown behavior; it does not change shutdown behavior or timing. Exact-candidate Release Gate passed packed real-Pi installation, restart and cross-session receipts on Windows/Linux/macOS, with three natural exits. The separate real-package smoke on each OS also passed local Ed25519-signed install (ephemeral anchor), doctor/CLI, backup/integrity, clean-target restore with data/config comparison, and managed uninstall preserving sample user data. HTTPS acquisition, version activation/rollback, SQLite-active consistency, restore failure recovery, uninstall symlink/race protection, signature rejection/rotation/revocation, and real browser launch remain open. This is a non-reproduction, not a proven root-cause correction; the original artifact does not record enough process events to distinguish cleanup delay from runner timing. T09 remains **PARTIAL** because signed acquisition/activation/rollback, full backup/live restore, managed removal protections and real browser launch are not closed. CI run `40657477741` remained in progress at checkpoint; consult its final result before citing CI as complete. No T05/T10/T11 status changes.

R4 residual on the exact tested dependency graph: `npm audit --json` reports one moderate and one high advisory under the optional development/test Pi host `@earendil-works/pi-coding-agent@1.2.0` → `undici@8.10.2`, including TLS certificate validation bypass GHSA-2m5v-pch6-74hx. The Pi host imports Undici's dispatcher. ASEN does not bundle Pi or this dependency tree in its packed tarball. npm's fix suggestion downgrades Pi to 0.75.3 (major, incompatible with the target), so no forced override/version swap was made. This inherited Pi host risk remains open; T09 is not security-FULL.

### T09 execution evidence update — 2026-10-28 (follow-up)

From reconfirmed PR #37 HEAD `425170f02db2fa69327d4cc415b059a09ce004ec`, public CLI tests now cover signed loopback HTTPS install, A→B upgrade and rollback with preserved user data, and actual TLS verification in a child process (untrusted CA fails before install; explicit test CA succeeds). Local full suite passed 2,211 tests, 0 failures, 19 conditional skips; typecheck, build, `npm run check`, `npm run verify:pack`, and diff check passed. The packed artifact boundary verified 361 files, 28 exports, 11 RPC commands and 16 tools. The update test itself uses signed fixture packages and has no exact-SHA CI yet; it does not close real-package update evidence. Inherited Pi 1.2.0 / Undici advisories remain unresolved, with the specific TLS-dispatcher condition not observed in the configured dispatcher. T09 remains PARTIAL pending cross-platform real-package update/rollback, restore recovery/SQLite, uninstall race and link safety, real browser launch, and upstream dependency remediation. T05/T10/T11 unchanged.

### T09 real-package update/restore evidence — 2026-10-28

Extended the disposable packed ASEN smoke (real npm tarball) with local signed HTTPS upgrade 0.1.0→0.1.1 and rollback to 0.1.0, installed `--version` checks and data preservation across both transitions. The signed v2 is an isolated copy of the actual tarball tree with only package/compiled version literals revised. Backup verification, corrupt-restore no-effects, successful restore retry to the same clean target with data/config comparison, uninstall and preserved data passed on Linux Node 24.22.1. The first run isolated a harness deadlock: synchronous child execution blocked its in-process HTTPS server; converting the upgrade invocation to async made the flow pass without weakening TLS or raising timeouts. Typecheck/build/verify-pack pass; exact-SHA full CI and Windows/macOS execution of this extended smoke are pending. T09 remains PARTIAL: SQLite/interrupted restore, concurrent uninstall-route substitution, real browser launch, and Pi 1.2.0 dependency advisories remain. Other task states unchanged.

### T09 smoke runner correction — 2026-10-28

Release Gate on `2d50f464bc054045d7ef57146f0f9dee9fc239d6` failed on Ubuntu real-package smoke with `ENOENT` for the TLS fixture: the workflow changes cwd to its temp npm project, but the smoke had resolved fixtures relative to cwd. Anchoring fixture paths to the script module location fixed it; local reproduction from the same temp cwd passed the complete packed upgrade/rollback/corrupt-restore flow. macOS/Windows jobs were cancelled and are not evidence. Phase 0 and Pi runtime passed on the failed candidate; corrected exact-SHA CI remains required. T09 stays PARTIAL.


### T09 SQLite backup checkpoint — 2026-10-28

The whole-home backup now snapshots active SQLite databases with read-only `VACUUM INTO`, integrity-checks and bounds the resulting database, and excludes SQLite sidecars. The regression establishes committed-WAL inclusion and snapshot-time isolation of later writes; restore returns a database passing `PRAGMA integrity_check`. A controlled failure during restore staging preserves an existing target, removes owned staging, and supports retry. Focused tests passed 4/4; full local suite passed 2,214 with 19 conditional skips; typecheck/build/verify-pack passed. `npm run check`, typecheck/build, `verify:pack`, and focused regressions passed on the lazy-import candidate. Exact-candidate CI and real-package cross-OS SQLite execution are not yet admitted. This proves handled failure recovery only, not SIGKILL/power-loss recovery at publication. T09 remains PARTIAL; other task statuses unchanged.


### T09 first CI regression — 2026-10-28

Candidate `49aa9e9c61cd01e82e4f78b724e4d8673b87fed3` revealed eager `node:sqlite` loading caused Node 22's experimental warning on ordinary CLI starts. Release Gate Ubuntu's packed install probe failed its strict empty-stderr version check; Linux and Windows suites showed 50 assertions failing for the same stderr warning. Phase 0 and Pi runtime passed; the Release Gate's Linux packed restart/session and real-Pi smoke steps passed before later packed install smoke failure. Correction: type-only static reference and dynamic runtime import only after SQLite-header detection, plus a version-probe regression. The first candidate is not green; corrected SHA matrix remains necessary.

### T09 exact-candidate follow-up — 2026-10-28

The real npm-tarball smoke now covers signed HTTPS upgrade/rollback, live SQLite-WAL backup, integrity-checked snapshot-time restore, corrupt-restore no-effects/retry, and managed uninstall preserving data. Linux Node 24.22.1 passed locally. The lifecycle suite passed 30/30 with a forced-termination-during-staging restore test; old target survival and retry are proven, while the unpublished staging directory left by SIGKILL is recorded as a recovery limitation. Candidate `a1e389d` Phase 0 and Pi runtime passed, Release Gate passed Linux/Windows, but its macOS packed upgrade hit a 60-second outer timeout equal to the acquisition deadline. The smoke harness now has a 75-second outer bound for that operation and bounded server diagnostics; root cause of macOS reaching the inner acquisition deadline remains unconfirmed and exact-candidate rerun is needed. T09 remains PARTIAL. No T05/T10/T11 state changes.

### T09 CI runner correction — 2026-10-28

On `12e3f08d57810bdb34aded2df3193699750d9c36`, Release Gate passed Linux/macOS/Windows real packed lifecycle smoke, Phase 0/Pi runtime passed, and Ubuntu full CI plus all three Pi support matrices passed. macOS full CI hit the existing 10-minute per-chunk watchdog because the planner submitted all tests as one chunk; runner log confirms timeout at 600,183 ms, cleanup confirmed, exit 124, with no assertion failure. New RED showed 121 macOS test files formed one run. GREEN partitions them into 50-file chunks without raising either watchdog. Focused planner test suite: 21/21. T09 remains PARTIAL while consolidated checks and corrected exact-candidate CI run.

Windows full CI on `12e3f08` also caught that the new restore-kill test emitted a drive-letter path instead of a file URL in its child ESM import (`ERR_UNSUPPORTED_ESM_URL_SCHEME`). It now imports via `pathToFileURL`. The macOS chunk planner test has explicit types after local typecheck caught an implicit-any. Targeted lifecycle test passes locally; full consolidated validation is in progress. No runtime product change.

Corrected local validation: `npm run check` passed 2,216 tests, 0 failed, 19 conditional skips; parity, skills, memory and upstream-boundary audits passed. Ecosystem normative source proof is NOT ADMITTED (retained reference repository unavailable), so this remains a limitation, not a clean parity claim. Typecheck/build/verify-pack/diff check passed. The product tree is unchanged; exact corrective-candidate CI is pending.
