# Remote continuation plan

## Start here — current portable handoff

This section is the operational entry point for a clean clone and a simpler coding model. It is guidance, not completion authority. The latest log in [`odd/tasks/pi-capability-completion.md`](../odd/tasks/pi-capability-completion.md) remains authoritative for overall blockers; [`odd/tasks/ui-runtime-delivery-order.md`](../odd/tasks/ui-runtime-delivery-order.md) controls the UI delivery sequence; and [`odd/tasks/equivalencia-funcional-agentes-full.md`](../odd/tasks/equivalencia-funcional-agentes-full.md) controls global equivalence. If this guide conflicts with one of those current logs, stop and follow the canonical document.

### Where work stopped — read this first

- Branch: `feat/t12-integrated-acceptance-merge`; expected origin: `https://github.com/asenbanskaliev/ASEN.git`.
- Review source unit: `f66004a36d17d7715ff29204b4423865c653fa80`. Closure checkpoint: `428f7842b1cc51818a18b554a1782214febd9deb`. Frozen audit/admission base before these documentary corrections: `c0aa46658870e5342d10a4f597c3f02ccdb00c14`.
- Task 41 is `DONE_LOCAL_API_ONLY`: the registered Review command can render a genuine prepared request, but the default host does not yet create and retain that request path.
- Task 43 is `DONE_ADMISSION_MAP`: no source implementation card is ready. R18 is already complete at `d517a69b`; do not redo it. R15 is closed for the 2026-11-07 continuation by the owner's retain-scope disposition: Review stays intentionally `API_ONLY` and no producer, preparer, request-ID or controller-retention work is admitted (canonical log `odd/tasks/ui-runtime-delivery-order.md` L104). R19 is separately blocked on trusted producer/consumer binding plus security and concurrency admission.
- Task 44 is `DONE_LOCAL_DOCUMENTATION`: detailed S21–S22 handoff unit `b836e348072ca33162f3de902a8af39596bf7735` is saved (221 authored lines), with structural/provenance checks and six PowerShell blocks parsed only. Closing checkpoint metadata follows that unit; obtain the actual final published SHA separately. The frozen audit returned `CORRECTIONS_REQUIRED_DOCUMENTATION_ONLY`; post-audit corrections are parent-owned/delegated authoring, not a refreshed independent verdict.
- The 2026-11-07 local continuation closed three admitted units on top of `9fb2b306`: R21-local (`efbd8947`, `/asen-integrations` declared in `ASEN_COMMAND_CATALOG` with its read-only projection, tests and capability-map row, plus the R07 card correction), the pre-existing M2 test-contract defect (`26b18773`, mock realigned to `runtime.store.get`), and the ODD record (`2677ab89` plus L105). R21 overall stays `PARTIAL_LOCAL_API_ONLY`; none of these is native review, independent R4, exact-SHA CI or FULL evidence.
- **Next gated action:** Task 45 is satisfied for the base commit, measured read-only on 2026-11-07: `git ls-remote origin refs/heads/feat/t12-integrated-acceptance-merge` returned `9fb2b306d75e5296c2dd98d42870a24e4cefc261`, the same SHA this run started from, so that commit is already published on origin. The commits made after it in this run are local-only and publishing them is a fresh owner decision; S21 authorized only that WIP-closing publication, never force, merge, PR, release or private/cache upload. No new push is claimed here.
- The SHA to download must come from the actual successful owner push and exact remote branch. Never guess or embed this document's future commit SHA. On the other computer, once the owner's successful-push SHA and the clone's exact HEAD agree, do NOT repeat Task 45 or push again: that publication step already happened. The next source action is the R15/R19 owner gate below, not another implementation by default.
- Historical UI evidence remains bounded: new Review UI `7/7`, combined `41 PASS / 2 POSIX skips`, isolated 606-input typecheck/build exit `0`, and root diagnostic comparison `483/483` with zero delta. Those are history, not future-host PASS and not a clean-root claim. The two focused commands in this document were re-executed on 2026-11-07 on `2677ab89` and reproduce `13/13` and `28/28` with zero skips, plus `npm run check:fast` exit 0 (32 tests, 31 pass, 1 skipped as `POSIX private-directory modes are unavailable on Windows`) and `npm run typecheck` exit 0.
- Global FULL, native approval, provider consent, Reference parity and independent R4 remain absent; PR #45 is `SELF_AUDIT_ONLY / NOT independent`.

### What a continuation runtime must provide

A smaller or cloud-hosted model must run inside a coding environment with repository read, bounded edit, shell and Git inspection tools. Plain chat without those tools cannot execute this plan. Before work, identify the actual provider and model ID, how credentials are supplied, which tools are available, and whether an independent verifier is available. A user-facing label such as “BEAN” or “Beam” is not an endpoint, authentication method or approval.

No provider setup or cloud call is authorized by this guide. Never invent tokens, consent, native acknowledgements or verifier results. If a required capability is absent, report `BLOCKED` with the exact owner action needed.

### Clean-clone prerequisites

1. Obtain the repository only after the owner supplies the exact published 40-character HEAD from Task 45. Use one fresh PowerShell session for these steps. Set it explicitly; do not derive it from this document:

   ```powershell
   $ErrorActionPreference = "Stop"
   $ExpectedPublishedSha = Read-Host "Exact published feature-branch HEAD"
   if ($ExpectedPublishedSha -notmatch '^[0-9a-f]{40}$') { throw "Expected full lowercase SHA" }
   ```

   If the repository is not present, first choose your own writable workspace on the NEW computer, then run the following there. Do not run this in the existing project or reuse an existing destination:

   ```powershell
   $ClonePath = Join-Path (Get-Location).Path "ASEN"
   if (Test-Path -LiteralPath $ClonePath) { throw "Destination already exists; preserve it" }
   git clone --single-branch --branch feat/t12-integrated-acceptance-merge https://github.com/asenbanskaliev/ASEN.git $ClonePath
   if ($LASTEXITCODE -ne 0) { throw "Clone failed; do not continue" }
   Set-Location -LiteralPath $ClonePath -ErrorAction Stop
   ```
2. From the clone root, run this provenance checkpoint before installation or editing:

   ```powershell
   function Read-CheckedGit {
     param([string[]]$GitArgs)
     $Result = & git @GitArgs
     if ($LASTEXITCODE -ne 0) { throw "Git inspection failed; preserve stderr and stop" }
     return $Result
   }
   $ExpectedBranch = "feat/t12-integrated-acceptance-merge"
   $ExpectedOrigin = "https://github.com/asenbanskaliev/ASEN.git"
   if ((Read-CheckedGit -GitArgs @("branch", "--show-current")) -ne $ExpectedBranch) { throw "Wrong branch" }
   if (Read-CheckedGit -GitArgs @("status", "--porcelain")) { throw "Clone is not clean" }
   if ((Read-CheckedGit -GitArgs @("remote", "get-url", "origin")) -ne $ExpectedOrigin) { throw "Unexpected origin" }
   if ((Read-CheckedGit -GitArgs @("rev-parse", "--abbrev-ref", "--symbolic-full-name", '@{upstream}')) -ne "origin/$ExpectedBranch") { throw "Unexpected upstream" }
   if ((Read-CheckedGit -GitArgs @("rev-parse", "HEAD")) -ne $ExpectedPublishedSha) { throw "HEAD does not match owner-published SHA" }
   git merge-base --is-ancestor f66004a36d17d7715ff29204b4423865c653fa80 HEAD
   if ($LASTEXITCODE -ne 0) { throw "Missing Review source unit" }
   git merge-base --is-ancestor 428f7842b1cc51818a18b554a1782214febd9deb HEAD
   if ($LASTEXITCODE -ne 0) { throw "Missing closure checkpoint" }
   git merge-base --is-ancestor c0aa46658870e5342d10a4f597c3f02ccdb00c14 HEAD
   if ($LASTEXITCODE -ne 0) { throw "Missing audit/admission base" }
   ```

   Stop on any mismatch. An ancestor is not a substitute for exact HEAD equality.
3. Read `package.json` and `package-lock.json`. The declared Node engine is `>=22.19.0`; the previously observed Node `24.14.0` does not certify every version.
4. Read, in order: this Start Here section; the latest canonical capability log; the UI delivery-order task table and latest log; the relevant R01–R23 card; and its mapped C01–C20 requirements. Do not reconstruct the whole history.
5. Select exactly one card only after the latest log marks it ready. Record its S-specs, paths, symbols, prerequisites, public effects, commands and stop conditions before writing.

### Portable isolated PowerShell setup

Run these instructions only on the new host. They were not executed while writing this guide.

```powershell
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path .).Path
$State = Join-Path $Root (".cache/remote-continuation-" + [guid]::NewGuid().ToString("N"))
if (Test-Path -LiteralPath $State) { throw "Refusing to reuse an existing state root" }
$HomeRoot = Join-Path $State "home"
$ConfigRoot = Join-Path $State "config"
$CacheRoot = Join-Path $State "cache"
$DataRoot = Join-Path $State "data"
$TempRoot = Join-Path $State "tmp"
$PiRoot = Join-Path $State "pi-agent"

New-Item -ItemType Directory -Force -Path `
  $HomeRoot, $ConfigRoot, $CacheRoot, $DataRoot, $TempRoot, $PiRoot | Out-Null

$env:HOME = $HomeRoot
$env:USERPROFILE = $HomeRoot
$env:XDG_CONFIG_HOME = $ConfigRoot
$env:XDG_CACHE_HOME = $CacheRoot
$env:XDG_DATA_HOME = $DataRoot
$env:TMPDIR = $TempRoot
$env:TMP = $TempRoot
$env:TEMP = $TempRoot
$env:PI_CODING_AGENT_DIR = $PiRoot

node --version
if ($LASTEXITCODE -ne 0) { throw "Node is unavailable" }
$NodeVersion = node -p process.versions.node
if ($LASTEXITCODE -ne 0) { throw "Cannot inspect Node version" }
if ([version]$NodeVersion -lt [version]"22.19.0") { throw "Node does not satisfy the declared minimum" }
npm --version
if ($LASTEXITCODE -ne 0) { throw "npm is unavailable" }
npm ci
if ($LASTEXITCODE -ne 0) { throw "Lockfile installation failed; do not continue" }
```

Use the lockfile through `npm ci`; do not copy installed dependencies. Keep all state under the project-owned, ignored `.cache` root. Do not hardcode a previous `D:` or `C:` path, fixture nonce, SID, installed SDK path, executable hash, user profile or private session location. A machine-specific Node binary hash may be evidence for one run, but it is not a general precondition for a new host.

If Node filesystem link or lock operations fail, stop and capture exact stdout, stderr, exit code and filesystem state. Do not loosen guards or deadlines, move state outside the project automatically, change ACLs, or retry blindly.

### What is portable

| Asset | Clean-clone rule |
| --- | --- |
| Tracked source, tests, docs, registries, `package.json` and lockfile | Required. Git is the source of truth. |
| Dependencies | Regenerate with `npm ci`; never copy `node_modules`. |
| Build output | Regenerate with `npm run build`; never require copied `dist`. |
| CodeGraph index | Regenerate with project-local initialization only when the selected task needs it; never copy `.codegraph`. |
| Project-owned test fixtures | Let the tracked tests create them under isolated roots. Do not transplant old machine fixtures. |
| `.cache` receipts and parked harnesses | Historical evidence only unless a canonical card explicitly requires a tracked replacement. Do not copy the whole cache. |
| Installed SDKs, profiles, sessions or private home data | Never portable prerequisites. Recreate only through an authorized documented setup. |
| Previous native acknowledgement, consent or grants | Never transferable. A new host or gate needs fresh provider-issued bindings. |
| External `C:` fixtures, ACLs, nonces and machine executable hashes | Machine-local historical evidence, not authorization on the new host. |
| Large untracked root analysis export | Preserve locally, but do not upload, delete, track, copy, use as authority or classify as safe/useless without a separate content, producer and privacy review. See the canonical equivalence ODD for its registered context. |

No literal consumer of that filename was found in the inspected tracked runtime, build, CI or registry paths. This bounded search is not proof about every possible dynamic input. Two canonical documentation references exist, but reference alone does not make the file portable evidence. Its contents, producer and privacy status remain unknown.

### Evidence already established — and its limits

The following counts are historical current-baseline evidence for unchanged H1 source, not clean-clone results:

- Focused hierarchy/Stop: `13/13`.
- Shared F6/Jobs regression: `28/28`.
- Separate independent technical check: `4/4`.
- Isolated typecheck and build: exit `0`.
- Jobs differential: `36` observations per variant, zero differences and zero Jobs hierarchy reads.

These results do not establish native approval, provider consent, Reference equivalence, R4 independence, full CI cleanliness or global FULL. The native assessment failed because untracked scope was unavailable: candidate `null`, no lineage, consent or acknowledgement. PR #45 uses `SELF_AUDIT_ONLY`, explicitly **not independent**. Global Full remains false; EF and UI gaps remain open. Old root LSP errors, an old whole-CI lock failure and historical CI receipts are not automatically attributable to or valid for `5854202f`.

### Focused baseline commands

After `npm ci`, run only the commands required by the selected card. For the unchanged H1 baseline, the known focused commands are:

```powershell
node --import tsx --test tests/m2-agent-hierarchy.test.ts tests/m2-agent-stop.test.ts
if ($LASTEXITCODE -ne 0) { throw "Focused hierarchy/Stop check failed" }
node --import tsx --test tests/m2-f6-native-ui.test.ts tests/m2-job-stop.test.ts tests/job-inspect.test.ts tests/job-inspection-integration.test.ts
if ($LASTEXITCODE -ne 0) { throw "Shared F6/Jobs check failed" }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
```

Historical expected counts are `13/13` for the first command and `28/28` for the second. They are expectations, not permission to report success without execution. Capture actual totals, skips, exit codes, stdout and stderr. Stop on the first nonzero command and report the state; do not continue to manufacture a green summary.

Do not run full `npm test`, broad CI, a provider experiment, an old unavailable verifier or historical receipt replay by default. Add broader validation only when the selected canonical card explicitly requires and authorizes it.

### One-card execution loop

For one selected ready card:

1. **Confirm scope:** quote the card ID, covered S-specs, exact allowed paths and forbidden surfaces.
2. **Protect the tree:** inspect status and preserve every unrelated tracked or untracked file. Never use `git add .`; stage only explicitly named files when the owner authorizes a local save.
3. **Read minimally:** use the card's pointers, existing implementation and existing tests. Do not create a duplicate plan, panel, protocol or persistent-root mount.
4. **Test first when meaningful:** record a behavior-level RED before implementation. For passive documentation, say that no meaningful RED exists and use structural validation instead.
5. **Implement one bounded slice:** keep a local review unit below roughly 400 changed lines. Stop before adjacent refactors, dependency changes or future cards.
6. **Validate exactly:** record each command, exit code, stdout, stderr, test totals, skips and relevant counters. Never summarize an unexecuted command as passing.
7. **Inspect the diff:** run a path-scoped diff and `git diff --check`. Confirm no unrelated file entered the slice.
8. **Report honestly:** include changed paths, covered specs, evidence, remaining gaps, commit SHA if one was authorized, and the next blocker. Publication requires a current card-specific owner authorization; S21 applies only to the parent's Task 45 ordinary WIP push. Never force, merge, open a PR or release from this loop.

Owner decisions are required for unresolved product behavior, destructive actions, provider use and opaque authorization. Stop with a closed, concrete choice rather than guessing.

### Existing Review path and the next owner gate

Do not create another controller, pending map, store, command, synthetic request ID or preparer. The existing chain is:

1. `src/delivery/work-unit-evidence.ts` — `recordCompletedWorkUnit(...)` records a completed bounded unit.
2. `src/delivery/work-unit-review-candidate.ts` — `recordWorkUnitReviewCandidate(...)` consumes that evidence into a one-use genuine candidate.
3. `src/review/ordinary-review-command.ts` — `registerOrdinaryReviewCommand(...)` exposes controller `.prepare(...)` and its private `pending` map; both must be the same retained controller instance.
4. `extensions/asen.ts` — `createAsenExtension(...)` returns `.review`, but actual `createPiExtension(...)` currently retains only `.startSession`. This is why Task 41 is API/registration-only, not default-host end-to-end.
5. `tests/ordinary-review-command-ui.test.ts` — focused public UI command: `node --import tsx --test tests/ordinary-review-command-ui.test.ts`; historical result `7/7`, never a destination result until rerun under an authorized card.

Before any R15 source edit, satisfy exactly one OWNER DECISION path:

- **Existing-proof path:** prove a tracked, admitted completion owner already creates the genuine completed record/candidate, retains the same `.review` controller, invokes `.prepare(...)` once with current session/repository identity, and publishes the request ID through an admitted lifecycle; or
- **Explicit-decision path:** owner defines the trigger, completion owner, controller retention/lifetime, request-ID publication, session/repository binding, failure retirement/retry behavior and exact allowed paths; or
- **Retain-scope path:** owner intentionally keeps Review API-only and admits no producer work.

R19 is a separate gate: trusted producer/consumer binding, authorization and security/concurrency admission are required before its source work. R18 is complete and is not a substitute for either gate. Until one gate is satisfied in the canonical Specs/Log, there is no source card ready.

The `/asen-review` spelling is a registered host slash command, NOT a shell executable. Run its public tests with Node; do not paste slash commands into PowerShell. These existing observable messages are regression boundaries, not permission to add a producer or new behavior:

| Existing case | Exact handler message / boundary |
| --- | --- |
| Usage | `Uso: /asen-review <solicitud-id> \| /asen-review workspace` |
| No pending request in this instance | `No existe solicitud pendiente en esta instancia de ASEN` |
| Verification failure notification | `No se pudo verificar la solicitud; se requiere una preparación nueva.` |
| Rejected and retired request error | `Solicitud de revisión rechazada y retirada` |
| Scope/candidate drift | `Review scope or candidate changed; no view published` |

Only when the selected card authorizes this check, run it inside the already isolated session and capture real output:

```powershell
node --import tsx --test tests/ordinary-review-command-ui.test.ts
if ($LASTEXITCODE -ne 0) { throw "Review public UI check failed; preserve output and stop" }
```

The historical expected new-test count is seven, with zero failed/cancelled cases; do not replace actual totals or skips with that expectation. Handler errors above are not invented standalone CLI stdout/stderr or exit codes. Inspect the existing public assertions before changing them; rejected inputs must preserve unrelated data/counters and retire only the claimed request.

### One-card checkpoint template

```text
Card / covered S#: <one admitted card and exact specs>
Allowed paths / symbols: <closed list>
Meaningful RED: <command and observed failure, or documented passive-doc exception>
Public effects and preserved state: <what changes / what must not change>
Validation: <exact command, exit, stdout, stderr, totals, skips, counters>
Changed paths: <exact list>
Saved commit: <full SHA if parent authorized and created it>
Historical evidence only: <counts not rerun on this host>
Next gate: <one owner decision, missing capability, or next admitted card>
```

Run commands only when the selected card authorizes them. On failure, record exact output/state and stop; do not increase deadlines, loosen trust/assertion guards or retry an unavailable historical verifier.

### Copyable resume instruction for the next model

> Read this Start Here section and the latest canonical capability/UI logs. Verify exact owner-published HEAD, branch, clean status, origin, upstream and the `f66004a3` / `428f7842` / `c0aa4665` ancestors. Do not redo R18. There is no source card ready until the R15 OWNER DECISION gate or separate R19 trusted-binding gate is recorded. Choose one admitted card only, report S#, paths and symbols, preserve unrelated files, use meaningful RED when applicable, and record exact command/exits/stdout/stderr/skips/state/counters. Return changed paths, full saved SHA if authorized, and one next gate. Never use `git add .`, force, merge, release, upload private/cache data, call a provider or invent approval. Publication requires the current explicit owner authorization; S21 covers only the parent's Task 45 ordinary WIP push.

### Stop conditions

Stop immediately when any of these is true:

- Exact published HEAD, branch, clean status, origin, upstream or required ancestry is wrong.
- The selected card is not ready, or R15/R19 still lacks its explicit decision/admission.
- `npm ci` or an authorized focused check fails, or any command mutates outside its allowed surface.
- Required tool, provider/model identity, credential, verifier or owner consent is unavailable.
- Work would require copied cache/private authority, a `C:` fixture, private SDK/profile/session, old grant/ACK, or machine-specific approval.
- The proposed change requires another coordinator, duplicate Review mechanism, dependency/lockfile change, worktree pilot, cloud call, force/merge/PR/release, or destructive action without explicit authorization.

Report the exact blocker and required owner decision. Never convert missing evidence into FULL.

## Historical record — non-current operational guidance

Everything below is preserved for audit history. It contains old branches, candidate SHAs, permissions and CI observations that were valid only in their recorded context. It must not override the Start Here section or the latest canonical logs, and it need not be revalidated merely to continue current work.

### Historical checkpoint status

This publication is a **WIP checkpoint, not FULL parity**. Start from base `f2ed915d475408481aeec648cba248a13957e09f` on `feat/strict-parity-prerequisites`, then inspect the exact pushed candidate rather than assuming every local historical receipt is portable.

The remote continuation began from published checkpoint `4a4c7e71a876b83f76c0bbfc0d26163dfa2c1b0f`. The owner now authorizes clean-clone setup, work branches and reviewable PRs against `feat/strict-parity-prerequisites`, without merge/releases, provider credits or installed Reference/Pi changes. Keep the old quarantined-child incident separate. L474 onward records the new scoped checks; older local-only restrictions describe their historical runs.

The canonical source of truth is the latest log in [`odd/tasks/pi-capability-completion.md`](../odd/tasks/pi-capability-completion.md). The earlier [`resume handoff`](../odd/handoffs/pi-capability-completion-resume.md) is historical context. Keep the tracked [`parity map`](../odd/tasks/ecosystem-final-parity-map.md) and registry/claim files aligned, but do not let an older summary override the canonical log. Cached receipts unavailable in a clean clone are historical claims, not remote approval.

Static local metadata that reported Reference Shell 4.3.0 and Pi Coding Agent 1.4.0 is neither a complete immutable reference binding nor proof of the versions loaded by a live runtime.

### Clean-clone setup and verification

1. Read `package.json` before setup. It currently requires Node `>=22.19.0`.
2. In a disposable remote environment, use `npm ci` to install the lockfile's supported versions. Do not copy `node_modules`, cached SDKs, local profiles, `.cache`, or `.codegraph` from another machine.
3. Before executing tests, inspect `scripts/run-tests.mjs` and the selected tests for timeouts, child-process cleanup, filesystem effects, and state locations. Give stateful checks isolated project-owned home/config/cache/data/temp roots.
4. Run focused tests for the bounded change first, then `npm run typecheck` and `npm run build`. Before T12, run the broader audits plus applicable package and platform checks defined in `package.json` and the workflow.
5. These commands are instructions only; this document does **not** claim they passed.

GitHub Actions runs on `pull_request` and on pushes to `main`; a push only to this feature branch does not by itself produce a green CI run. The workflow currently uses `npm install` in its main test job and `npm ci` in the Pi support matrix, so review the exact remote results rather than assuming local setup and CI are identical.

### Ordered continuation

#### A. Reconcile the remote baseline

Compare the clean clone, pushed diff, canonical latest log, parity map/registry, and available tracked evidence. Preserve historical failures and admissions. Do not promote a capability from file presence, broad tests, or unavailable cache receipts.

#### B. Finish T09 maintenance

Use the audited, phased execution checklist in [`docs/t09-autopilot-closure-plan.md`](t09-autopilot-closure-plan.md). Its current baseline is the PR #37 head recorded in that document; reconcile it again before implementation or publication. The plan is operational guidance, not evidence of completion.

Advance real update/restore/managed removal/browser/bootstrap/distribution work. Reuse admitted selection, launch, doctor, finite backup, reader, isolated restore-stage, preview, and expected-byte staging pieces. Version rollback is not data restore; a preview is not an executed installation. Keep acquisition, authenticity, activation, live restore, uninstall preservation, clean-machine behavior, and platform proof explicit.

L478 adds the public lifecycle commands (signed install/upgrade/rollback, backup/restore, managed-only uninstall, browser consent). T09-U9d adds explicit local `managed update ... --stage --yes` composition plus a reproduced POSIX directory-link-count correction; staging does not download, select or run a version. PR #37 baseline `18e9872` had passing Linux/macOS/Windows CI/package/Release Gate, Pi matrices and Pi runtime evidence; this was not a full lifecycle receipt. T09 remains PARTIAL under the renegotiated bounded scope in [`docs/t09-autopilot-closure-plan.md`](t09-autopilot-closure-plan.md). The current candidate adds restart recovery for interrupted restore staging/publication and staged-config creation, plus fail-closed uninstall locking. Independent review of the staged-config recovery delta found no concrete issue. Exact candidate `57e706b3dada312dd195f75d849f1d566a5ed05d` passed CI and Release Gate on Linux/macOS/Windows, plus Phase 0, Pi runtime evidence and the Pi support matrix; Pi Free Smoke was skipped. Its packed Windows smoke confirms the renamed-marker correction. Concurrent uninstall route-substitution evidence remains outstanding, so T09 is still PARTIAL. OS browser launching and the inherited non-bundled Pi advisory remain disclosed external debt. The full immutable Reference 4.3.0 binding is still missing; no new reference equivalence is inferred.

#### C. T05 exact-change review and correction — renegotiated local FULL

The approved FULL scope is limited to the deterministic public `/asen-review workspace` contract in `docs/audit/t04-t05-full-closure-plan-2026-10-30.md`; it does not claim original S6 or Reference Shell parity. PR #38 candidate `a523fd5a7f9d970d7ea471a031197506dbaa2e7e` passes the exact-SHA CI suites and Pi support matrices on Linux/macOS/Windows, Release Gate on all three systems, Phase 0, Pi runtime evidence and `t05-r4-audit`. Independent manual R4 review found no remaining issue. Its focused T04/T05/T10/R4 suite passes 104/104; the renegotiated T04/T05 acceptance set passes 52/52. Keep real-provider authentication, restart-durable public review state, OS sandboxing and formal external signoff visible as excluded debt. A reviewer/model result never grants delivery authority.

The initial independent R4 review found a MEDIUM sensitive-path disclosure on the old PR head: selected `.env*`, `*.pem`, and `*.key` contents could reach the reviewer provider. The reconciled candidate rejects those paths before snapshot creation and again at the provider boundary. The live NVIDIA CI job is opt-in via `ASEN_ENABLE_LIVE_T04_T05_NVIDIA=true`; Pi Free Smoke and NVIDIA were skipped, and no provider was invoked. The full local test run on Node 26 retained two child-process failures because `--experimental-transform-types` is unsupported there; supported Node 22 CI passed. T04 is FULL only for its renegotiated local recovery contract; original S5 and broader host parity remain PARTIAL. The canonical ODD records both bounded FULL claims without promoting the global parity registry.

Complete owned materialization and lifetime, then public candidate/controller/correction/acceptance integration. Preserve admitted A1/A2a1/A2a2 units. Do not treat a writable copy, stale result, model output, or cached verdict as authority. The retained Windows ACL fixture and restoration uncertainty require an ownership-safe disposition before claiming a ready review view.

#### D. Finish T10 workspace behavior

Implement bounded units for observed background-job exits, agents, cross-session boundaries, workspace actions/conflicts, notifications, and accessibility. Preserve admitted A3 history projection. A4 agent-status sanitization remains unadmitted because the verifier lifecycle failed/quarantined even though scoped functional evidence and PASS text exist.

#### E. Start T11 only from a real mapping

Add client adapters only after mapping an actual reference client and its capabilities. Keep Pi guarantees shared where valid, but do not fabricate identical tools, delegation, permissions, or host behavior across clients.

#### F. Resolve T04 and T07 honestly

T04's renegotiated provider-free durable local recovery contract is FULL, but original S5 still needs real Pi/provider interruption and controller evidence. T07 needs a real disposable-project CodeGraph/offline lifecycle. Mocks, an ancestor/existing index, or launcher presence are insufficient. Preserve prior stopped jobs and failed envelopes; do not retry blindly.

#### G. Run T12 last

Bind one exact candidate and run its focused tests, broader audits, package checks, and applicable Windows/platform proof. No parity claim is valid while required implementation or evidence is missing.

### Delivery shape

Use PR-sized units with their tests, docs, and old/new differentials for shared contracts. Mark unavailable capabilities blocked rather than documenting them as complete. No merge, release, destructive maintenance, provider action, or native approval is implied by this checkpoint.

Initial GitHub coding-agent assignment: first reconcile the clean remote baseline and canonical task state; then take the next coherent T09 gap through bounded PRs, beginning with the smallest dependency-ready part of executable managed update/restore/bootstrap work. Do not launch another agent from this document; no remote agent is launched here.

### Exact candidate checkpoint — 2026-10-28

PR #37 remains open on `feat/t09-managed-update-stage`. Initial remote HEAD was `c0d5caa0dbe7e4da835af5681b7396d2307fb532`; the diagnostic candidate `c3da3bd40faf644a897241580b751e882dae4e91` adds bounded, test-only Pi verifier shutdown tracing and a regression for the forced-kill case. On that exact candidate, Phase 0 Architecture, Pi 1.2 runtime evidence and Release Gate passed. Release Gate's packed real-Pi install receipts report three natural process exits and successful restart/cross-session execution on Linux, macOS and Windows. Its real-package smoke passed the signed local install/backup/restore/uninstall cycle described below on all three systems. Runners used Node 22.23.3 on Ubuntu 24.04 and macOS 26.6.2 arm64, Node 22.23.4 on Windows Server 2025, and Pi 1.2.0 throughout. Exact artifacts: Linux `12802685497`, macOS `12802520922`, Windows `12801479491` (run `40657477870`). Pi Free Smoke was skipped by its workflow condition. CI run `40657477741` was still in progress when this checkpoint was prepared; do not claim it passed until its final conclusion is observed.

The historical Release Gate failure on `c0d5caa` was `verify:package-receipts -- stateful-evidence` on Windows. The nested Pi package verifier did not close naturally within its existing 5-second grace after stdin EOF and was force-killed; the verifier correctly failed. The diagnostic candidate passed without changing shutdown behavior or increasing timeouts. Therefore the historical failure is **not reproduced, not causally resolved**; whether it was timing-sensitive cleanup or a runner/Pi-host issue remains unknown. See the exact workflow and candidate artifacts linked in the PR.

T09 remains **PARTIAL**. The packed-package smoke includes a local Ed25519-signed install under an ephemeral explicit trust anchor, doctor and installed CLI checks, backup plus integrity verification, restore to a clean target with data/config comparison, managed uninstall, and preservation of sample user data. It does not prove remote HTTPS acquisition, A-to-B activation/rollback, SQLite-active consistency, corrupt/interrupted restore recovery, symlink/concurrent-route uninstall protection, or a real browser launch. Keep T05, T10 and T11 statuses tied to their own evidence.

#### R4 residual: Pi host dependency advisory

`npm audit --json` on this candidate's development/test dependency graph reports 2 advisories (1 moderate, 1 high) in `@earendil-works/pi-coding-agent@1.2.0` → `undici@8.10.2`, including TLS certificate validation bypass [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx). Pi imports its Undici HTTP dispatcher. This is in the development Pi host dependency graph, not the packed ASEN tarball; ASEN declares Pi as an optional peer and does not bundle its dependency tree. npm's suggested Pi fix is `0.75.3`, a major-version downgrade incompatible with the required Pi 1.2.0 baseline. No dependency override or host-version substitution was made. Treat Pi 1.2.0's vulnerable Undici as a high inherited host risk and keep T09 security closure PARTIAL until a supported Pi-side fix is available and verified.

#### T09 follow-up — 2026-10-28

Continuation began from reconfirmed PR #37 HEAD `425170f02db2fa69327d4cc415b059a09ce004ec`. Added regression coverage through the public CLI for signed HTTPS loopback install, A→B upgrade, rollback, user-data preservation, and explicit TLS trust (unknown CA rejected with no install effects; trusted test CA accepted). Full local suite passed 2,211 / 0 failures / 19 conditional skips; typecheck, build, `npm run check`, `npm run verify:pack` and diff check passed. `verify:pack` validated the real generated ASEN tarball's host boundary (361 files, 28 exports, 11 commands, 16 tools). These local checks are distinct from the existing three-OS Release Gate real-package lifecycle receipts; this added upgrade/TLS regression has not yet run in CI or against the real packed artifact.

R4 review retains the Pi 1.2.0 → Undici advisories as inherited and unresolved. The checked dispatcher setup contains no function-valued TLS option identified by GHSA-2m5v-pch6-74hx as the trigger for its TLS bypass, but that observation does not prove all Pi paths unaffected. T09 remains PARTIAL pending exact-SHA CI and real-package/platform/update, restore recovery, uninstall race, browser-launch and dependency remediation evidence. Do not change T05/T10/T11 states.

#### T09 real-package acquisition extension — 2026-10-28

The disposable real npm-package smoke now performs signed HTTPS upgrade of the packed ASEN product from 0.1.0 to a versioned 0.1.1 copy and rollback, checking the installed CLI version and user-data invariance. The copy changes only its package version and the two compiled CLI version literals; all other package files derive from the real tarball. It also corrupts a real generated backup, verifies restore fails without creating target paths, then restores the valid backup to that same target and compares data/config before managed uninstall and data-preservation checks. Linux Node 24.22.1 passed this cycle. The first attempt uncovered a harness defect: synchronous `execFileSync` blocked the loopback HTTPS server event loop; asynchronous `execFile` fixed the reproduction. Typecheck, build and `verify:pack` pass. This harness extension still needs exact-SHA Release Gate on Windows/macOS and does not close interruption/SQLite restore, concurrent uninstall substitution, actual browser opening, or inherited Pi dependency risk. T09 remains PARTIAL.

The first Release Gate for the extended smoke (`2d50f464bc054045d7ef57146f0f9dee9fc239d6`) failed on Ubuntu with `ENOENT` for the TLS test key because the job changes into its temporary npm project before invoking the script. The script incorrectly resolved repository fixtures relative to process cwd. The fix anchors fixtures at the script's module URL. Reproduction with the same temporary cwd passed locally; macOS/Windows package jobs were cancelled after the Ubuntu failure and are not evidence. A corrected exact-SHA CI round is required; CI for the failed candidate remained in progress when this note was updated.


### T09 next-priority result — SQLite-consistent backup and restore failure recovery (2026-10-28)

Working branch remains `feat/t09-managed-update-stage`, PR #37, base candidate `9a235e15ce523c610cc7a5a726c77e8601fe2c13`. No branch or PR was created. A live-WAL SQLite regression initially failed because whole-home backup serialized raw database sidecars; the implementation now snapshots through read-only `VACUUM INTO`, integrity-checks and bounds the snapshot, omits WAL/SHM/journal sidecars, and binds the original database path to its observed file identity. Regression proves committed WAL data is backed up, post-snapshot writes are excluded, and restored SQLite integrity is `ok`. A handled staging-failure test proves cleanup, preservation and successful retry. Full local suite: 2,214 passed, 0 failed, 19 conditional skips; `npm run check`, typecheck, build and `verify:pack` passed after the lazy SQLite import and child-process version regression.

This does **not** prove abrupt process/power-loss recovery during restore publication. A caught injected error is not equivalent to SIGKILL; a durable journal/recovery protocol may be required to close that criterion. The actual packed smoke has not yet run this new SQLite case on Windows/macOS. Keep T09 PARTIAL and T05/T10/T11 unchanged until exact-SHA CI and outstanding criteria are evidenced.


The first CI candidate `49aa9e9c61cd01e82e4f78b724e4d8673b87fed3` exposed a cross-platform regression from eager `node:sqlite` import: Node 22 wrote an experimental warning to stderr for unrelated CLI invocations, causing Release Gate's packed version probe to fail and 50 Windows/Linux assertions to fail. The log identifies `stderr-not-empty` and the warning; the fix lazy-loads SQLite only when a database file is detected and adds a child-process clean-stderr regression. The failed candidate is not considered green. Its exact Phase 0/Pi evidence passed; CI/Release Gate require a new exact SHA.

#### T09 macOS smoke timeout and SQLite WAL follow-up — 2026-10-28

On candidate `a1e389dc8b1d7461f1b35bb5e49449d3942d700a`, Phase 0/Pi runtime passed; Release Gate Linux and Windows passed, while macOS real-package `managed upgrade` was terminated by the harness after 60 seconds with empty stdout/stderr. The product acquisition timeout is 60 seconds too, so the smoke had a deadline collision and suppressed the product's own terminal failure report. Root cause of the macOS request reaching that deadline is not yet established. The runner now gives only that child 75 seconds (product limit plus bounded reporting/cleanup margin) and records local HTTPS request paths plus TLS/client errors if it fails; no product timeout or retry was changed.

Locally on Linux/Node 24.22.1, the actual npm tarball completed signed loopback HTTPS upgrade and rollback, data preservation, backup of active SQLite WAL, integrity-checked snapshot-time restore, corrupt restore no-effects/retry, and uninstall retaining user data. The lifecycle suite passed 30/30 including SIGKILL during restore staging: the pre-existing target remained intact and retry completed, though an unpublished private staging directory remains after abrupt termination. Exact-candidate macOS/Windows evidence for these latest smoke assertions is pending; T09 remains PARTIAL. The inherited Pi 1.2.0/Undici advisories and uninstall route-substitution/browser-opening gaps remain open. T05/T10/T11 unchanged.

#### macOS full-suite chunk correction — 2026-10-28

Final candidate `12e3f08d57810bdb34aded2df3193699750d9c36`: Phase 0, Pi runtime, Pi support matrix and Release Gate passed; real npm tarball upgrade/rollback plus active SQLite WAL snapshot/restore passed in Linux, macOS and Windows. Ubuntu full CI passed. macOS full CI failed only because `planTestRuns` submitted all test files in one chunk and the unchanged 600,000 ms chunk watchdog returned 124 at 600,183 ms with cleanup confirmed. A new planner regression reproduces one chunk for 121 macOS files; the correction splits macOS into 50-file sequential chunks, preserving all tests and unchanged per-chunk/global deadlines. Focused runner tests pass 21/21. Full local checks and a corrective exact-SHA CI run are pending; Windows full-suite conclusion on `12e3f08` is also pending. T09 remains PARTIAL.

The same candidate's Windows suite identified an added-test portability defect: its child ESM import used a raw Windows drive path and failed with `ERR_UNSUPPORTED_ESM_URL_SCHEME` before reaching the restore checkpoint. The test now uses `pathToFileURL`; its isolated Linux reproduction passes. A first local check also caught and fixed a TypeScript implicit-any annotation in the planner regression. Full consolidated validation is rerunning before publication.

Corrected local validation is green: `npm run check` reports 2,216 passed, 0 failed, 19 conditional skips; parity/skills/memory/upstream-boundary audits pass. Ecosystem normative-source evidence remains NOT ADMITTED because the retained reference checkout is unavailable. Typecheck, build, verify-pack and diff-check pass. Package product code is unchanged from the Linux/macOS/Windows Release Gate success on `12e3f08`; still require Release Gate and full CI on the corrective SHA. T09 PARTIAL.
