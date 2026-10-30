# Isolated child-exit repair candidate
Prepare a mock-tested runtime repair copy; do not change the installed runtime or recover the current child.
Owner: current ASEN session. Workspace: `.cache/runtime-child-exit-repair-IrxOhX/`. T10-A4 remains unadmitted.

## Specs

1. **S1 — Selected outcome, verbatim:** "Preparar un parche en una copia aislada".
2. **S2 — Accepted preview, verbatim:** "Preparar una corrección candidata y pruebas con procesos simulados dentro de `.cache/runtime-child-exit-repair-*` en ASEN."
3. **S3 — Accepted preview, verbatim:** "Objetivo: respetar el cierre ordenado del SDK y conservar la confirmación real de salida. No basta con aumentar el timeout."
4. **S4 — Accepted limits, verbatim:** "Sin tocar la instalación, reiniciar Pi ni liberar la cuarentena actual." "Sin instalación, procesos Pi reales, proveedores, commits, push ni CI. El parche no demuestra que el hijo actual haya terminado."

## Tasks

- [x] **T1 | S1-S4 | route: context-backstop writer, isolated baseline/mocks, parent-observed causal RED | commit: prohibited** — DONE LOCAL L6: byte-bound baseline and mocks prepared; job-4 observed exact shutdown-contract RED, exit1/1671ms/no timeout/eight hashes unchanged; no candidate logic changed.
- [ ] **T2 | S1-S4 | route: same bounded writer after RED, parent-controlled GREEN/differential | commit: prohibited** — IN PROGRESS L6: implement minimum orderly-success shutdown correction and compatibility fixtures; preserve exit-gated ownership; prepare parent GREEN/differential commands, not yet executed.
- [ ] **T3 | S1-S4 | route: named Risk3/4 independent verification of exact copy/receipts, parent integrity readback | commit: prohibited** — Package a bounded patch and scoped report with provenance and explicit live/Windows/installation limits. Never admit T10-A4 or release live capacity from mock evidence.

## Log

### L1 — Original selected request and preview, verbatim

"Preparar un parche en una copia aislada"

"Sin tocar la instalación, reiniciar Pi ni liberar la cuarentena actual."

"Preparar una corrección candidata y pruebas con procesos simulados dentro de `.cache/runtime-child-exit-repair-*` en ASEN.

Objetivo: respetar el cierre ordenado del SDK y conservar la confirmación real de salida. No basta con aumentar el timeout.

Sin instalación, procesos Pi reales, proveedores, commits, push ni CI. El parche no demuestra que el hijo actual haya terminado."

### L2 — Read-only baseline and incident evidence

Parent incident authority: `odd/tasks/pi-capability-completion.md` L469-L471. Prior permission allows reading related published code/docs only under `C:/Users/asen.banskaliev/.pi/agent/npm/node_modules/reference-pi` and `C:/Users/asen.banskaliev/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent`, not private sessions, credentials/config or hoisted dependencies outside both roots. Installed static metadata inspected by mapper reports reference-pi4.3.0 and Pi Coding Agent1.4.0; loaded live versions and actual child disposition are unknown.

Static `reference-pi/lib/agents-runner.ts` 906-911/952-1025 signals after AGENT_SETTLED, escalates after250ms, and quarantines when child exit is unconfirmed after1000ms. Windows has no process-group probe. Late proven exit releases retained capacity/claims/scratch; PASS text, stdin closure and signal delivery are not exit proof. SDK RPC docs91-95 describe closing stdin for runtime disposal before exit. This suggests a shutdown-contract mismatch but does not prove the live cause. The current failed verifier and its old quarantine are not this candidate's test fixtures. The misleading terminal-cancel report is known and must not be used as recovery; do not grow this unit into a UI/API rewrite.

### L3 — Implementation and evidence boundaries

One writer; no simultaneous reader/writer mutations. Parent owns this document, the prior feature checkpoint and visible todo. Writer edits only the fresh owned `.cache/runtime-child-exit-repair-IrxOhX/**` subtree; original installed packages and ASEN source/tests/dependencies stay untouched. Capture byte hashes and minimal required local-module provenance before editing the candidate; keep the copied original immutable. Do not copy whole dependency trees or create links reaching outside allowed targets.

Test through public runner APIs and injectable child/stdin/stdout/scheduler/process-control doubles, not private live-map storage. Capture every requested observable: EOF request vs signal order, result/status/outputs, and held/released queue/claim resources before/after explicit mocked exit. Successful stdin closure alone must not finalize. Preserve applicable abort/error/deadline and unconfirmed-exit behavior; a late mocked exit may release resources, never a timer assumption. Mocks do not prove live Windows process termination.

Before each executable test import, use project-local HOME/USERPROFILE, temp, application/XDG/config/data roots and an OS-bootstrap environment allowlist with no provider credentials or arbitrary configuration overrides. Do not start real Pi, providers, IPC brokers, host probes, network services or installed-package scripts. Use existing trusted project tooling only; no installs, ACL changes, process inspection/kill, session restart or native review recovery.

First writer phase prepares baseline/mocks and one parent-run isolated RED command only; no production/candidate logic change until a real contract assertion fails. Module/fixture/import/tooling failure and timeout are not RED. Unknown-duration checks use parent background execution with an initial180s ceiling, no timeout retry. Existing ASEN types/differential/regression must not be repeated. Preserve all raw outputs/exit codes and failed attempts without normalization. After GREEN, compare original/candidate observable effects for shared termination paths; no committed test reads Git history. Named concurrency Risk4 and consumed lifecycle Risk3 require one independent verifier of this exact copy, not a rerun of the unavailable T10 verifier. No patch installation, publication, commits or delivery authority is granted.

### L4 — Start preparation worker, no RED or logic change yet

Canonical document was created with three tasks and its RefMem mirror acknowledged as observation18301 before the first writer source edit. The first writer invocation was rejected before queueing because explanatory prose followed the Allowed edit surfaces block without a new heading. The exact task was resubmitted unchanged except for that canonical heading; only worker mvp7rpja-9-kmve was started. This is an admission-format correction, not a retry of the failed T10 verifier or a test execution.

Worker phase T1 prepares only the owned copy, provenance, mocks and isolated parent RED command. No candidate behavior fix is permitted until parent observes an actual contract assertion failure. No tests or runtime processes have been executed for this new repair candidate at this checkpoint. Parent will continue the authorized RED/GREEN steps on the pushed preparation result, without requesting routine transition approval. Existing installed packages, live quarantine and T10-A4 admission remain unchanged.

### L5 — Observe prepared baseline and start the first RED execution

Worker mvp7rpja-9-kmve completed preparation only. Baseline and candidate published local-module closures are byte-identical; both agents-runner.ts hashes are e3e8bce44d007d8a2dc09b8c421953bb263740a97e00e0b8f1cb1ae9d2ca7ee5. Provenance and explicit shared SDK/TUI substitutes, process double, public AgentRunner.run event-stream contract and original unexecuted launcher/guard are retained. Worker ran only bounded syntax/hash/equality preflights, not tests. T1 is not complete without actual causal RED.

Parent reviewed the launcher/preload/test and prepared derived run-red-parent.mjs plus test/preload-parent.mjs BEFORE first execution: complete XDG cache/state/runtime roots, physical effective-home/temp checks, environment receipt, existing project TSX loader with Windows file URLs and direct node:test execution in one owned test process. No candidate/test assertion/provenance/baseline logic was changed; original prepared harness files remain unexecuted. Receipts use red-parent.* names to avoid confusing them with the prepared originals. This is setup, not a retry or rewritten test evidence.

Job-4 now runs node .cache/runtime-child-exit-repair-IrxOhX/run-red-parent.mjs once, 180000ms ceiling; no RED/GREEN claimed yet. Native ASSESS reports nativeRisk unassessable for the root's untracked cache; explicit concurrency item4 escalation yields high and requires self-verification plus one independent verifier after the completed candidate. No reviewDue/continuation was returned and none is invented. Installed package/source ownership and old quarantine stay unchanged; no live Pi/provider test process, install or native review transaction was started.

### L6 — Observe causal RED and begin bounded candidate correction

Job-4 completed exit1 in1671ms, signalnull, timedOutfalse, spawnErrornull, stderr empty. Node test summary zero pass/one failure/zero skips. The exact public-interface assertion compares expected order [stdin:eof] with actual [signal:SIGTERM] after valid stored answer plus agent_settled. All other before-exit fields match: running first task, stored valid final answer, queued second task, one spawn, no finishes, overlapping writer claim held. Explicit mocked exit produced completed status, unchanged result, queued witness activation and released writer claim in captured JSON; the later afterExit assertion is not counted as passed because the preceding order assertion failed. GREEN must execute both assertions unchanged.

Eight watched hashes remained identical, including baseline/candidate agents-runner.ts e3e8bce44d007d8a2dc09b8c421953bb263740a97e00e0b8f1cb1ae9d2ca7ee5, original testc223df77…3370d, double88842385…5d672 and provenance5670ad33…892c1. red-parent.environment.json confirms effective and configured home/temp/application/XDG/SDK-agent roots under owned sandbox before imports. Raw stdout/stderr/receipt/environment are retained under receipts/red-parent.*; no retry, normalization or overwritten evidence.

T1's requested outcome (baseline plus actual causal failure) is observed; this is not a claim that the uncorrected implementation passes. T2 now continues in the same writer context. Preserve baseline, original RED test/double, shared substitutes, original provenance and all executed RED harness/receipts. Only candidate agents-runner.ts may change behavior. New compatibility helpers and separate GREEN/differential launchers/receipts may be added. Existing cancel/abort/error/deadline/unconfirmed/late-exit paths must retain their public effects; deliberate orderly-success changes must not make stdin EOF or signal delivery count as exit proof. No installed timeout is changed; do not solve this merely by enlarging the copied constant or rewrite the known terminal-cancel UI issue.

Parent will run prepared new checks once after review, with the same isolated roots and exact raw stdout/stderr/exit evidence. ASEN's earlier successful checks and unavailable verifier are not rerun. Candidate correction and controlled checks do not establish live Windows behavior, loaded version, release of the old child or T10-A4 admission.
