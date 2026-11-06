# Shell REA executable megabatch
Implement evidence-backed ASEN gaps; preserve canonical capability and Shell v4.6.0 acceptance plans.
Branch: feat/t12-integrated-acceptance-merge. Delivery: ask-on-risk, local reviewable slices; initial slice forecast <=350 authored lines. Runner: existing isolated Node test runner; Beam only in GitHub Actions.

## Specs
S1. «Comprueba que REA está conectado mediante MCP y que el skill reverse-engineer-anything está disponible.»
S2. «Trabaja sobre `D:\Asen` y utiliza `D:\gentle-shell` exclusivamente como referencia de lectura.»
S3. «Investiga inicialmente la arquitectura de Gentle Shell, especialmente la barra lateral, los agentes, sus comunicaciones, los trabajos en segundo plano y la recuperación de sesiones.»
S4. «Utiliza REA para obtener evidencias de análisis y lectura directa del código fuente para comprobar los detalles de implementación. Si REA no puede analizar alguna parte, registra la limitación y continúa investigando mediante las herramientas de Pi.»
S5. «Compara los resultados con el código y los planes ODD actuales de ASEN. Identifica las diferencias pendientes, crea una megatanda ejecutable y empieza a implementarla.»
S6. «No uses Ollama Beam ni modelos Ollama en este ordenador. Utiliza el proveedor y modelo actualmente seleccionados en Pi. Las pruebas con Beam deben ejecutarse exclusivamente en GitHub Actions.»
S7. «No modifiques Gentle Shell, no hagas merge a main y no declares FULL sin evidencias reales.»

## Tasks
- T1 [S1-S7] route=delegated explorer; DONE; commit=22b89abe12d2bbba63612fd6a290307f4787c811. Reconcile REA/source evidence and publish dependency-ordered batch below, without duplicating existing implementations.
- T2 [S2,S5-S7] route=delegated writer (runtime context backstop); DONE; commit=22b89abe12d2bbba63612fd6a290307f4787c811. Native work panel widths1–11 Close-only fallback and inert hidden controls; widths12/13 internal-budget fix. Meaningful RED12 passed/2 failed, GREEN14/14; isolated typecheck passed.
- T4 [S5-S7] route=parent tooling recovery; DONE; commit=22b89abe12d2bbba63612fd6a290307f4787c811 (evidence only; dependency output ignored). Owner authorized isolated lockfile installation under .cache/shell-rea-verification with «sI». Preserve current node_modules and tracked lockfile; no provider changes.
- T3 [S1-S7] route=parent integration; DONE; commit=22b89abe12d2bbba63612fd6a290307f4787c811. Assess actual diff, spot-check renderer suite, typecheck/build when applicable, update canonical log, and commit the bounded initial work unit. Preserve missing host/three-OS/parity evidence.

## Log
L1 — Original request (verbatim):
Comprueba que REA está conectado mediante MCP y que el skill reverse-engineer-anything está disponible.

Trabaja sobre `D:\Asen` y utiliza `D:\gentle-shell` exclusivamente como referencia de lectura.

Investiga inicialmente la arquitectura de Gentle Shell, especialmente la barra lateral, los agentes, sus comunicaciones, los trabajos en segundo plano y la recuperación de sesiones.

Utiliza REA para obtener evidencias de análisis y lectura directa del código fuente para comprobar los detalles de implementación. Si REA no puede analizar alguna parte, registra la limitación y continúa investigando mediante las herramientas de Pi.

Compara los resultados con el código y los planes ODD actuales de ASEN. Identifica las diferencias pendientes, crea una megatanda ejecutable y empieza a implementarla.

No uses Ollama Beam ni modelos Ollama en este ordenador. Utiliza el proveedor y modelo actualmente seleccionados en Pi. Las pruebas con Beam deben ejecutarse exclusivamente en GitHub Actions.

No modifiques Gentle Shell, no hagas merge a main y no declares FULL sin evidencias reales.

L2 — Execution constraints and provenance:
- Current Pi provider/model: openai-codex / gpt-6.1-sol, observed PI_PROVIDER/PI_MODEL. Do not select replacement or Ollama models, run local Beam, acquire provider credits, or publish.
- Preexisting untracked `rea-gentle-shell.json` is not task-owned and must remain untouched/uncommitted.
- Engram context/search dispatch unavailable: HTTP 404, missing engram.pi-http-runtime/v1. Mirror `odd/shell-rea-megabatch/tasks` pending; no confirmed memory persistence. Do not repair machine configuration under this task.
- REA MCP `binary_session` responded: rea-agents 6.7.0, Pi client 1.5.0, protocol 2025-11-25, advertised 207 tools. Installed reverse-engineer-anything skill version 42 read in full.
- REA manifest observation parent `ev_495c9c1e3c4edebd753c15f355fb04033caa22f901d9451cce7a6358d6120bda`: package.json only; no implementation behavior inferred.
- REA selected-source parent `ev_2a12fe9a4bf55d47bc7361d8a6c47d0f1e19115f6568b2edbff0b8eb550d9e0c`; summary `ev_f08192ab46fdb0b6cdef0327d133fe87b8753e2722d84a707929cdf551f4a8d5`. Input inventory SHA-256 `a60dc9260dc2649110fbcf61bf0694f6860028b96784b6a029ff104cbfd705b5`. Five selected files: bin/gentle-shell.mjs, extensions/gentle-shell.ts, extensions/gentle-agents.ts, extensions/gentle-ai.ts, lib/shell-bar.ts. Five parsed, zero parse failures, 1334 static findings. 929 files unselected; semantic graph truncated at 20,000 nodes/file and 100,000 total. This directory inventory digest is NOT a Git tree hash or a runtime receipt.
- Retained facts view `ev_f6f5830074b92b410c72e84e99f18569f9c0ca18dfa001740c1d88e9d02d14e0` observes exported `renderShellSidebarBar` at lib/shell-bar.ts:230–232 and `shellEnabled` at :125–129. Static unresolved Node builtin imports do not establish absence or runtime failure. Page 8/83; not exhaustive.
- Canonical plans: `odd/tasks/pi-capability-completion.md` latest 2026-11-05 journal-home fixture correction; exact-SHA three-OS/shard proof pending. `odd/tasks/gentle-shell-v4.6.0-paridad-ui-odd.md` R4-04 supersedes historical 60-slot comparison: 20 cases/40 observations, Shell SHA 1f74e9e24473e7e121a96b1680444ae0196d3009. Keep globalFull:false, EF 8/28, UI 0/14. Stale remote-continuation summaries cannot override latest canonical log.

L3 — Executable follow-up queue (planning, not completed acceptance or authorization for destructive/provider work):
1. First slice T2: native-work-panel narrow-width fallback, existing renderer/store reuse; no new UI/store.
2. M2 scoped refresh: reuse native-m2-navigator and scoped existing stores; distinguish snapshots from live state; preserve selected entity and ownership after refresh. Establish RED for stale data, then GREEN; no invented live parity. Separate bounded work unit after reading existing public commands/tests.
3. Persistent fullscreen rail: reuse six existing section projections; feature-detect Pi UI surface and retain modal/headless fallback. Parent owns extensions/asen.ts integration; isolate pure renderer changes from entrypoint integration. Add geometry/cache/selection tests before implementation; actual Pi visual receipts remain separate. Do not implement another modal panel.
4. Correlated child-to-parent queries: security design gate before source changes. Define task/session-bound request identity, single-use reply, timeout/cancellation/restart disposition, background restrictions, and distinction between informational answer and provider/human consent. Reuse agent protocol/store; independent risk verification required. No automatic consent or durable parallel task store.
5. Jobs/recovery: compare actual notification/delivery journals and execution ownership with Shell; preserve current terminal finality, retry authorization and private-path guarantees. Add only reproduced gaps, with concurrency/data-integrity risk gate and isolated subprocess tests.
6. Acceptance: use current Shell/ASEN C01–C20 manifest, actual same-input Pi host observations and exact-SHA OS receipts. Beam execution exclusively in GitHub Actions. Do not alter completion counters from static analysis or focused tests.
This request starts the batch; T1–T3 are the initial executable slice, not a claim that follow-up queue items are implemented. Re-estimate authored lines and delivery shape before any later oversized work unit; no push/PR/merge permission is inferred.

L4 — Source comparison from completed read-only explorer mw4oumq7-1-m0m1:
- Shell sidebar: lib/shell-sidebar.ts:5–33,59–100 shares terminal components; lib/shell-sidebar-layout.ts:9,271–312 uses breakpoint 140 and digest cache. Parent spot-read lib/shell-bar.ts:220–232 confirms structured sidebar fields delegate to renderShellStatusSections, consistent with retained REA export observation.
- Shell agents: lib/agents-runner.ts:333–343 starts separate Pi RPC children; :491–498 binds replies to task, query and parent session; extensions/gentle-agents.ts:35–48 composes child/parent and cross-session transports.
- Shell jobs: lib/background-jobs.ts:43–50,150–151,204–208 bounds output/concurrency and records observed exit; extensions/gentle-agents.ts:2988–3024 stops jobs, monitors and agents during shutdown.
- Shell recovery: extensions/gentle-agents.ts:1784–1808,2937–2957 restores completed history for the exact session and clears queues, not automatic work restart; extensions/resume-hint.ts:20–57 protects launcher handoff.
- ASEN already has six-section modal and Agents/Jobs inspectors at extensions/asen.ts:950–1040; do not recreate them. native-m2-navigator.ts:34–55 captures snapshot rows, not live refresh. git-diff-preview.ts:12–16,24–65 provides bounded read-only Git preview, not an editor.
- ASEN recovery: extensions/asen.ts:241–255,436–443 uses journal/enqueue without visible acknowledgement, and recovers interruptions without automatic replay; src/session/pi-resume.ts:8–12 validates canonical Pi session identity/file. session-directory.ts:8–33 one-use metadata consent is not a correlated parent-child query channel.
- CodeGraph failed in explorer; read/find/grep source fallback supplied the locations above. Source observations do not establish runtime parity.
- Historical initial worker test command exited 1 before assertions: esbuild spawn EFTYPE, zero passing assertions and three file-level failures. npm run typecheck exited 1 because tsc shim was not recognized. git diff --check passed. Draft tests include widths1–11,12/13/14,139/140, Unicode, hidden controls, host keybindings, stale scope and immutable snapshot. Worker also identified existing content-budget minimum mismatch at widths12/13; no source fix applied.
- Historical parent tooling diagnosis observed Windows x64 Node24.14.0, npm11.9.0; missing node_modules/.bin/tsc. Direct existing compiler invocation `node node_modules/typescript/bin/tsc --noEmit` failed MODULE_NOT_FOUND for ../lib/tsc.js (job-1 exit1). Build was not reached. This proves an incomplete local compiler package, not a behavior regression. No dependency acquisition or config changes occurred; no further runner attempts.
- Native assess returned nativeRisk=unassessable, risk=medium, no independent verifier. Native refused ambiguous untracked selection; preexisting rea-gentle-shell.json remains excluded from ownership. No review START, approval or acknowledgement occurred. Actual missing assertion/typecheck/build proof remains blocking regardless of assessment.
- Initial stop requested owner authorization for isolated lockfile installation. Owner reply (verbatim): «sI». Authorization applies to `npm ci` in new D:/Asen/.cache/shell-rea-verification only; leave current node_modules, source/lockfile and unrelated edits untouched. Meaningful checks are still required before implementation completion/commit or acceptance promotion. Target observed absent before preparation. Isolated npm ci completed with exit0 (129 packages); existing compiler and esbuild version probes passed (TypeScript5.9.3/esbuild0.28.2). Copied1177 current tracked working files, excluding already-copied manifests; original dependency tree untouched. One deprecation warning for node-domexception, no install failure.
- T2 delegated to mw4p2bob-2-ehi9 after context backstop. No parallel writer on shared entrypoint. Engram mirror remains unavailable.
- Worker mw4p2bob-2-ehi9 stopped before edits/tests because required build emits dist outside its allowed surfaces. Parent kept surfaces unchanged and moved build to T3 integration. Resumed bounded writer as mw4p6l0o-3-ib87; subsequently returned PARTIAL with only tests/native-work-panel.test.ts changed. At that checkpoint production renderer remained unchanged; no meaningful RED/GREEN.

L5 — Completed initial renderer implementation and integration checks (supersedes historical tooling blockers above):
- Resumed writer mw4py0o9-4-duo3 used the owner-authorized isolated dependency tree. Behavioral RED exited1:12 passed/2 failed (`Invalid ASEN panel width`). GREEN exited0:14/14. One intermediate expected-title assertion was corrected for intentional truncation; no product check was weakened.
- `src/runtime/native-work-panel.ts` now fits widths1–11 with `q`/`Close` only, ignores hidden navigation/fold/detail controls after cancellation and stale-scope checks, and preserves state across shrink/grow. Width12/13 uses minimum12 internal projection budget before final visible clipping. Width>=14 keeps the previous path. Shared projection helpers and host entrypoints unchanged; no cross-command old/new differential applies.
- Parent re-ran the focused three-file suite:14 passed/0 failed/0 skipped, exit0. Parent isolated `npm run typecheck && npm run build` completed exit0 (job-3). Root source and test hashes match the tested isolated copies; package.json and package-lock.json hashes also match their original isolated manifest copies.
- `npm run audit:ef-plan` passed with28 total/8 verified/15 partial/5 blocked/globalFull:false; structural traceability only. `git diff --check` passed. No full npm test, Beam, provider call, actual Pi visual receipt,40-observation comparison, or three-OS CI was run for this slice.
- Root LSP probe is NOT clean: native-work-panel.ts timed out and test file reported missing @earendil-works/pi-tui against the known broken original dependencies. No retry or original dependency repair performed. Successful isolated compiler check is separate evidence, not an LSP success claim.
- Post-writer native assess remained unassessable because untracked scope was not declared; fallback plan accepts writer self-verification, no separate verifier. No reviewDue=true continuation, native START, approval or ACK was obtained. Committed-range assessment after22b89abe against21b41e40b17dd6e03c7f125bff75739da302e76f returned the SAME unassessable untracked-scope error; the attempted committed-range selector did not resolve it. Native assessment/review remains unavailable for this slice, not approved. No additional native capture or retry was attempted.
- Risk: none. Renderer-local geometry/input-state change; no shared options/parser/helper, security permission, stored-data, concurrency, dependency/lockfile, installation or delivery contract changed. Cancellation and stale-scope ordering retained. Rollback boundary is native-work-panel.ts plus its added regression tests; no host integration or stores changed. Runtime visual boundary remains unproven, not FULL.
- Initial work-unit commit22b89abe12d2bbba63612fd6a290307f4787c811 contains149 additions/5 deletions across4 files (154 authored lines). Local feature branch only. This completion-evidence update records its identity separately; no self-referential commit hash is claimed.
- All initial execution tasks T1–T4 complete with the limits above. Follow-up queue remains planning, not implemented: scoped refresh, persistent rail, query design, jobs/recovery gaps and actual acceptance. No publishing/merge permission inferred. Engram mirror still unavailable; original dependencies and preexisting rea-gentle-shell.json preserved.
