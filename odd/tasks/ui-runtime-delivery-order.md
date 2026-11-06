# UI runtime delivery order
Objective: provide a dependency-correct, lower-capability-AI runbook for future UI delivery without creating a competing task or state store.
Status: activated for gate-first autopilot on `feat/t12-integrated-acceptance-merge` from base SHA `68fe5ca33cb885f8b687846273c2c9935f767919`; new work inherits no CI result from this base.

## Specs

S1. «de todos los frentes y odd abiertos cual seria el orden mas optimimo para recicir el tiempo de desarollo ?»

S2. «audita el orden recomenaddo y depues haz una odd sobre ello con tareas bien definidas y bien detallado para que se pueda hace facilmente por un modelo IA inferior»

S3. «implmenta el plan en modo autopiloto»

## Tasks

This document refines delivery slices only. Canonical requirements, completion state, and acceptance remain in the plans registered by `odd/tasks/shell-rea-megabatch.md`; original workspace, provider, reference, publication, and FULL constraints remain inherited through its S2/S6/S7. The safe visual baseline is `registry/parity/shell-asen-baseline-v1.json`. Canonical IDs below are exact mappings, not replacement IDs.

### Delivery table

| ID | Canonical mapping | Dependencies | Execution readiness | Future route / owner | Commit placeholder |
|---|---|---|---|---|---|
| R01 | UI-01 shell/rail | activated plan | DONE: documentary matrix; root split UNKNOWN | parent evidence owner | d517a69b |
| R02 | UI-01 shell/rail | R01=supported public candidate | BLOCKED until R01 identifies a supported public candidate | actual-host evidence owner | pending |
| R03 | UI-01 shell/rail | R01,R02=supported | BLOCKED until host admission | core integration writer | pending |
| R04 | UI-01 shell/rail | R03 | BLOCKED until host admission | integration writer | pending |
| R05 | UI-11 responsive/presets | R03 | PENDING_PREREQUISITES | bounded geometry writer | pending |
| R06 | UI-11 responsive/presets | R04,R05 | PENDING_PREREQUISITES | integration writer | pending |
| R07 | UI-03 Todos/ODD | retained widget/modal branch selected | PARTIAL: U1 28/28 + host width 1/1; separate boundary check PASS | formatter + sole integrator; no FULL | e176b6d3 |
| R08 | UI-07 Integrations/MCP | retained widget/modal branch selected | PARTIAL: existing projection characterized in 73/73 combined check | reuse existing module; no duplicate projector | pending |
| R09 | UI-08 Statusbar | retained status/widget branch selected | PARTIAL: existing projection characterized in 73/73 combined check | reuse existing module; host acceptance separate | pending |
| R10 | UI-10 palette/keymaps/guide | retained command/modal branch selected | PARTIAL: live guide integrated 21/21; keymaps/tour separate | bounded guide writer + sole integrator | 52239855 |
| R11 | UI-02 Agents | retained modal branch selected | PARTIAL: owned-selection/inspection 17/17; hierarchy/thread not FULL | reuse existing navigator | baseline 68fe5ca3; characterization only |
| R12 | UI-02 Agents actions | R11 owned selection admitted; R18/R19 only for affected actions | PARTIAL: A1 Stop accepted 7/7 + regression31/31 + Jobs60/60 + separate guard PASS; Resume/Follow separate | sole M2/action integration owner | 7107b8b1 A1 |
| R13 | UI-05 Jobs/monitors | retained modal branch; owned metadata/selection admitted | PARTIAL: A1 technical gate DONE; publication/CI pending; Follow/logs separate | sole M2/entrypoint action writer | dc804359 |
| R14 | UI-04 Changes | R04 or retained modal branch | PENDING_PREREQUISITES | bounded module writer | pending |
| R15 | UI-06 Review | R04 or retained modal branch | PENDING_PREREQUISITES | bounded module writer | pending |
| R16 | T09/UI-12 accepted maintenance reconciliation | activated plan | DONE: accepted scope; R20 gates retained | parent evidence owner | d517a69b |
| R17 | UI-09 Profiles/fallback | R09,R11 | PENDING_PREREQUISITES | bounded projection writer | pending |
| R18 | T10-3 host delivery/consumption and protocol capability map | activated plan | DONE: primitives mapped; trusted producer design pending | parent evidence owner | d517a69b |
| R19 | UI-13 parent-child/recovery | R07,R11,R18; trusted producer/ownership required | PARTIAL: pinned RPC input/editor transport 1/1; query implementation not admitted | parent protocol owner; no API-block fiction | 1dcb2fec test-only |
| R20 | UI-12 maintenance | FREF,accepted T09,R16 | BLOCKED on canonical gates | maintenance owner | pending |
| R21 | UI-01..UI-13 shared wiring | relevant modules green | PARTIAL: Todo width + live help + owned Agent Stop integrated; remaining modules separate | single integration owner | e176b6d3,52239855,7107b8b1 |
| R22 | UI-14 canonical acceptance preflight | R01..R21 complete as applicable | BLOCKED until stable candidate | acceptance planner | pending |
| R23 | UI-14 real observations/F5/ECO | R22,stable exact SHA | BLOCKED until stable candidate | evidence owner | pending |

### Audited dependency graph and waves

The delivery table is the single normative DAG. Its exact edges are:

- `R01 -> R02`; `R01 + R02(supported) -> R03`.
- `R03 -> R04` and independently `R03 -> R05`; R04 and R05 may run in parallel after the admitted contract when their surfaces are disjoint.
- `R04 + R05 -> R06`.
- R07/R08/R09/R10/R11/R13/R14/R15 each use either R04 or the retained existing surface stated in their table row; no edge is implied between those feature cards.
- `R09 + R11 -> R17`; R16 has no edge to R17.
- `R07 + R11 + R18(required correlation/ownership capabilities supported) -> R19`. Unobservable display ACK blocks only display/consumption claims or dependent actions.
- `FREF + accepted T09 + R16 -> R20`.
- R12 requires R11; only a named delivery/query action that consumes R18/R19 capability also requires that capability.
- Relevant green modules feed R21; `R01..R21 complete as applicable -> R22 -> R23`.

- **Wave 0, serial admission:** R01 then R02. No rail implementation begins before both conclude with public-contract and actual-host evidence.
- **Wave 1, core contract:** R03 is the first serial unit in the single integration-owner lane and owns shared `src/runtime/ide-panel.ts` edits for this contract. If admission is unsupported or unknown, R03/R04/R06 remain BLOCKED; independently valuable work uses existing widget, status, selection, editor, and modal surfaces without calling it fullscreen equivalence.
- **Wave 2, at most two writers:** R04 and R05 may run in parallel after R03. A pure feature writer may pair with one integration-owner unit only when exact surfaces are disjoint. The same integration-owner lane serially owns `extensions/asen.ts`, shared `src/runtime/ide-panel.ts`, R03, R04, R06, and R21.
- **Wave 3, feature modules:** Changes and Review may proceed independently. Profiles starts when Agents and Status are ready; it never waits for maintenance reconciliation. UI-13 starts when Agents, Todos, and its required correlation/ownership capabilities are ready; it does not wait for Changes, Review, Profiles, or host display ACK that it does not consume.
- **Wave 4, integration:** R06 and R21 are serial integration units. Overlapping helpers or contracts land serially; no writer owns several feature families in one broad unit.
- **Wave 5, acceptance last:** R22 then R23 only after a stable candidate. Focused tests and risk verification accompany every earlier unit; they are not deferred to this wave.

### Shared execution rules

1. **Authority and state.** S3 activates ordinary bounded work in dependency order. `PENDING_PREREQUISITES` does not mean absent human scope approval; it means its technical/ownership gates are not yet satisfied. Do not interrupt every card or focused test with a redundant basic approval question. Required provider, native-host, maintenance, security-risk, publication, installation, or destructive-operation consent remains separate and exact. `READY_AFTER_APPROVAL` means dependency-ready after plan activation, not started. `BLOCKED` is mandatory when a stated capability, protocol, evidence tool, or canonical gate is absent. A renderer slice marked DONE never means its canonical UI ID is FULL.
2. **Public host admission first.** Tracked code proves public widget/status/custom/select/confirm/editor surfaces and modal fallbacks, but tracked absence does not prove that a persistent root/layout/resize/editor-ownership API does not exist. R01 must inspect documented public contracts for the pinned host. R02 must use the existing actual-Pi harness. Mock `setRail`, private-runtime patching, another SDK, or a new UI framework is forbidden. If the required public capability remains unsupported or unknown, the persistent-rail branch stays BLOCKED and the widget/modal branch remains the default.
3. **Pinned version truth.** The package floor, development anchor, lock, and both support-matrix anchors are `1.2.0`. A transitive TUI package at `1.5.0` is not a host `1.5` support claim. No dependency or runtime upgrade may be used to force a capability.
4. **Geometry contract.** UI-01 defines the shell/rail contract before mount and lifecycle. UI-11 follows as separate geometry and preset work. The normative breakpoint is `>=140`; tests cover `139` and `140`. Existing widths `1..13` retain their safe fallback, unsupported widths never reach M2, and all renderers preserve Unicode graphemes, control sanitization, height clipping, scope+width caching, host-key precedence, and editor ownership.
5. **Canonical sources.** Reuse current stores, projections, modal viewers, journals, and routing. Do not create a second bus/store, duplicate formatters, rebuild viewers, or infer actions from display state. Enqueued or unconfirmed notifications are never shown as consumed or acknowledged.
6. **Two read-only decisions may run in parallel.** R16 reconciles accepted T09 maintenance scope for UI-12 only. R18 separately maps correlation/ownership capabilities and host delivery/display/consumption observability. Neither requires T10 FULL for independent renderers. Unobservable host display ACK blocks only affected delivery/consumption assertions; it is not native review ACK and does not block unrelated correlated informational queries when their required capabilities are supported. The proposed removal of the old scheduling dependency is a scheduling proposal only: it does not waive prior proof or activate implementation.
7. **Writer limit and shared ownership.** At most two concurrent writers, with exact disjoint surfaces. One integration-owner lane exclusively owns `extensions/asen.ts` and shared `src/runtime/ide-panel.ts`; R03 is its first core-contract unit, followed serially by R04/R06/R21 as needed. Pure renderers and projections may run in parallel; shared helper or contract changes are serialized. Before launch, the parent checks read/write surfaces too: if one worker would test against files another worker is changing, serialize by default unless supported isolated same-clone worktrees and a frozen interface make the checks independent. Disjoint write filenames alone are not proof of independent test inputs; never copy an entire dependency tree merely to manufacture parallelism.
8. **Actions are explicit.** Agent Stop, Follow, and Resume; job Stop and Follow; safe editor open; paid fallback; keymap rebinding; and any delivery/consumption assertion have named read-only or action subgates in R10/R12/R13/R14/R17/R18/R19 or remain BLOCKED. Parent discovery records authoritative exact edit surfaces before any unknown-path writer launches. Each action lands as a separate coherent commit; actions may not disappear merely to make feature rows look complete. UI rendering never grants consent, authority, or permission.
9. **Portable future environment.** Use a clean tracked-lockfile install only when separately authorized and isolated under a project-owned home/config/cache/data/temp root. Never depend on this machine's caches, installed SDK copies, private sessions, or the existing historical isolated tree. Current original-root dependencies are known broken; the historical isolated tree is local evidence only. Do not repeat the earlier long dependency copy or install/update dependencies merely to force proof.
10. **Command discipline and differentials.** Run focused tests first and only commands authorized for the card. Use a background execution tool for known long checks when available. If a required tool is absent, report BLOCKED; do not silently omit the command or run an unbounded foreground substitute. Failure/retry budget comes from the active harness and task authorization; this runbook grants no universal retry count. If shared options, parsers, or helpers change behavior used by an existing unrequested command, run one bounded old/new differential against the previous approved code in project-owned scratch: compare stdout, stderr, and exit code. Pin any unintended difference with a public-interface regression. Committed tests never read Git history or a fixed commit. Otherwise ordinary focused regression checks suffice; this conditional rule grants no extra retry budget.
11. **Provider and reference safety.** Use only the inherited active Pi provider/model. No Ollama models or local Beam execution, no reference writes, no destructive Git actions, no main merge, and no package release/publication. Ordinary feature commits and non-force pushes follow active host permissions and repository policy; this planning document itself grants no publishing authority. The pinned reference is read-only.
12. **Evidence truth.** Base-SHA receipts are pinned historical starting evidence, not evidence for future changes. The unavailable original refresh verifier remains unavailable: no retry, substitute verdict, or unrelated risk check closes it. A memory mirror is pending/unavailable and is not an authority source. Provider consent, model output, self-authored receipt, or self-verdict is never review authority.
13. **Result capture.** Each executed command records exact candidate SHA, command, exit code, stdout/stderr location or bounded text, assertion totals and skips where emitted, environment/isolation identity, and whether evidence is unit, integration, actual-host, CI, or human. No totals are inferred from workflow metadata.

### Parked fronts and acceptance boundaries

- Keep already closed **canonical capability-roadmap** T04/T05 renegotiated contracts, T07 local lifecycle, T11 Pi-only integration, T12 provider-free acceptance, and memory R01-R09 closed in their admitted scopes. These IDs are not the local coordinator's similarly numbered tasks; global equivalence remains a different requirement.
- Keep the original unavailable refresh verifier and externally blocked provider, consent, EF-002/701/704, and ECO FULL5-U3/ECO07-Q2 proof outside the renderer critical path. Do not retry them, create replacement verdicts, or count them as passed. Future documentary reconciliation must check their latest canonical state rather than treating this inventory as a permanent closure claim.
- T09 reconciliation preserves its accepted scope: excluded real-browser opening, inherited dependency advisory and global reference parity do not become new implementation tasks. Existing accepted HTTPS acquisition is not excluded.
- F5 and global comparison admission run on a stable candidate at acceptance; ordinary functional tests, risk-gated verification and the active review policy still apply to each applicable work unit.
- Every declared action subgate has its own owner and DONE/PARTIAL/BLOCKED evidence. A read-only slice may finish while actions stay blocked, but that never completes the canonical UI ID or allows R23 to count the actions as passed. No status transition erases missing proof.

### Handoff template

```text
runbook: odd/tasks/ui-runtime-delivery-order.md
card: R##
canonical: UI-## or named gate
specs: local S#[,S#]; inherited coordinator S2/S6/S7
base_sha: <exact SHA>
state: READY_AFTER_APPROVAL | BLOCKED
allowed_edits:
  - <exact path; EXISTING or NEW>
read_first:
  - <up to three exact paths>
prerequisites:
  - <gate and observed evidence>
verification:
  - <exact authorized command>
stop_if:
  - <deterministic stop condition>
```

### Exact-scope return template

```text
status: completed | partial | blocked | interaction_required
card: R##
canonical_full: false
summary: <single observable result>
files_changed:
  - <exact path and change>
red: <command, intended failure, exit, totals>
green: <command, pass/fail, exit, totals/skips>
evidence: <candidate SHA; stdout/stderr; unit/integration/actual-host classification>
side_effects: none | <authorized effect>
remaining_gates:
  - <gate>
stop_reason: none | <deterministic reason>
next_ready_cards:
  - <ID only when dependency-ready; no automatic authorization>
```

### Detailed cards

#### R01 — Public host capability matrix

- **Canonical / specs:** UI-01 shell/rail; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** produce one reviewed matrix of documented public pinned-host capabilities for persistent mount/root layout, resize observation, editor/autocomplete ownership, host keybindings, disposal/scope, dimensions, and non-TUI fallback; outcome is `SUPPORTED`, `UNSUPPORTED`, or `UNKNOWN` per row, never an implementation.
- **Prerequisites / gates:** activated plan; pinned host remains `1.2.0`; no package mutation. `SUPPORTED` requires a documented public interface, not a private symbol or tracked absence inference.
- **Read first:** `src/runtime/pi-host.ts`; `extensions/asen.ts`; `scripts/pi-support-matrix.mjs`.
- **Allowed edits:** NEW `odd/evidence/ui-host-public-capability-matrix.md` only; no source/config/lock edits.
- **Steps:** inspect tracked contracts plus explicitly authorized public, pinned, reproducibly resolved documentation; map each needed capability to public name, lifecycle, mode, dimensions, disposal, and fallback; identify existing ASEN call sites; record negative evidence and uncertainty; obtain human disposition only when public/private status remains materially ambiguous.
- **Tests / negative cases:** documentation audit only; verify that widget/status/custom/select/confirm/editor are not misreported as persistent-root proof; reject private runtime members, invented `setRail`, framework replacement, and dependency upgrade as evidence.
- **Command after creation:** `git diff --check -- odd/evidence/ui-host-public-capability-matrix.md`.
- **Expected evidence:** exact base SHA, source/document versions, path/section citations, matrix row counts, diff-check exit; classify as read-only/documentary, not actual-host proof.
- **DONE vs FULL:** DONE means matrix accepted; UI-01 remains not started and not FULL.
- **No-go / stop:** stop BLOCKED if required documentation cannot be obtained from tracked or explicitly authorized reproducible sources without install/network mutation, global SDK state, private copies, or unrelated outside-project reads, or if public/private status cannot be resolved.
- **Owner / risk / commit:** read-only explorer then parent disposition; risk triggers are host contract ambiguity and editor ownership; one documentation-only commit boundary.

#### R02 — Existing actual-host admission witness

- **Canonical / specs:** UI-01 shell/rail; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** extend or reuse the actual-Pi TUI witness to prove, on the pinned host, the admitted public capability while preserving editor input, autocomplete, host bindings, width/height observations, disposal/scope, and non-TUI behavior.
- **Prerequisites / gates:** R01 accepted with at least one supported candidate; activated plan covers ordinary focused test/script work, while actual-host or long execution still needs its exact host-policy authorization; no model call.
- **Read first:** `scripts/t10-real-pi-tui-matrix.mjs`; `.github/workflows/ci.yml`; `tests/pi-host-preflight.test.ts`.
- **Allowed edits:** EXISTING `scripts/t10-real-pi-tui-matrix.mjs`; EXISTING `tests/pi-host-preflight.test.ts`; NEW `tests/ui-host-admission.test.ts`; no production source.
- **Steps:** RED add a public-interface witness that fails without the admitted capability; add negative cases for editor/autocomplete loss, stale scope, resize, disposal, and non-TUI; minimally extend the existing harness; GREEN run focused unit witness, then the existing actual-host script at `139,140`; retain machine-readable evidence.
- **Commands after creation:** `node --import tsx --test tests/pi-host-preflight.test.ts tests/ui-host-admission.test.ts`; `node scripts/t10-real-pi-tui-matrix.mjs 139,140`.
- **Expected evidence:** RED/GREEN exit codes and totals; actual-host JSON with width/height, input/autocomplete/keybinding/disposal observations, zero model calls, exact host version, candidate SHA, stdout/stderr. Unit mocks alone do not pass this card.
- **DONE vs FULL:** DONE admits or rejects the persistent branch; it does not implement UI-01 or prove fullscreen equivalence.
- **No-go / stop:** unsupported/unknown capability, required tool absent, model/provider invocation, editor behavior regression, or invented probe command => BLOCKED.
- **Owner / risk / commit:** actual-host evidence owner; risk triggers are host lifecycle and terminal input ownership; one tests/harness commit.

#### R03 — UI-01 pure shell and rail contract

- **Canonical / specs:** UI-01 shell/rail; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** define a pure, bounded shell/rail projection with deterministic section order, collapse state, tint tokens, digest cache, scope identity, and no host mutation.
- **Prerequisites / gates:** R01 and R02 both support the required public path; activated plan and parent-frozen exact surfaces. Unsupported/unknown keeps this card BLOCKED.
- **Read first:** `src/runtime/ide-panel.ts`; `src/runtime/m1-readonly-rail.ts`; `tests/ide-panel.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/ide-panel.ts`; NEW `src/runtime/persistent-rail.ts`; EXISTING `tests/ide-panel.test.ts`; NEW `tests/persistent-rail.test.ts`. No `extensions/asen.ts`.
- **Steps:** RED specify order/cache/collapse/scope contracts; include Unicode/control/height and no-dispatch negatives; implement minimum pure projection; GREEN focused tests; refactor only duplicate pure formatting; document exported contract in code comments.
- **Commands after creation:** `node --import tsx --test tests/ide-panel.test.ts tests/persistent-rail.test.ts`.
- **Expected evidence:** intended RED assertion, GREEN exit/totals/skips, exact SHA, no filesystem/network/provider/store mutations, renderer snapshots at widths `140` and `160`.
- **DONE vs FULL:** DONE is a pure UI-01 contract slice; mount, lifecycle, actual-host behavior, and canonical UI-01 FULL remain open.
- **No-go / stop:** any need for private host APIs, new state store, hidden dispatch, duplicate viewer, or shared entrypoint edit stops the card.
- **Owner / risk / commit:** core integration writer in the single integration-owner lane; low risk unless shared contract changes emerge; one pure core-contract+tests commit.

#### R04 — UI-01 host mount and lifecycle

- **Canonical / specs:** UI-01 shell/rail; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** mount the R03 projection through the admitted public host API and prove resize, editor/autocomplete preservation, host-key precedence, disposal, session/project scope, and widget/modal fallback.
- **Prerequisites / gates:** R03 green; R02 actual-host admission; activated plan covers the ordinary integration unit, while any required native-host or risk consent remains separate.
- **Read first:** `extensions/asen.ts`; `src/runtime/persistent-rail.ts` (NEW after R03); `tests/m1-f1f2-integration.test.ts`.
- **Allowed edits:** EXISTING `extensions/asen.ts`; NEW `tests/persistent-rail-integration.test.ts`; EXISTING `tests/m1-f1f2-integration.test.ts`. Shared composition is integrator-only.
- **Steps:** RED integration cases for mount/dispose/resize/scope/editor/autocomplete/fallback; wire minimum lifecycle without changing stores; GREEN focused integration tests; run actual-host witness; update canonical evidence only in a separately authorized owner step.
- **Commands after creation:** `node --import tsx --test tests/m1-f1f2-integration.test.ts tests/persistent-rail-integration.test.ts`; `node scripts/t10-real-pi-tui-matrix.mjs 139,140,160`.
- **Expected evidence:** unit/integration totals plus actual-host JSON; exact SHA; zero model calls; editor/autocomplete and host bindings observed before/during/after mount; disposal leaves no stale surface.
- **DONE vs FULL:** DONE is host-supported UI-01 mount; UI-01 FULL still requires canonical acceptance evidence.
- **No-go / stop:** capability mismatch, private patching, replacing modal fallback, scope leak, or editor/autocomplete ownership loss => BLOCKED. Preserve identified partial edits and unrelated work; no automatic branch revert, reset, or rollback. Any destructive or rollback operation requires active host policy and explicit exact authorization.
- **Owner / risk / commit:** single integration writer; host lifecycle risk requires focused independent risk review when authorized; one mount/lifecycle commit.

#### R05 — UI-11 pure geometry and breakpoint

- **Canonical / specs:** UI-11 responsive/presets; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** centralize pure geometry for the normative `>=140` rail transition while preserving widths `1..13`, clipping, Unicode graphemes, and safe M2 width budgets.
- **Prerequisites / gates:** R03 contract available; no host wiring needed.
- **Read first:** `src/runtime/responsive-layout.ts`; `src/runtime/native-work-panel.ts`; `tests/t10-responsive-matrix.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/responsive-layout.ts`; EXISTING `src/runtime/native-work-panel.ts`; EXISTING `tests/responsive-layout.test.ts`; EXISTING `tests/t10-responsive-matrix.test.ts`; NEW `tests/ui11-geometry.test.ts`.
- **Steps:** RED widths `1..13,139,140,160`, invalid widths, graphemes, controls, rows and M2 budget; implement minimum pure geometry; GREEN; refactor only shared geometry with all focused tests green.
- **Commands after creation:** `node --import tsx --test tests/responsive-layout.test.ts tests/native-work-panel.test.ts tests/t10-responsive-matrix.test.ts tests/ui11-geometry.test.ts`.
- **Expected evidence:** RED/GREEN totals, boundary snapshots, no host/store/filesystem side effects, exact SHA.
- **DONE vs FULL:** DONE supplies UI-11 geometry only; presets, host resize, actual observations, and UI-11 FULL remain open.
- **No-go / stop:** do not pass width `<12` to M2, alter editor ownership, or combine host integration into this commit.
- **Owner / risk / commit:** bounded geometry writer; renderer-local risk; one geometry+tests commit.

#### R06 — UI-11 presets and resize wiring

- **Canonical / specs:** UI-11 responsive/presets; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** expose one deterministic Light/Neutral/Power projection choice and apply host resize updates without duplicate layout state.
- **Prerequisites / gates:** R04 mounted lifecycle, R05 green, public resize evidence from R02.
- **Read first:** `extensions/asen.ts`; `src/runtime/responsive-layout.ts`; `tests/panel-observation-integration.test.ts`.
- **Allowed edits:** EXISTING `extensions/asen.ts`; NEW `src/runtime/ui-preset.ts`; NEW `tests/ui-preset.test.ts`; EXISTING `tests/panel-observation-integration.test.ts`.
- **Steps:** RED preset determinism, `139/140`, resize disposal, unknown preset, scope cache, no hidden mutation; implement pure preset mapper then integrator wiring; GREEN unit/integration; actual-host `139,140` witness.
- **Commands after creation:** `node --import tsx --test tests/ui-preset.test.ts tests/panel-observation-integration.test.ts`; `node scripts/t10-real-pi-tui-matrix.mjs 139,140`.
- **Expected evidence:** exact SHA, RED/GREEN totals, actual-host dimensions and disposal, no model/store/network effects.
- **DONE vs FULL:** DONE is bounded UI-11 wiring; canonical UI-11 FULL remains acceptance-gated.
- **No-go / stop:** no second preference store, private resize hook, or preset-dependent permissions.
- **Owner / risk / commit:** integration writer; host resize risk; one preset+wiring commit.

#### R07 — UI-03 Todos/ODD projection

- **Canonical / specs:** UI-03 Todos/ODD; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** render the actual authoritative task states from the existing store/presentation, including `succeeded` as executed-but-not-reviewed rather than DONE, current/blocked reasons, bounded scroll/prompt cache, and saved-list behavior; never coerce `cancelled` into a different state.
- **Prerequisites / gates:** R04 supported branch or explicit retained widget/modal authorization; canonical task store remains authoritative.
- **Read first:** `src/runtime/todo-presentation.ts`; `src/runtime/ide-panel.ts`; `tests/todo-presentation.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/todo-presentation.ts`; NEW `src/runtime/todo-panel.ts`; EXISTING `tests/todo-presentation.test.ts`; EXISTING `tests/pi-todo-tools.test.ts`; NEW `tests/todo-panel.test.ts`. No shared registration.
- **Steps:** RED exact existing-state mapping, `succeeded` not DONE, `cancelled` preserved, stale scope, control text, clipping, empty list, saved list and no dispatch; reuse the current store/presentation and implement only the minimum pure projection; GREEN focused tests; hand off registration to R21.
- **Commands after creation:** `node --import tsx --test tests/todo-presentation.test.ts tests/pi-todo-tools.test.ts tests/todo-panel.test.ts`.
- **Expected evidence:** totals/skips, exact SHA, immutable source rows, zero task mutation/agent dispatch/provider calls.
- **DONE vs FULL:** DONE is renderer/projection only; UI-03 FULL and actions remain open.
- **No-go / stop:** no new task/state model, no state rewrite or coercion, and no inferred review completion.
- **Owner / risk / commit:** bounded renderer writer; data-integrity trigger if source-state semantics change; one projection commit.

#### R08 — UI-07 integrations projection

- **Canonical / specs:** UI-07 Integrations/MCP; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** render observed inventories and profile inspection with truthful unknown/unavailable states and no connection inference.
- **Prerequisites / gates:** existing inventory inspection contract; retained modal or admitted rail surface.
- **Read first:** `src/runtime/integration-profile-inspection.ts`; `src/runtime/ide-panel.ts`; `tests/integration-profile-inspection.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/integration-profile-inspection.ts`; NEW `src/runtime/integrations-panel.ts`; EXISTING `tests/integration-profile-inspection.test.ts`; NEW `tests/integrations-panel.test.ts`.
- **Steps:** RED empty/malformed/limited inventory, unknown connection, profile snapshot, sanitization, no getter side effects; implement pure projection; GREEN; defer registration to R21.
- **Commands after creation:** `node --import tsx --test tests/integration-profile-inspection.test.ts tests/integrations-panel.test.ts`.
- **Expected evidence:** exact SHA, totals, no network/provider/telemetry/store writes, unknown remains unknown.
- **DONE vs FULL:** DONE is UI-07 projection only; actual connection evidence and canonical FULL remain open.
- **No-go / stop:** do not probe networks, store secrets, or claim runtime connection from registry presence.
- **Owner / risk / commit:** bounded renderer writer; security trigger if credentials or live probes are proposed; one projection commit.

#### R09 — UI-08 status bar projection

- **Canonical / specs:** UI-08 Statusbar; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** project branch/dirty, mode, selected/responding model, effort, context, and truthful unavailable cost/subscription/usage states into bounded status output.
- **Prerequisites / gates:** existing public observation inputs; admitted status surface or retained `setStatus` branch.
- **Read first:** `src/runtime/host-status-projection.ts`; `src/runtime/ide-panel.ts`; `tests/panel-observation-integration.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/host-status-projection.ts`; NEW `src/runtime/statusbar-projection.ts`; NEW `tests/statusbar-projection.test.ts`; EXISTING `tests/panel-observation-integration.test.ts`.
- **Steps:** RED selected/responding mismatch, invalid usage, unknown cost, control text, width clipping, no history scan; implement stateless projection; GREEN; registration deferred to R21.
- **Commands after creation:** `node --import tsx --test tests/statusbar-projection.test.ts tests/panel-observation-integration.test.ts`.
- **Expected evidence:** exact SHA, totals, no provider/history/network/store side effects, unavailable fields preserved.
- **DONE vs FULL:** DONE enables the UI-08 projection dependency; clickable usage and canonical FULL remain open unless separately supported.
- **No-go / stop:** no billing inference, provider call, fabricated quota, or duplicate status store.
- **Owner / risk / commit:** bounded projection writer; low risk unless host observation contract changes; one projection commit.

#### R10 — UI-10 command palette, keymaps, and guide

- **Canonical / specs:** UI-10 palette/keymaps/guide; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** expose registered commands through existing catalog and host bindings, with searchable guide text and truthful reload behavior.
- **Prerequisites / gates:** command inventory and public keybinding contract; retained modal or admitted shell.
- **Read first:** `src/runtime/command-catalog.ts`; `extensions/asen.ts`; `tests/command-catalog.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/command-catalog.ts`; NEW `src/runtime/command-guide.ts`; EXISTING `tests/command-catalog.test.ts`; EXISTING `tests/extension-runtime-commands.test.ts`; NEW `tests/command-guide.test.ts`. `extensions/asen.ts` only through R21.
- **Steps:** RED catalog/search/unknown command/rebinding/host precedence/no execution-on-render; implement pure guide; GREEN; define explicit registration handoff. Keymap rebinding remains a named action contract and stays BLOCKED if the public host contract is absent.
- **Commands after creation:** `node --import tsx --test tests/command-catalog.test.ts tests/extension-runtime-commands.test.ts tests/command-guide.test.ts`.
- **Expected evidence:** exact SHA, command totals, negative collision and hidden-action cases, zero command execution while rendering.
- **DONE vs FULL:** DONE is catalog/guide behavior; keymap rebinding is a separate named action gate, and host registration plus canonical UI-10 FULL remain open.
- **No-go / stop:** no global keymap, no shadow command registry, no invented reload action.
- **Owner / risk / commit:** bounded command writer; shared registration serialized; one catalog/guide commit.

#### R11 — UI-02 Agents renderer and hierarchy

- **Canonical / specs:** UI-02 Agents; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** render authoritative agent hierarchy, thread/inspection metadata, model/effort only when observed, and notification state without implying consumption or ACK.
- **Prerequisites / gates:** existing agent store/inspection/journal contracts; retained modal or admitted rail; no action authorization.
- **Read first:** `src/runtime/agent-inspect.ts`; `src/runtime/native-m2-navigator.ts`; `tests/agent-inspect.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/agent-inspect.ts`; NEW `src/runtime/agents-panel.ts`; EXISTING `tests/agent-inspect.test.ts`; EXISTING `tests/agent-inspect-output-boundary.test.ts`; EXISTING `tests/m2-f6-native-ui.test.ts`; NEW `tests/agents-panel.test.ts`.
- **Steps:** RED hierarchy/thread/unknown metrics/truncation/duplicate IDs/stale scope/enqueued-not-consumed/no dispatch; implement pure renderer; GREEN; leave Stop/Follow/Resume disabled and explicitly labeled for R12.
- **Commands after creation:** `node --import tsx --test tests/agent-inspect.test.ts tests/agent-inspect-output-boundary.test.ts tests/m2-f6-native-ui.test.ts tests/agents-panel.test.ts`.
- **Expected evidence:** exact SHA, totals, immutable inputs, zero agent launch/cancel/message/provider side effects.
- **DONE vs FULL:** DONE is a read-only UI-02 slice, not `UI-02 FULL`; action and actual-host evidence remain open.
- **No-go / stop:** no second agent store/bus, no transcript fabrication, no ACK from enqueue state.
- **Owner / risk / commit:** bounded renderer writer; privacy trigger for transcript/content exposure; one renderer commit.

#### R12 — UI-02 explicit Stop/Follow/Resume contracts

- **Canonical / specs:** UI-02 Agents actions; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** deliver four deterministic sub-outcomes: D0 parent-owned read-only action discovery, then A1 Stop, A2 Follow, and A3 Resume as separately authorized action units backed by existing authority and identity checks; no consent inference.
- **Prerequisites / gates:** R11. R18/R19 applies only to a named action that actually consumes host delivery/consumption or correlated-query capability. Each action requires its relevant security/data-integrity authorization; D0 itself is read-only under the activated plan.
- **Read first:** `src/runtime/agent-inspect.ts`; `src/runtime/agent-store.ts`; `src/runtime/agent-notification-journal.ts`.
- **Allowed edits:** D0 edits only NEW `odd/evidence/ui02-agent-action-surface-map.md`. The parent records exact EXISTING owner paths and any NEW focused test path in that map before launching A1, A2, or A3; child writers may not derive authoritative edit surfaces.
- **Steps:** D0 maps Stop/Follow/Resume independently to existing public commands/tools, authority checks, protocol needs, and exact paths. For each supported action separately: RED unauthorized owner, stale scope, duplicate action and action-specific timeout/cancel/restart negatives; implement the minimum adapter; GREEN its focused tests; record unsupported action as BLOCKED without omitting it.
- **Commands after D0:** exact commands are parent-frozen in the surface map from existing test families, including `tests/agent-notification-multiprocess.test.ts` or `tests/agent-notification-restart-process.test.ts` only when the named action uses those contracts; no generic combined action command is pre-authorized.
- **Expected evidence:** D0 exact path/API map; then per-action SHA, RED/GREEN exit/totals, relevant journal/subprocess evidence, no provider or permission side effects, and required risk-review outcome.
- **DONE vs FULL:** D0 DONE means discovery only. A1/A2/A3 each have independent DONE. R12 as a whole is DONE only when all its declared subunits pass; otherwise it is PARTIAL/BLOCKED with their exact states. UI-02 FULL remains false while any required action or acceptance case is missing or BLOCKED; canonical-owner disposition never makes a blocked action count as passed.
- **No-go / stop:** unknown owner API, absent authority check, automatic consent, replay, new bus/store, or missing parent-frozen edit surface => affected action BLOCKED; unrelated actions remain independently decidable.
- **Owner / risk / commit:** parent owns D0 and routing; one security-sensitive action writer per A1/A2/A3; each action is a separate coherent commit, never a combined action mega-unit.

#### R13 — UI-05 Jobs and monitors

- **Canonical / specs:** UI-05 Jobs/monitors; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** deliver deterministic J0 read-only owned-job/monitor rendering, then D0 parent-owned action discovery, J1 Stop, and J2 Follow as separate outcomes; logs stay withheld unless the canonical contract authorizes a bounded view.
- **Prerequisites / gates:** existing background job journal/executor; retained modal or admitted rail. J0 uses ordinary plan activation; J1/J2 require their relevant action and risk authorization after D0.
- **Read first:** `src/runtime/job-inspect.ts`; `src/runtime/background-jobs.ts`; `tests/job-inspection-integration.test.ts`.
- **Allowed edits:** J0: EXISTING `src/runtime/job-inspect.ts`; NEW `src/runtime/jobs-panel.ts`; EXISTING `tests/job-inspect.test.ts`; EXISTING `tests/job-inspection-integration.test.ts`; EXISTING `tests/background-jobs.test.ts`; NEW `tests/jobs-panel.test.ts`. D0 edits only NEW `odd/evidence/ui05-job-action-surface-map.md`; the parent freezes exact J1/J2 owner/test paths before either writer launches.
- **Steps:** J0 RED ownership, historical-vs-live, no-sleep claim, stale scope, output withholding and clipping; implement renderer; GREEN focused tests. D0 maps Stop and Follow separately. J1 and J2 each add their own RED unauthorized/stale/race cases, minimum adapter, GREEN evidence, and separate commit.
- **Commands:** J0 after creation: `node --import tsx --test tests/job-inspect.test.ts tests/job-inspection-integration.test.ts tests/background-jobs.test.ts tests/jobs-panel.test.ts`. J1/J2 commands are parent-frozen after D0 from the existing owning test family.
- **Expected evidence:** J0 exact SHA/totals and no foreign-job access; D0 exact path/API map; J1/J2 per-action RED/GREEN, ownership and observed-exit evidence, with no model/provider effects.
- **DONE vs FULL:** J0, D0, J1, and J2 have independent DONE criteria. UI-05 FULL remains false until renderer, Stop, Follow, monitors, and canonical cases are evidenced; no action is silently omitted.
- **No-go / stop:** no unowned stop/follow, raw private path/log disclosure, auto-restart, second journal, or writer-derived edit surface.
- **Owner / risk / commit:** bounded J0 renderer writer; parent D0; separate J1/J2 action writers and commits; concurrency/data-integrity review applies to lifecycle actions.

#### R14 — UI-04 Changes module and safe editor open

- **Canonical / specs:** UI-04 Changes; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** present authoritative multi-root Git state and bounded diffs, and open an editor only through an existing public safe surface without writing files.
- **Prerequisites / gates:** retained modal or admitted rail; existing workspace snapshot/diff contracts; editor-open action separately authorized.
- **Read first:** `src/runtime/workspace-snapshot.ts`; `src/runtime/git-diff-preview.ts`; `tests/changes-view-isolation.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/git-diff-preview.ts`; NEW `src/runtime/changes-panel.ts`; EXISTING `tests/changes-view-isolation.test.ts`; EXISTING `tests/git-diff-preview.test.ts`; NEW `tests/changes-panel.test.ts`.
- **Steps:** RED multi-root, HEAD/untracked, binary/large diff, outside-root, stale scope, editor unavailable/cancelled, no write; implement projection; add safe editor-open adapter only if public contract exists; GREEN.
- **Commands after creation:** `node --import tsx --test tests/changes-view-isolation.test.ts tests/git-diff-preview.test.ts tests/changes-panel.test.ts`.
- **Expected evidence:** exact SHA, totals, temporary project-owned fixture roots, zero source writes and zero Git mutation.
- **DONE vs FULL:** DONE is module behavior; UI-04 FULL and actual-host interaction remain open.
- **No-go / stop:** no Git write, index mutation, shell escape, unsafe path, or editor fallback that changes files.
- **Owner / risk / commit:** bounded module writer; security trigger for path/editor handling; one changes module commit.

#### R15 — UI-06 Review module and native review authority

- **Canonical / specs:** UI-06 Review; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** render review-needed state, evidence identity, native review lifecycle, and provider-owned candidate/controller ACK only when that authority source actually reports it; never convert queueing, host notification state, or self-verdict into approval.
- **Prerequisites / gates:** retained modal or admitted rail; existing review projection. R18 is not a dependency: host delivery/display/consumption ACK is a different protocol and authority boundary.
- **Read first:** `src/review/workspace-review-projection.ts`; `tests/ordinary-review-workspace-flow.test.ts`; `tests/review-acceptance.test.ts`.
- **Allowed edits:** EXISTING `src/review/workspace-review-projection.ts`; NEW `src/runtime/review-panel.ts`; EXISTING `tests/ordinary-review-workspace-flow.test.ts`; EXISTING `tests/review-acceptance.test.ts`; NEW `tests/review-panel.test.ts`.
- **Steps:** RED pending/accepted/rejected/unavailable, candidate mismatch, missing native ACK, host ACK not accepted as native ACK, self-audit-only label, control text, and no review invocation on render; implement pure projection; add no action until the provider-owned authority API is explicit; GREEN.
- **Commands after creation:** `node --import tsx --test tests/ordinary-review-workspace-flow.test.ts tests/review-acceptance.test.ts tests/review-panel.test.ts`.
- **Expected evidence:** exact SHA, totals, candidate/controller-bound authority evidence, and no review launch/approval/ACK side effects during render.
- **DONE vs FULL:** DONE is a truthful UI-06 projection; independent review, provider-owned native ACK, and canonical FULL remain separate.
- **No-go / stop:** no self-authored approval, no host-notification ACK substitution, no ACK inference, and no weakening candidate identity.
- **Owner / risk / commit:** bounded module writer; review-authority/security trigger; one projection commit.

#### R16 — T09 accepted maintenance reconciliation

- **Canonical / specs:** T09 decision gate for UI-12 only; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** produce one normative accepted-scope map for UI-12 maintenance work only, preserving the exact renegotiated exclusions: real operating-system browser opening, the inherited advisory, and global pinned-reference parity. HTTPS acquisition is already implemented scope and is not blanket-excluded.
- **Prerequisites / gates:** activated plan; `docs/t09-autopilot-closure-plan.md` and the canonical capability plan registered through `odd/tasks/shell-rea-megabatch.md` are authoritative.
- **Read first:** `docs/t09-autopilot-closure-plan.md`; `odd/tasks/shell-rea-megabatch.md`; `package.json`.
- **Allowed edits:** NEW `odd/evidence/t09-ui12-accepted-scope.md` only.
- **Steps:** enumerate accepted, excluded, unknown, and already-satisfied maintenance clauses; bind each accepted clause only to UI-12; preserve HTTPS acquisition, integrity, rollback, recovery, platform, and exact-SHA requirements; identify only genuinely unresolved human decisions as closed options.
- **Tests / negative cases:** do not reopen real browser opening, the inherited advisory, or global pinned-reference parity as scoped FULL gates; do not invent a transport exclusion; do not authorize provider changes, host installation, dependency updates, or destructive maintenance.
- **Command after creation:** `git diff --check -- odd/evidence/t09-ui12-accepted-scope.md`.
- **Expected evidence:** exact SHA, clause counts, source citations, accepted disposition where still needed, and diff-check exit; documentary only.
- **DONE vs FULL:** DONE unlocks only mapped UI-12 maintenance scope; it has no ownership of UI-09 and creates no canonical UI completion.
- **No-go / stop:** ambiguous maintenance scope or missing required maintenance consent => R20 remains BLOCKED.
- **Owner / risk / commit:** read-only maintenance reconciliation owner; product-scope/installation trigger; one documentation commit.

#### R17 — UI-09 Profiles and fallback

- **Canonical / specs:** UI-09 Profiles/fallback; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** render session/default/repository tabs, frozen session binding, bounded fallback chain, cost/cooldown states, and truthful unknowns without switching providers.
- **Prerequisites / gates:** R09 and R11 only; existing session profile binding remains authoritative. R16/T09 maintenance reconciliation is unrelated and never delays this card.
- **Read first:** `src/runtime/session-profile-binding.ts`; `src/runtime/integration-profile-inspection.ts`; `tests/session-profile-binding.test.ts`.
- **Allowed edits:** EXISTING `src/runtime/session-profile-binding.ts`; NEW `src/runtime/profiles-panel.ts`; EXISTING `tests/profile-scope-inspection.test.ts`; EXISTING `tests/session-profile-binding.test.ts`; NEW `tests/profiles-panel.test.ts`.
- **Steps:** RED scope tabs, frozen binding, chain limit `<=8`, malformed/cyclic chain, cost/cooldown unknown, paid fallback not consented, and no provider call; implement pure projection; GREEN; hand off registration to R21. Paid fallback remains a named consented action gate and is not silently omitted.
- **Commands after creation:** `node --import tsx --test tests/profile-scope-inspection.test.ts tests/session-profile-binding.test.ts tests/profiles-panel.test.ts`.
- **Expected evidence:** exact SHA, totals, no provider/model selection or persisted configuration mutation.
- **DONE vs FULL:** renderer DONE is distinct from the paid-fallback action gate; UI-09 FULL remains false until both canonical behavior and consent evidence are satisfied.
- **No-go / stop:** no automatic paid fallback, no profile mutation, and no invented dependency on maintenance exclusions.
- **Owner / risk / commit:** bounded projection writer; any paid-fallback action requires separate security/consent authorization and commit.

#### R18 — T10-3 host delivery and protocol capability map

- **Canonical / specs:** T10-3 delivery-claim gate and UI-13 protocol discovery; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** independently classify (a) correlation/ownership capabilities needed for informational parent-child queries and (b) host delivery/display/consumption/ACK observability. One class may be supported while the other remains unsupported.
- **Prerequisites / gates:** activated plan; no verifier retry and no second bus/store.
- **Read first:** `src/runtime/agent-notification-journal.ts`; `tests/agent-notification-multiprocess.test.ts`; `tests/agent-notification-restart-process.test.ts`.
- **Allowed edits:** NEW `odd/evidence/t10-3-host-delivery-protocol-map.md` only.
- **Steps:** map identity, ownership, correlation, enqueue, display, delivery, consumption, host ACK, restart and cancellation separately; classify every capability `SUPPORTED`, `PARTIAL`, `UNSUPPORTED`, or `UNKNOWN`; record exact existing paths/APIs; identify which R12/R19 claim or action consumes each capability.
- **Tests / negative cases:** queued/unconfirmed is never shown, consumed, or host-ACKed; restart history is not replay; host ACK is not native review ACK; informational reply is not provider/human consent.
- **Command after creation:** `git diff --check -- odd/evidence/t10-3-host-delivery-protocol-map.md`.
- **Expected evidence:** exact SHA, separate capability matrices, citations, and unresolved gaps; documentary/read-only only.
- **DONE vs FULL:** DONE resolves the capability map, not T10 FULL and not UI-13 implementation.
- **No-go / stop:** missing display/ACK observability blocks only affected display/consumption claims and actions. Missing correlation or ownership blocks the affected query lifecycle; unrelated read-only rendering remains independently viable.
- **Owner / risk / commit:** read-only protocol explorer; concurrency/security/data-integrity triggers; one evidence commit.

#### R19 — UI-13 correlated parent-child and recovery

- **Canonical / specs:** UI-13 parent-child/recovery; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** implement one task/session-bound, single-use correlated informational query lifecycle with timeout, cancellation, restart disposition, and no automatic replay or consent; host display/consumption claims are optional subclaims, not the query's authority basis.
- **Prerequisites / gates:** R07, R11, and R18 `SUPPORTED` for the exact correlation/ownership capabilities consumed by the query; separate security/concurrency/data-integrity review and writer authorization. Unobservable host display ACK does not block the query unless a named outcome explicitly requires that observation.
- **Read first:** `src/runtime/agent-notification-journal.ts`; `src/runtime/agent-store.ts`; `tests/agent-notification-multiprocess.test.ts`.
- **Allowed edits:** exact existing protocol/journal owner paths recorded by R18 and frozen by the parent; NEW `tests/parent-child-query.test.ts`; EXISTING multiprocess/restart tests. No second bus/store and no child-derived authoritative edit surface.
- **Steps:** RED identity mismatch, ownership mismatch, duplicate reply, timeout, cancellation, restart, background restriction, informational-vs-consent distinction, and no replay; implement the minimum correlation lifecycle; GREEN unit and isolated subprocess tests; add display/consumption assertions only when R18 supports them; obtain independent risk review when authorized.
- **Commands after creation:** `node --import tsx --test tests/parent-child-query.test.ts tests/agent-notification-multiprocess.test.ts tests/agent-notification-restart-process.test.ts`.
- **Expected evidence:** exact SHA, RED/GREEN totals, subprocess exits, correlation/ownership and one-use proof, journal transitions actually consumed, and no provider or automatic consent side effects.
- **DONE vs FULL:** query lifecycle DONE is separate from any host display/consumption subclaim; UI-13 FULL requires all canonical interaction and acceptance evidence.
- **No-go / stop:** identity/ownership ambiguity, durable opaque grant, replay, new bus/store, fictional public API, automatic consent, or missing independent risk path => affected query/action BLOCKED. Unobservable host ACK alone does not block unrelated query rendering or correlation behavior.
- **Owner / risk / commit:** protocol writer; mandatory security/concurrency/data-integrity review; one correlation lifecycle commit, with any display/consumption adapter separate.

#### R20 — UI-12 maintenance surface

- **Canonical / specs:** UI-12 maintenance; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** expose only accepted maintenance status/actions with pinned component truth, rollback visibility, and platform-specific diagnostics; no install/update is performed merely for proof.
- **Prerequisites / gates:** FREF, accepted T09 through R16, explicit maintenance authorization, and exact existing owner commands. No dependency/runtime upgrade to obtain UI capability.
- **Read first:** `package.json`; `scripts/pi-support-matrix.mjs`; `odd/tasks/shell-rea-megabatch.md`.
- **Allowed edits:** the parent records exact EXISTING maintenance owner paths from R16 before launch; NEW `src/runtime/maintenance-panel.ts`; NEW `tests/maintenance-panel.test.ts`. No child-derived authoritative surface and no lockfile/config edits unless separately authorized by the accepted canonical task.
- **Steps:** discovery binds status/actions to existing commands; RED pinned version truth, rollback state, unsupported platform, stale manifest, no action-on-render; implement projection first; add only authorized action adapters; GREEN.
- **Commands after creation:** `node --import tsx --test tests/maintenance-panel.test.ts tests/pi-support-matrix.test.ts`.
- **Expected evidence:** exact SHA, totals, pinned `1.2.0` anchors, no install/network/provider side effects during tests.
- **DONE vs FULL:** projection and each accepted maintenance action have separate named DONE criteria and commits; UI-12 FULL remains canonical-gated.
- **No-go / stop:** no forced upgrade, unapproved installer or network operation, lockfile mutation, or reopening excluded scope; authorized HTTPS acquisition remains part of the accepted maintenance contract.
- **Owner / risk / commit:** maintenance owner; installation/security trigger; split display and actions into separate commits.

#### R21 — Shared registration and composition

- **Canonical / specs:** UI-01..UI-13 wiring; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** register completed modules once through existing host surfaces, with deterministic composition and no duplicate store, viewer, command, formatter, or route.
- **Prerequisites / gates:** only green, approved modules enter; R04 supported or explicit retained widget/modal branch; no blocked action is wired.
- **Read first:** `extensions/asen.ts`; `src/runtime/ide-panel.ts`; `tests/extension-runtime-commands.test.ts`.
- **Allowed edits:** EXISTING `extensions/asen.ts`; EXISTING `src/runtime/ide-panel.ts`; EXISTING `tests/extension-runtime-commands.test.ts`; EXISTING `tests/panel-observation-integration.test.ts`; NEW `tests/ui-runtime-composition.test.ts`.
- **Steps:** RED one registration per module, collision, fallback, non-TUI, stale scope, disposal, no action-on-render; wire one module at a time; GREEN after each; run final focused composition set; document omitted BLOCKED modules.
- **Commands after creation:** `node --import tsx --test tests/extension-runtime-commands.test.ts tests/panel-observation-integration.test.ts tests/ui-runtime-composition.test.ts tests/command-catalog.test.ts`.
- **Expected evidence:** exact SHA, per-module and aggregate totals, no model/provider/network effects, command/tool inventory unchanged except explicitly accepted additions.
- **DONE vs FULL:** DONE is shared wiring for admitted modules; no canonical UI ID becomes FULL solely from composition.
- **No-go / stop:** overlapping writer, duplicate route/store/formatter, hidden blocked action, or fallback regression.
- **Owner / risk / commit:** single integration writer; shared-contract risk; one narrowly bounded composition commit, split if several modules would exceed reviewable size.

#### R22 — UI-14 canonical acceptance preflight

- **Canonical / specs:** UI-14 acceptance; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** resolve the existing canonical readiness registry, baseline, parity CLI, tests, UI cases, and actual-host commands into one frozen execution matrix for the stable candidate, including widths `80,120,139,140,160`, supported keyboard/mouse cases, non-TUI modes, security negatives, and the canonical 20 cases/40 source observations. It creates no competing acceptance store or authority.
- **Prerequisites / gates:** R01..R21 complete as applicable; stable candidate SHA; all BLOCKED canonical requirements remain explicit; no acceptance execution yet.
- **Read first:** `registry/parity/shell-asen-case-readiness-v1.json`; `registry/parity/shell-asen-baseline-v1.json`; `scripts/shell-asen-parity.mjs`.
- **Allowed edits:** EXISTING canonical registry/CLI/test paths only when a genuine existing-contract gap is proved: `registry/parity/shell-asen-case-readiness-v1.json`, `registry/parity/shell-asen-baseline-v1.json`, `scripts/shell-asen-parity.mjs`, `tests/shell-asen-parity.test.mjs`. Optional NEW `odd/evidence/ui14-derived-run-manifest.json` is DERIVED/NONAUTHORITATIVE execution bookkeeping only and cannot define cases, schema, acceptance, or FULL.
- **Steps:** use the existing schema and validator to verify C01-C20 and 40 source slots; map canonical UI cases/actions through the coordinator-registered plan to existing harness commands; prove every command exists and its parser accepts the frozen arguments; add a test only if the existing canonical contract has a real uncovered invariant, never to create a parallel validator; freeze the exact candidate SHA and command list in the derived non-authoritative run manifest if needed.
- **Commands checked from source:** `node --test tests/shell-asen-parity.test.mjs`; CI-owned `node scripts/shell-asen-parity.mjs`; `node scripts/t10-real-pi-tui-matrix.mjs 80,120,139,140,160`. The parity CLI is CI-environment-gated; R22 records it but does not run it locally.
- **Expected evidence:** exact SHA, existing-schema case/slot counts, complete UI-case/action-to-command map, parser/source citations, and existing-test totals when later authorized; no invented probe or new acceptance authority.
- **DONE vs FULL:** DONE is a resolved and frozen canonical preflight only; UI-14 and all canonical FULL claims remain false until R23 succeeds.
- **No-go / stop:** unstable SHA, missing action/UI-case mapping, competing schema/store, invented harness, unavailable required tool, or hidden BLOCKED requirement.
- **Owner / risk / commit:** acceptance planner; cross-contract risk; prefer no schema change. Any derived run-manifest commit is evidence-only and explicitly non-authoritative.

#### R23 — UI-14 actual observations, F5, and ECO closure

- **Canonical / specs:** UI-14 acceptance and final F5/ECO evidence; local S1,S2; inherited coordinator S2/S6/S7.
- **Purpose / outcome:** execute only the existing commands frozen by resolved R22 against one stable exact SHA and collect actual-host, three-OS, security, and independent evidence without claiming more than observed.
- **Prerequisites / gates:** R22 resolved and frozen; explicit CI/provider/human authorization where required; long-check background tool available; original unavailable refresh verifier remains unavailable and unclosed.
- **Read first:** NEW `odd/evidence/ui14-derived-run-manifest.json` only if R22 created that DERIVED/NONAUTHORITATIVE file; EXISTING `scripts/shell-asen-parity.mjs`; EXISTING `.github/workflows/ci.yml`.
- **Allowed edits:** evidence/receipt paths explicitly authorized by the acceptance owner; no product correction, new acceptance schema, or canonical-state rewrite mixed into the evidence commit.
- **Steps:** run only candidate-bound focused/security checks and existing actual-host commands frozen by R22; run authorized three-OS workflows; collect canonical 20 cases/40 observations plus required UI evidence; reconcile skips/failures; obtain required independent review; update canonical plans only through their owners.
- **Commands:** exactly the existing commands frozen by resolved R22; no new probe, verifier retry, provider substitution, or locally invented fallback command.
- **Expected evidence:** exact candidate SHA; every command/physical action; exit/stdout/stderr; totals/skips; OS/host/version; unit vs actual-host classification; images/ANSI or machine receipts where required; independent review identity and disposition when actually obtained.
- **DONE vs FULL:** DONE only if every canonical gate passes at the same SHA and canonical owners record it. Otherwise return PARTIAL/BLOCKED with exact missing observations; no FULL by inference.
- **No-go / stop:** missing background tool for a required long check, candidate drift, provider consent absent, any non-listed failure, reference write, self-verdict substitution, competing acceptance state, or missing independent evidence.
- **Owner / risk / commit:** acceptance evidence owner; security/data-integrity/concurrency/installation/shared-contract risks remain separately reviewed; evidence-only commit after immutable candidate execution.

### Activated bounded units

- **R07-U1:** existing Todo formatting only. Allowed edits: `src/runtime/todo-presentation.ts`, `tests/todo-presentation.test.ts`, NEW `docs/asen-todo-presentation.md`; no new store/panel/host API or shared sanitizer edit. Reuse existing terminal helpers. Source gap: code-unit truncation and incomplete control filtering. Preserve ASCII/state/immutability behavior; test terminal-column/grapheme/control cases. Parent owns any shared-consumer differential and final integration checks.
- **R10-U1:** pure truthful guide plus manual help documentation. Allowed edits: NEW `src/runtime/command-guide.ts`, NEW `tests/command-guide.test.ts`, NEW `docs/asen-command-guide.md`; no catalog or entrypoint mutation by this writer. Reuse existing palette/discovery/public-description types. Empty known inventory must not report Unknown command; unavailable inventory stays unavailable; no execution/editor/reload/private metadata. Parent R21-U1 will wire the existing asen-help handler and run its public integration regression after both writers finish.
- **R21-U1/U2 single integration owner:** wire Todo widget to the already-sanitized host content width (keep existing Todo command minimum-width contract/global clipping); wire asen-help to live discovery and the pure guide. Preserve existing Type /name wording and truthful known Jobs inspection safety hints; unavailable inventory must never receive static fallback. Allowed edits: `extensions/asen.ts`, `src/runtime/command-guide.ts`, `tests/command-guide.test.ts`, `tests/command-palette-integration.test.ts`, `tests/job-inspection-integration.test.ts`, NEW `tests/todo-widget-host-width.test.ts`, `docs/asen-command-guide.md`, `docs/asen-todo-presentation.md`; matching isolated copies only. No backend/pin changes. Parent will commit Todo and guide as separate work units; no R19 test in these candidates.
- **R12-A1 (current-owned Agent Stop only):** existing public `AgentRuntime.cancel(id, identity)` and registered `asen_agent_cancel` establish the action contract; R11 owned selection is characterized 17/17 without claiming hierarchy/full UI. Allowed edits: `src/runtime/native-m2-navigator.ts`, `extensions/asen.ts`, NEW `tests/m2-agent-stop.test.ts`, NEW `docs/asen-agent-stop.md`, and matching isolated copies. Preserve full authoritative selected agent ID, scope guards, native keybinding precedence, Close-only narrow mode and existing refresh semantics. Only an explicit UI action may request cancellation; never mark a task/agent complete, roll back edits, follow logs or grant authority. Terminal/missing/stale/off-scope/ambiguous records must not dispatch. Runtime/policy/store/pin changes and provider-backed runs are outside A1. Use the existing guarded runtime, no duplicate facade/store. Resume/Jobs Stop are later separate action units; Follow remains unavailable.
- **R13-A1 (owned live Job Stop only):** existing `BackgroundJobRegistry.stopScoped`/`asen_background_stop` remain authority. Allowed edits: `src/runtime/native-m2-navigator.ts`, `src/runtime/job-inspect.ts` (ephemeral projection/selection binding only), `extensions/asen.ts`, `src/runtime/command-guide.ts`, NEW `tests/m2-job-stop.test.ts`, `tests/job-inspect.test.ts`, `tests/command-guide.test.ts`, `tests/job-inspection-integration.test.ts`, NEW `docs/asen-job-stop.md`, `docs/asen-command-guide.md`, matching isolated copies. Pair original scoped registry snapshots with their frozen metadata objects through per-view/refresh ephemeral identity association; never derive an actionable ID from capped/rendered text. Fresh exact full identity/provenance/state validation must precede existing scoped Stop synchronously. Historical/host-only/unknown/off-scope/terminal/duplicate/stale/truncated-collision selections deny. No runtime/store/policy/API/dependency changes or new authority. Native local s control respects host bindings; metadata/headless stays read-only, guide rendering never acts. Update only affected known Jobs safety hints truthfully for optional native Stop, preserve missing-inventory suppression and logs withheld. Tests use existing injected deferred backgroundExecutor/public tools, no model or process. Keep existing Agents behavior and differential check it after shared M2 changes. Risk2/3/4, separate verification and reviewable action commit.
- **CI-F1 (R21/R23 exact-SHA verification prerequisite):** owner explicitly authorized the minimal CI producer correction. Allowed edits: `.github/workflows/ci.yml`, `tests/ci-specialized-gates.test.ts`, matching isolated copies. Keep exactly three OS jobs and stable artifact/job names; map OS to platform explicitly, upload only its own platform receipt, missing file is an error. Do not delete the historical receipt, weaken the consumer/validator, update action pins/permissions/events, install dependencies or change provider behavior. Observe structural RED/GREEN and existing foreign-SHA rejection regression; delivery/provenance risk 5/2 receives separate verification.
- **R12 fixture correction (owner authorized):** `tests/m2-agent-stop.test.ts` and its isolated copy only, plus narrow task-owned scratch for baseline evidence. Use unique project-owned state and deterministic resource teardown; preserve previous shared state and all production Stop source while diagnosing. Parent executes long/unknown checks in background under the new explicit authorization; original timeout remains failure, never semantic RED. Restore no source file and remove no unproven prior state. Changes outside fixture scope require a demonstrated candidate-caused defect and existing in-scope limits, not implicit extra authority.
- **R19-D0A (transport witness only):** NEW `tests/r19-rpc-free-text-admission.test.ts` plus its isolated test copy; project-owned test scratch only. Reuse existing actual Pi RPC harness and verifier-environment helper; require declared coding-agent1.2.0, no model/tools/credentials/extensions except the synthetic probe. Prove exact input result, cancellation and clean exit with bounded output/watchdogs. No authority policy/pin, production runtime, query journal, parent reply, or consent changes. This is a transport characterization gate, not R19 implementation or trusted producer association; parent must still bind task/session/project from runner context.
- These units have disjoint writes and pure focused checks. No worker runs whole-project typecheck/integration/audit while the other mutates inputs; the parent serializes seam checks and entrypoint integration. Small R07 is delegated because of the active context backstop, not file count; no code/tests split across writers. This activation is not canonical UI completion or old concurrency verification.

## Log

L1 — Local S2 latest human request (verbatim):
«audita el orden recomenaddo y depues haz una odd sobre ello con tareas bien definidas y bien detallado para que se pueda hace facilmente por un modelo IA inferior»

L2 — Planning-only disposition:
- This file is a coordination/runbook over canonical plans registered by `odd/tasks/shell-rea-megabatch.md`; it is not a second task, receipt, review, or completion store.
- All future work remains `PLANNED_NOT_AUTHORIZED`, `READY_AFTER_APPROVAL`, or `BLOCKED` as shown. No feature implementation, test execution, provider action, install, reference write, verifier retry, merge, or publication occurred while creating it.

L3 — Ordering audit evidence:
- Host admission now precedes UI-01 implementation because tracked public surfaces establish widgets/status/selectors/editors and modal overlays, while the current M1 rail explicitly is not a screen sidebar and tracked evidence does not establish public persistent-root, resize, autocomplete, or editor-ownership APIs.
- The package minimum, development anchor, lock, and support-matrix anchors resolve to host `1.2.0`; a transitive TUI `1.5.0` does not change that matrix.
- UI-11 follows UI-01. UI-09 depends only on UI-02+UI-08 and never on T09 maintenance reconciliation. UI-13 depends on UI-02+UI-03 plus the exact correlation/ownership capabilities it consumes, not Changes/Review/Profiles or unrelated host display ACK. UI-14 remains last.

L4 — Reuse and verification audit:
- Existing renderer, navigator, projection, store, journal, Git preview, review, profile, and actual-host harness paths were inspected proportionately. Listed existing tests were path-checked; every proposed path is labeled NEW.
- Actual-Pi harness names selected here already exist: `scripts/t10-real-pi-tui-matrix.mjs`, `scripts/pi-support-matrix.mjs`, and `.github/workflows/ci.yml`. No runnable command was invented for an uncreated probe.
- Base SHA `68fe5ca33cb885f8b687846273c2c9935f767919` receipts remain historical starting evidence only. The original refresh verifier is still unavailable, and the pending memory mirror remains unconfirmed.

L5 — Correction-batch disposition:
- Local Specs are S1/S2; coordinator constraints remain explicitly namespaced as coordinator S2/S6/S7. Canonical mappings use exact `UI-01` through `UI-14` identifiers.
- UI-09 now depends only on UI-02+UI-08. R16 owns T09/UI-12 maintenance reconciliation only and preserves the exact real-browser-opening, inherited-advisory, and global pinned-reference-parity exclusions while retaining implemented HTTPS acquisition scope.
- Native review ACK in R15 is provider-owned candidate/controller authority and never host notification ACK. R18 gates only consumed correlation/ownership capabilities and host delivery/display/consumption claims; unobservable display ACK does not block unrelated informational queries.
- The delivery table is the single normative DAG. R03 is the first unit in the sole integration-owner lane; R04 and R05 may run in parallel after R03, and R06 needs both.
- R22 reuses `registry/parity/shell-asen-case-readiness-v1.json`, `registry/parity/shell-asen-baseline-v1.json`, `scripts/shell-asen-parity.mjs`, and `tests/shell-asen-parity.test.mjs`. Any derived run manifest is non-authoritative. Source inspection confirmed the existing commands `node --test tests/shell-asen-parity.test.mjs`, CI-owned `node scripts/shell-asen-parity.mjs`, and `node scripts/t10-real-pi-tui-matrix.mjs 80,120,139,140,160`; none was executed in this planning correction.
- R07 preserves actual Todo states; R12/R13 use parent-owned discovery and separate action commits; failures preserve partial/unrelated work and authorize no automatic branch revert/reset/rollback.

L6 — Autopilot activation, exact user request:
«implmenta el plan en modo autopiloto»
- Retained supported widget/status/modal surfaces were selected; persistent root split remains UNKNOWN and R02-R06 are not admitted by an overlay substitute.
- R01/R16/R18 documentary results are in `odd/evidence/ui-host-public-capability-matrix.md`, `odd/evidence/t09-ui-accepted-scope.md`, and `odd/evidence/t10-3-host-delivery-protocol-map.md`. Maintenance/FREF/action gates and the original unavailable refresh verifier remain unchanged.

L7 — R07-U1/R10-U1/R21-U1/U2 observed source-unit evidence:
- Todo RED: 3 pass/4 fail; pure GREEN: 28/28 across Todo presentation, Todo tools and IDE panel. Public host-width regression RED then GREEN 1/1 at 48 and 10 columns; host content budget is passed to the existing widget. State semantics, identifiers withheld, unsafe controls, graphemes and immutable inputs are pinned.
- Pure guide RED then GREEN; public guide integration RED 15/21, intermediate 19/21, final GREEN 21/21. Empty guide, live public descriptions, exact unknown, missing/throwing inventory, one leading slash and one inventory read are covered. Existing Type /name wording and known Jobs safety hints remain; unavailable inventory never uses catalog or hint fallback. No rendering execution/model calls were introduced.
- Separate new-unit boundary verification: exit 0, 13/13, no severe candidate-caused findings. This checks the named terminal/privacy risk only; it is not a native verdict, PR45 R4 certification, reference equivalence or replacement of the original unavailable refresh-concurrency proof. R4 remains SELF_AUDIT_ONLY and NOT independent.
- Existing R08/R09 projections passed a combined 73/73 characterization; no duplicate projector/store was added. Owned Agent selection remains a separately checked prerequisite, not UI-02 FULL.
- Conditional old/new differential did not apply: the changed Todo consumers are both in R07; shared responsive helpers and other command parsers/search were unchanged.

L8 — Parent checks and retained exclusions:
- Isolated `npm run typecheck && npm run build`: exit 0. Declared dependencies were reused; no install/copy/upgrade. The cache is local verification infrastructure, not a portable source or acceptance prerequisite; reconstruct dependencies from tracked package/lock contracts in a clean environment.
- Unchanged provenance auditor with an explicit private index: PASS 1190 paths; real index unchanged. The preexisting untracked reference JSON and failed R19 witness were excluded. No exemptions were broadened.
- Root LSP remains unavailable due preexisting missing root dependency/types; it was not retried or claimed clean. Full local suite was not run because it would execute the exhausted R19 witness. Candidate-only CI remains separate exact-SHA evidence.
- Read-only native assessment was unassessable because untracked files need explicit declaration; it created no review verdict/consent/approval. Explicit risk item 2 selected the separate technical verification path, which passed. Assess each subsequent committed work unit against its exact predecessor before any native START; do not review the accumulated branch or unrelated local artifacts.

L9 — R19-D0A exhausted witness:
- See `odd/evidence/r19-rpc-free-text-admission.md`: two failed fixture attempts, CLI1.2.0 exit 0 but no UI frames. Static inspection confirmed the declared executable bin, not a wrong library entry. Free-text transport support remains unproven, not unsupported.
- The failed witness remains untracked outside Todo/guide candidates. No third execution, source authority/pin change, protocol implementation or implicit consent is authorized by these results. Persistent memory failed repository identity binding; file evidence preserves continuation.

L10 — Reviewable commits and next admitted action:
- Todo source unit: `e176b6d32b4cd10f2900d808257c7ea67a11568b` (129 insertions/9 deletions); guide source unit: `522398558f62b75dfb7a1f4ea4d540280446504c` (201/7). Admission evidence: `d517a69bd93f74976230d4ed7396df1563ab645b`. Code/tests/docs travel together; the detailed 23-card runbook is a separate documentation-only slice.
- Native assessment on each exact committed work unit still rejected the undeclared-untracked condition, despite committed-only inputs; it returned no candidate/lineage/verdict. No native approval/consumption is claimed. The explicit terminal/privacy technical path passed; original native/refresh/R4 constraints are not waived.
- Owned Agent inspection/M2 characterization: 17/17, exit 0, project-owned isolated state, no provider calls. Functional refresh regressions were included, but this is NOT the unavailable independent refresh proof. Only bounded owned-selection prerequisites are admitted for A1; hierarchy/thread and UI-02 FULL remain partial.
- Preexisting canonical receipt-document edits and reference JSON remain preserved and unstaged. The failing R19 witness remains untracked. No reset/restore/clean, package publication, merge, install or provider mutation occurred.

L11 — Published exact-candidate CI result (not acceptance):
- Verified source/doc WIP `5c28183b9294a4758ed68059b98cf28483c623fd` was pushed non-force to the existing feature branch. Release Gate `42230657981` succeeded; Phase0/static checks and automated R4 self-audit succeeded. R4 remains SELF_AUDIT_ONLY / NOT independent.
- CI `42230658019` FAILED in strict native-host geometry evidence admission: `Foreign SHA native TUI receipt`; actual `e74780abc23825521ce8e5a5e30e0faca2790820`, expected `5c28183b9294a4758ed68059b98cf28483c623fd`. This is not a demonstrated rendering regression; producer/event/checkout causality is being diagnosed. The validator must continue rejecting foreign receipts; no expected-SHA substitution or weaker admission is authorized.
- Existing acceptance workflow `42230648397` has 14 jobs: 4 success, 10 skipped. Its successful aggregate is not evidence that skipped model-backed or paired cases executed. Pi Free Smoke was skipped. No UI/GLOBAL FULL or new reference parity is admitted.

L12 — R12-A1 bounded functional check failure:
- Writer added task-owned M2 Stop source, guarded entrypoint callback, test and documentation, synchronized to isolated counterparts. The FIRST focused check reached its 30-second harness timeout without assertion totals. There is no semantic RED or GREEN evidence; do not describe a timeout as expected TDD failure.
- Changes remain uncommitted. Do not repeat/restart that test or automatically migrate it to background. Stop/Resume/Jobs dependents remain unverified. A new owner decision is required before further execution; static fixture diagnosis alone does not grant it. R19's separate exhausted bound remains unchanged.

L13 — Static incident diagnosis and decisions required:
- Producer/consumer checkout already pins the PR head. The foreign receipt is not a synthetic merge commit. `t10-real-pi-tui-matrix-win32.json` is tracked and contains historical candidate e74780. Each OS produces only its own fresh file, but CI uploads `t10-real-pi-tui-matrix-*.json`; Linux/macOS therefore also upload the historical Windows file, and merged artifacts admit duplicate platform filenames. Strict validation correctly rejects the stale winner.
- Minimal proposed CI correction: explicit three-entry OS/platform mapping, exact platform-specific upload path, and missing-file error. Preserve the validator and historical receipt; no deletion, foreign-SHA acceptance, SDK upgrade or gate weakening. Proposed edit scope is `.github/workflows/ci.yml` and `tests/ci-specialized-gates.test.ts`; existing foreign-SHA rejection tests remain applicable. Risk items 5/2 require separate bounded verification after implementation.
- No project-owned GitHub Actions skill exists. Reading the registered external profile skill requires explicit per-file owner permission before CI implementation; no external profile file was read by the incident explorer. This is a local harness constraint, not a portable source/build prerequisite.
- R12 static diagnosis found a shared fixed fixture home and absent teardown; full extension activation recovers a durable notification journal, unlike the pure M2 harness. The exact timed-out await remains unknown. Proposed correction is isolated unique fixture state and deterministic resource teardown, preserving all earlier state; no production change or execution is justified by this static diagnosis alone.
- Owner decisions requested: external skill read/minimal CI fix; corrected Stop fixture/new functional verification or continued block; R19 lifecycle correction/transport verification or continued block. None grants native consent, maintenance, deletion, provider execution or a review verdict.

L14 — Explicit interactive owner answers (verbatim):
1. «Autorizar lectura y arreglo mínimo» — the one named external GitHub Actions skill plus minimal producer/test correction; no other external reads granted. Parent read that skill in full. Preserve existing pinned actions, permissions, events and strict validator; no action/dependency upgrade is part of this correction.
2. «Corregir fixture y verificar» — isolate Stop test state, close resources and perform a fresh appropriately bounded functional verification; preserve all previous state. The earlier timeout remains a failure, not RED/GREEN.
3. «Corregir fixture RPC y verificar» — correct SDK1.2 probe activation and verify informational transport only, without model/provider or production/authority changes. Prior two failures remain recorded; no native budget, consent, review or authority limit is reset.
- Resume authorized in-scope incident work automatically. Maximum two disjoint writers; CI and Stop fixture first, then R19 when a slot opens. Test homes/config/cache/data/temp are project-owned and unique. Parent relays long checks via background execution; do not repeat a timeout or weaken checks.

L15 — Corrected fixture results (actual observations):
- Stop semantic baseline negative control: exit 1, immediate assertion that the old navigator lacks `s: stop`; not a timeout. Corrected full fixture: exit 0, 6/6, no skipped/cancelled tests, 19638.7538 ms; current owned scope, denial/single-flight/native-key/narrow/closed behavior and headless read-only cases observed. Original 30-second failure remains recorded. Related suite had taken 45 seconds; the full corrected integration's 90-second bound plus cleanup grace was chosen before its first execution, while owned per-test bounds stayed intact.
- R19 corrected actual pinned CLI transport: exit 0, 1/1, 4510.308 ms; exact input, editor cancellation, handled pre-discovered extension command, zero model/tool/provider-like events and clean child exit. See updated `odd/evidence/r19-rpc-free-text-admission.md`; no production query/authority admission follows from this result.
- CI-F1 target mapping assertion passed, but the combined local check remains 10 pass/1 fail/1 skip because the existing physical-canonical-path fixture failed already during RED. That check was not silently waived or repeated. Separate CI review found two candidate-caused preservation regressions: Linux runner changed from ubuntu-24.04 to latest, and automatic matrix display names changed. One bounded producer/test correction is active; preserve the original runner and explicit OS-only check name before targeted validation/fresh CI.
- Stop shares its navigator with existing Jobs commands; an old/new public-interface differential is required before acceptance. Baseline scratch copies must be parked outside test/build discovery after the differential; source and prior user state are preserved.

L16 — Bounded CI correction and shared-consumer regression:
- CI-F1 source unit `b234130197e66340113fccf728a0f02d94a059f7`: 22 insertions/3 deletions, workflow and focused test only; published non-force to the same feature branch. Original ubuntu-24.04 runner and OS-only check names restored; exactly three mappings, platform-only upload and missing-file error retained. Action pins, refs, permissions/events, artifact naming, retention, consumer, validator and historical receipt are unchanged.
- Strengthened preservation test observed RED then GREEN 2/2. The same separate CI verifier performed targeted readback PASS, 2/2, with no new severe issue. The combined local baseline remains 10 pass/1 fail/1 skip (canonical-path fixture), not waived or rerun. New exact-candidate CI is pending; native assessment still cannot form a candidate because undeclared untracked artifacts are present, and no native approval is claimed.
- Stop Jobs differential: 60 scenarios; 12 unrequested differences, all width 10. The public `asen-job-inspect` empty view and pure active/historical/empty navigator show baseline `Invalid M2 width` versus new `Close`; other widths and captured stdout/stderr match. Active/historical Jobs use the public exported navigator because existing extension DI exposes only empty owned metadata; no live job/provider is started by this fixture.
- One bounded R12 correction restored Jobs' previous narrow-width contract while keeping Agent-only Close fallback/Stop guards; a new preservation test observed RED then GREEN 7/7. This was an actual shared-consumer defect, not an accepted layout change.

L17 — Corrected incident proof and verification handoff:
- Corrected Jobs differential exited 0: all 60 public/pure scenarios equal after the bounded source correction, including widths 10/12/48/80/140 and changed key input. Previous 12-case regression remains documented. Only three proven task-created baseline helpers were moved byte-for-byte to the owned evidence directory outside normal source/test globs; hashes preserved, no deletion/restore or production edits during parking.
- Final selected action/inspection regression: exit 0, 31/31, 41772.5404 ms; isolated full typecheck and build both exit 0. Separate new Stop scope/concurrency verification passed 7/7, exit 0, 21774.393 ms, no severe findings; original unavailable independent refresh proof is still not replaced.
- Exact corrected CI `42241532046` at `b234130197e66340113fccf728a0f02d94a059f7`: success, 19 jobs success/2 skipped. All three original native producer OS jobs, shard coverage and strict geometry attestation succeeded. Release Gate `42241532033` also succeeded. This establishes the artifact-selector correction, not UI/GLOBAL FULL or missing model-backed/paired cases. The known non-green local canonical-path fixture is retained; no validator weakening occurred.
- Test-only RPC transport witness/evidence committed as `1dcb2fec75a7d01c3874d238775d158a3c4752f6` (219 insertions/14 deletions). No production protocol/authority/pin mutation. Native assessment still unassessable on undeclared untracked selection; no native candidate, verdict or approval created. Shared final publication/CI remains separate from this local committed test proof.

L18 — Accepted bounded Agent Stop source unit:
- `7107b8b1b049b0c46c66f92d1c32cbd45222daf4`: 210 insertions/13 deletions across existing navigator/entrypoint and focused tests/docs. Full captured identity, current-scope cancellation, native-key precedence, single-flight/refresh exclusion and generic late-result handling verified. Jobs behavior restored and pinned; no source policy/store/pin change, fake completion, rollback or model execution.
- Risk items 2/3/4 checked by a separate technical agent: PASS7/7, hashes matched, experimental SQLite warning only. This satisfies new-unit functional/risk verification, not independent/native R4 authority or original refresh-concurrency closure.
- Final unchanged provenance audit: PASS1193 with explicit private index, real index unchanged. Existing canonical receipt-document edits and untracked reference JSON remain untouched/unstaged. Native committed-range assessment still failed the untracked declaration condition; no lifecycle START/consent/approval/consumption was manufactured.
- Agent Stop and RPC witness are local committed slices after green scoped checks/typecheck/build. Publish them with this runbook checkpoint and require fresh exact-SHA CI; b234's green CI proves the earlier producer correction only, not these later slices. Overall UI/RDD/reference completion remains partial.

L19 — Authorized work continuity after incident closure:
- Checkpoint `bfd09850330dbd5b6050b90324e61d1958783076` was published non-force with Agent Stop/RPC slices; fresh CI identities are being resolved. Preexisting canonical receipt edits and reference JSON remain untouched; new source work stays local until independently checked.
- R13-A1 is the next dependency-ready retained-surface behavior: live owned Job Stop through existing registry authority, not a new backend. Keep exactly one M2/entrypoint writer because the subsequent Resume UI shares those sources and integration tests; do not parallelize by file count or split code/tests of one behavior.
- Read-only continuation map found reusable existing `asen_agent_continue` business flow but no exported service. Later Resume must extract/reuse that flow (including Todo/link/binder/CAS/rollback) rather than call runtime.continue directly. Local u with native-key precedence is an ordinary reversible convention for that later action; no global keymap or product authority change is granted. Do not implement Resume until Job Stop is checked; no extra human interview is needed for local wording alone.
- Job Stop must use original object/full-snapshot association and fresh registry identity, not capped JobMetadata.id; refresh replaces bindings to prevent removal/ABA collisions. Existing injected deferred executor enables public-tool tests without process/model execution. No source/private SDK, host-only process control, live Follow, log disclosure or new store is admitted.

L20 — Job Stop implementation returned; compatibility verification remains open:
- Latest user continuation (verbatim): «continua». Checkpoint bfd09850330dbd5b6050b90324e61d1958783076 has successful CI 42246697380 and Release Gate 42246697448; Pi Free Smoke skipped. Aggregate success does not convert skipped provider/reference checks into executed proof.
- R13-A1 writer returned source/tests/docs with semantic RED (6 pass/4 fail) then isolated GREEN 16/16. Original-root execution failed before tests with known spawn EFTYPE and was not repeated. Source/cache counterpart hashes matched. These are initial implementation results, not acceptance or native review authority.
- Parent combined isolated check (Job Stop, job inspection integration, Agent Stop, job metadata, guide; test-concurrency=2) exited 1 after 17 seconds. Existing Agent Stop case `registered native Agents view revalidates current ownership and dispatches exact scope through AgentRuntime.cancel` failed with `runtime cancellation was not observed` after 138 ms. No conclusion yet whether source regression or fixture observation race; typecheck/build after the failed && chain did not execute. Do not mark R13 done, infer totals, or silently retry. Read-only diagnosis mw582h7g-1-uudx is active; old/new Agents differential and separate scoped risk verification remain pending.
- Direct native ASSESS with explicit risk item 2 again returned unassessable (untracked declaration), candidate null and no verdict/consent/approval. Its risk-gated plan requires separate technical verification; that cannot replace the unavailable original refresh verifier or native/R4/reference authority. Persistent memory context/search are unavailable; this file remains the continuation record.
- Future R19 read-only mapping found exact v1 journal parsing that rejects additional keys/states. Do not silently extend/migrate that journal or add a competing store. Production query association is still under technical investigation; transport PASS alone grants none of its authority.

L21 — Separate checks and diagnostic preparation:
- First standalone isolated typecheck/build completed successfully (exit 0); logs are `.cache/r13-job-stop/typed-build.stdout.log` and `.cache/r13-job-stop/typed-build.stderr.log`. This does not erase the earlier combined test failure.
- Read-only Agent Stop diagnosis found the existing 100-setImmediate-turn observation loop can exhaust while asynchronous canonicalization is still pending. No production regression is proven. Before any fixture correction, require the old/new public Agents differential; a bounded deferred observation may then replace spin counting while retaining existing 1000-ms await/4000-ms test bounds and every assertion.
- Differential preparation first failed before any functional case: MSYS tar rejected Windows backslash relative paths. The task-owned baseline directory was inspected empty; one path correction resumed the existing archive rather than creating another. Extraction then succeeded, but junction creation failed EISDIR with no destination created; it was not retried and no dependencies were copied/installed.
- The permitted fallback composes only the four exact historical changed modules beside existing isolated counterparts after verifying all application source/cache bytes and the unchanged-module scope. Imports alone are redirected to the historical four-module set; SDK code is untouched. Exact task-created helper paths/hashes are recorded and parked outside source/build globs after use. Functional differential results remain pending; preparation errors are not semantic RED or compatibility proof.
- Separate new-unit technical verifier mw58q92z-2-mu5n checks R13 identity, stale/recovered/ABA/collision rejection, concurrency and truthful messages. This is not native review, human approval, R4 independence or replacement refresh proof. Job Stop remains uncommitted/unaccepted.

L22 — Bounded R13-A1 technical completion and reviewable source slice:
- Source unit `dc804359f1d7936e3a67897a10b88726ac7c6544` contains 11 source/test/doc files, 214 insertions/34 deletions (248 authored changed lines). Its exact predecessor is `bfd09850330dbd5b6050b90324e61d1958783076`. This single work-unit range is the review boundary; the accumulated 1591-commit feature branch is NOT a review candidate. This evidence-only checkpoint is a separate documentation slice; no history rewrite, reset, squash, merge or publication is authorized by that boundary.
- The public old/new Agents differential passed all 43 scenarios, exit 0, against that exact predecessor: queued/running/terminal/stale/closed/native-key collision, widths 1/10/12/48/90/140, Agent help and late-close behavior. Captured stdout/stderr/exit and exact cancellation scope matched. All application source/cache bytes were verified; four exact task-created historical helpers were SHA-checked and parked outside compilation/test globs. Evidence: `.cache/r13-agent-differential/{baseline.jsonl,candidate.jsonl,result.json,helper-manifest.json}`. Later runtime correction changed only Jobs-private closing text; Agents-reachable code was unchanged.
- Initial separate verification was BLOCKED: 15/16, exit 1, and a Major false post-action scope-drift claim. The reported abort observation was inferred incorrectly: the production Jobs handler catches errors from injected `ui.custom`, so an earlier fixture assertion/turn-poll failure could be swallowed before a later running-state assertion. Registry state-before-abort ordering was not changed. Corrected fixtures preserve errors outside that catch and await actual abort/render-request events, not loop turns; this is not a display/consumption ACK. Existing Agent test bounds (1000-ms await/4000-ms test) and Job 10-second test bound and public state/count assertions remain intact.
- New scope-drift regression observed semantic RED on the exact `ASEN job scope changed; no action performed.` text (exit 1; typecheck passed). The bounded correction uses neutral future-action wording, adds the public stopped-state/exact-one-abort drift test, and documents that earlier Stop requests are not undone. Existing Agent runtime and Agent drift text remain unchanged. Equivalent standard `node:fs.promises` test imports resolved changed-test import diagnostics without dependency installation or type suppression.
- Corrected combined check: exit 0, 31/31, zero failed/cancelled/skipped, 12250.6385 ms; full isolated typecheck/build both exit 0. Logs: `.cache/r13-job-stop/corrected-green.{stdout,stderr}.log`; semantic RED logs: `drift-red.{stdout,stderr}.log`. Original failures and preparation errors remain recorded, not waived or relabeled.
- Targeted separate technical validation mw59f11a-4-027k: PASS 17/17, exit 0, 9706.147 ms, no skipped/cancelled tests; all 11/11 root/cache SHA-256 pairs matched. Risk items 2/3/4 accepted for the bounded R13-A1 action gate only. Experimental SQLite warning only. This is NOT native/human/R4/reference approval or original refresh-proof replacement. R4 remains SELF_AUDIT_ONLY / NOT independent.
- Unchanged provenance auditor: PASS 1195 using a fresh private index, real index SHA unchanged. Original root SDK/type diagnostics remain unresolved; no install or suppression was used. The isolated active LSP probe reported non-error auxiliary findings (233 total), with zero errors in its subsequent cached severity view; do not claim the entire repository or all style findings clean. Exact isolated compiler/build checks above are the type/build evidence.
- Direct committed-range native ASSESS again returned unassessable because untracked scope needs declaration; candidate null, no START/consent/verdict/approval/consumption. Do not fabricate reviewDue or authority. Memory discovery/bugfix saves failed repository identity binding; this file remains the continuation record.
- R13-A1 source is locally committed and technically verified; UI-05, Follow/logs, native/reference/global FULL remain partial/blocked. No push of this new slice has occurred. Its exact-SHA remote checks require explicit publishing authorization under current host policy; original canonical document edits and reference JSON remain preserved.

L23 — Authorized checkpoint publication continuation:
- Latest human continuation (verbatim): «continua». The live primary host now reports YOLO standing permission ON for ordinary already-scoped non-force publication. It supplies the normal branch-push confirmation, not native/provider consent, maintenance, destructive authority, package publication, merge or FULL acceptance.
- Confirmed existing destination: origin, `github.com/asenbanskaliev/ASEN.git`, branch `feat/t12-integrated-acceptance-merge`. Publish only the verified Job Stop source slice plus this evidence checkpoint, then observe exact-checkpoint CI/Release Gate. No force push, history rewrite or PR/merge is part of this continuation.
- Current Git status preserves only the two original canonical document modifications, this task-owned runbook, and the original untracked reference JSON. Active Engram project verification again failed repository identity binding; do not manually archive the compacted summary or claim a memory mirror. Portable continuation stays in this tracked file.
