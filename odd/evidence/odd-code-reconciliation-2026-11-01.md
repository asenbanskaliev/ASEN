# ASEN ODD-code reconciliation - executed batch 2026-11-01

Baseline: PR #45, `feat/t12-integrated-acceptance-merge`, GitHub HEAD `e9229568e457785a884de8e08b1b9ad9404d256b` at audit. This annex records evidence and change boundaries; `odd/tasks/pi-capability-completion.md` remains the canonical task list and `odd/tasks/ecosystem-strict-parity.md` remains the single ECO execution backlog.

## Verified discrepancy matrix

| ID | ODD before | Runtime and tests | Current disposition |
| --- | --- | --- | --- |
| T07 | unchecked/verification pending at an ancestor | `src/interaction/code-intelligence.ts`, `tests/t07-real-asen-codegraph.test.ts`; dedicated real CLI and CI successful on e9229568 | checked, **bounded FULL only**, not full reference parity |
| T09-U4 | unchecked, activation/update/rollback historically unfinished | `src/runtime/managed-lifecycle.ts` exports install/upgrade/rollback; characterization and interrupted-upgrade tests | checked, **implemented/verified bounded**, without aggregate T09 FULL |
| T09 | checked FULL under old self-audit | real managed implementation, but browser launch, malicious same-user removal and inherited Pi dependency debt remain outside scope | unchecked **PARTIAL aggregate**; no new claims |
| T10-6 | FULL by owner waiver alongside missing Pi integration | `src/runtime/session-notifications.ts` bus is unit-tested but **NOT_WIRED** into `extensions/asen.ts`; journal-backed background notices ARE wired to Pi | **ACCEPTED_WITH_WAIVER bounded**; T10-6 bus integration PARTIAL |
| MEM-01..09 | unchecked legacy nine items | existing `memory-v3` R01-R09 evidence map and SQLite/Pi integration | checked **RECONCILED local core**; optional endpoints, live provider and global reference parity not claimed |
| ECO-01..16 | sixteen PARTIAL claims | some smaller T units are accepted within different scopes | registry remains 16 PARTIAL / 0 FULL |
| F5-01/F5-02 | in_progress while earlier Windows CI FAIL recorded | e9229568 CI/Release Gate/Pi/T07/F5 static successful; independent review not supplied | technical baseline PASS, independent R4 PENDING; both tasks remain in_progress |

## Delivery decisions

1. No duplicate managed lifecycle, CodeGraph or memory implementation. Preserve old failed receipts instead of deleting them.
2. Do **not** insert `SessionNotificationBus` between the durable background journal and Pi as a write-time prerequisite. It is not a durable consumer or Pi delivery acknowledgement. Registering it without a proven contract could turn TTL/capacity/restart into silent loss or duplicate delivery. This batch documents its NOT_WIRED state and enforces the distinction in a new repository test.
3. Preserve existing `deliveryConfirmed:false`. Journal `enqueued` denotes acceptance by the Pi transport, not a confirmed human view; restart can re-enqueue a pending item but cannot guarantee exactly once.
4. No changes to `registry/parity/ecosystem-claims-v1.json`, authority assets, packages, runtime security, credentials, provider workflows or `main`.

## Verification

The baseline e9229568 passed CI 41328305297, Release Gate 41328305277, Phase 0 41328305307, Pi runtime 41328305319, F5 static 41328305299 and real T07 CLI 41328305298. Pi Free Smoke 41328305285 was conditional SKIPPED. This batch introduces `tests/odd-state-consistency.test.ts` (positive/source-bound and adversarial in-memory mutation checks) to join the standard discovered test suite. Those new checks and this exact new commit have no historical PASS: require a fresh PR CI/Release Gate and inspect all jobs.

## Deferred functional work, in dependency order

- **T10-N1 / P1:** Design a real Pi consumer/acknowledgement contract from supported public APIs (not a model/provider fabrication). If Pi only supports synchronous enqueue, adopt an explicit best-effort delivery policy rather than pretending a durable ACK. Responsible role: Pi runtime maintainer. Exit: observed API contract, hostile cases and no new authority.
- **T10-N2 / P1:** Only after N1, wire the bus if it provides an observable benefit not already covered by the journal; test same-id dedup, different-id same text, TTL/capacity, monitor and agent notices, process restart, race before/after enqueue and persistence, one session/project at a time. Responsible role: runtime engineer + independent reviewer. Exit: no unauthorized writes, no dropped pending notices, no false deliveryConfirmed or exactly-once promise.
- **T09-S / P1:** Real browser activation, bounded hostile same-user removal threat model and inherited Pi host dependency resolution; require independent security review. Do not mark host-risk mitigation as proven from package-only CI.
- **ECO-C / P1:** Reconcile real reference/source semantic coverage; no global FULL without frozen-source receipts and required platform/host evidence. Responsible role: parity auditor.
- **F5-R4 / P0:** Obtain genuine independent R4 on the final SHA if FULL admission is required. The owner-deferred review is not PASS and cannot be simulated.

## Batch and release boundary

This is one documentation/test batch on the PR branch. Use a single non-force branch update; one resulting PR workflow set (CI + Release Gate + static/architecture/T07 gates) is the final test cycle. Do not merge or publish release packages. On any failure, inspect job artifacts and correct the precise cause; preserve the failed run. Admission of a subsequent fix needs its own exact-SHA CI, not inherited green from this baseline.

## Second batch: live notification projection (implementation candidate)

The earlier NOT_WIRED matrix above describes the first documentation-only reconciliation; it is retained as historical evidence, not the latest code disposition.

- New `src/runtime/notification-projection.ts` binds `SessionNotificationBus` to the optional Pi `ui.setWidget` as a read-only status projection, keyed by both session and project. Only observed, generated short job/agent status strings reach the widget. Raw stdout, model output, credentials and filesystem paths do not.
- `extensions/asen.ts` activates the projection per Pi session, sends a best-effort status for terminal job and agent outcomes, and deactivates on session shutdown. The existing `BackgroundJobJournal`, `pendingBackgroundJobNotifications`, `pi.sendMessage`, and `deliveryConfirmed:false` remain unchanged as the authority and transport boundaries. No journal replay is replaced by the in-memory bus.
- `tests/notification-projection.test.ts` covers source-ID dedup, distinct same-text events, session/project isolation, stale callbacks, unsafe terminal-control content, renderer failure, capacity overflow and restart non-durability. `tests/background-job-delivery.integration.test.ts` asserts observed live child completion renders a Pi widget and shutdown clears it without changing the persisted enqueue contract. `tests/odd-state-consistency.test.ts` is aligned to the now-wired non-authoritative projection.
- State: **CONNECTED_PROJECTION / integration tests added; no confirmed display acknowledgement**. Pi has not supplied a durable human-visible delivery receipt. The first-batch technical CI is not evidence for this new source change, and no independent R4 review is fabricated.


## Third batch: owner-authorized R4 automated self-review (candidate)

The owner has replaced the **independent reviewer requirement for internal scoped admission only** with an explicit **SELF_AUDIT_ONLY / NOT independent** policy. New `scripts/r4-self-audit.mjs`, `tests/r4-self-audit.test.mjs` and `.github/workflows/r4-self-audit.yml` generate a source-bound, fail-closed, exact-SHA JSON report and execute existing adversarial tests without an LLM/provider. No human or independent signoff is claimed. Real browser, inherited Pi advisory, same-user hostile uninstall proofs, global ECO reference parity and any failing CI checks remain open.

The previous CI on `a106188` failed in all three OS tests on an async T10 cancellation observation (`running` observed before persisted `blocked`); typecheck, Pi runtime, Release Gate, T07 CLI, Architecture, F5 static and relevant Pi support gates were green. This batch waits for the actual durable Todo state rather than treating the first UI widget refresh as job completion. Result must be evaluated at the new commit SHA, not inherited from the old candidate.


## Fourth batch: Pi scope eviction + real SIGKILL journal boundary (candidate)

An error was found in the ephemeral notification projection lifecycle: UI removal on shutdown did not evict the old partition from `SessionNotificationBus`, allowing historic messages to reappear on reactivation of an identical session/project. `clear(sessionId)` now removes only that partition; the projection clears it on switch/shutdown. Regression tests cover reactivation, cross-partition non-interference and bus capacity recycling. The live background journal remains the durable authority.

A new cross-process journal test kills an actual Node writer after fsync of a `running` record and reopens the journal. It verifies `interrupted` is reported as a non-resumable observation; the original command is never auto-replayed and a separate delivery-state write fails closed while the on-disk record is still `running`. **This is not confirmed delivery**; it exposes the unresolved owner-fencing requirement. Owner-chosen R4 SELF_AUDIT_ONLY is extended with this regression. The technical e47a795 baseline was green in Release Gate, R4 automated, Pi runtime, T07 and F5, but CI Windows was still running at this checkpoint. Exact-SHA new commit validation is required.


## Fifth batch: managed uninstall quarantine-dir substitution (source + real-process test)

The uninstall quarantine itself was not identity-bound: an attacker sharing the OS account could replace a stage directory after it was created while the original file pathname was already verified. `src/runtime/managed-lifecycle.ts` now records original root and staging directory identities and revalidates them immediately before the atomic move and after it, before deleting the quarantined object. A second real Node process substitutes an ordinary directory at a deterministic seam; a matching managed file must remain in place and foreign files must not be deleted. `scripts/r4-self-audit.mjs` enforces that the guard is present, with a malicious-mutation regression, and the R4 workflow executes the dedicated test.

This is a scoped vulnerability hardening **candidate**, not proof of atomic OS-level confinement under an always-racing same-user attacker. Keep T09 aggregate PARTIAL. Inherited Pi/Undici, interactive browser and full ECO source parity remain open. Parent CI 41337524703 was still running on Windows while other lanes and Release Gate were successful; the new SHA requires an independent exact-candidate CI observation (but R4 reviewer policy remains SELF_AUDIT_ONLY by owner choice).


## Sixth batch: no false delivery for virtual interrupted journal rows

Investigation found that `BackgroundJobJournal.load` returns `interrupted` as a read-only projection over on-disk `running` rows. Startup recovery previously attempted `pi.sendMessage` and `setDeliveryStateScoped(...,"enqueued")` on that virtual view. The latter is rightly rejected while the durable row still says `running`, but the next restart could try again. The T10 fix filters these uncertain results out of *automatic* delivery and shows a status-only diagnostic. The normal pending recovery for durably terminal results remains intact. A new test boots two separate extension instances against the same journal, verifies no re-run or enqueue and rejects a false journal receipt. R4 SELF_AUDIT_ONLY enforces the source-bound invariant. This batch is not yet CI-accepted; it requires exact-SHA workflow receipts.


## Seventh batch: T10 durable interrupted ownership boundary (2026-11-01)

The previous T10 startup guard alone did not guarantee that other users of `pendingBackgroundJobNotifications` and `BackgroundJobJournal.updateDeliveryState` would respect read-time virtual interruptions and persisted retry claims. Production now excludes all `interrupted` snapshots from automatic pending delivery and fails closed on both `pending` and `enqueued` writes for durably interrupted records. In-memory delivery mutation also denies interrupted state. Regression tests show a projected SIGKILL interruption produces zero automatically deliverable notices, a recorded retry claim remains byte-for-byte unchanged after refused acknowledgement, and genuinely failed terminal deliveries remain possible. R4 self-audit gets source-bound guards plus adversarial removal tests.

This closes another identifiable unsafe status transition, not the unknown outcome of the interrupted command. Real Pi display acknowledgement, owner-fenced interrupted recovery, the T09 persistent same-user race, and Reference Shell parity remain open; do not promote T10/ECO or F5 before exact-SHA CI.


### T10-R9 — compare-and-set for delivery metadata, not whole-row journal overwrites (2026-11-01)

A live `BackgroundJobRegistry.setDeliveryState` used to update its memory snapshot and then call `BackgroundJobJournal.record`, blindly replacing the entire durable row by job id. With two Pi processes, a stale local snapshot could overwrite a newer terminal outcome or undo a delivery transition. Worse, a failed write left the in-memory snapshot marked `enqueued` despite a persistence error.

The registry now sends the observed terminal snapshot to `BackgroundJobJournal.updateDeliveryState(..., expected)`, which holds the existing exclusive journal lock, compares state, updatedAt, command, mode, exit code, event count, cwd, arguments, output tail, delivery state and delivery error against the committed row, and changes **only delivery metadata** when the expected values still match. A mismatch fails closed, and registry memory stays unacknowledged while reporting persistence failure. The existing restart-only update uses the same lock and state validation but does not fabricate a native Pi display receipt. A real child Node process publishes a conflicting terminal row; another test publishes `enqueued` before a stale writer attempts to regress it to `pending`. Both conflicts must be rejected with durable data preserved. R4 SELF_AUDIT_ONLY validates this CAS boundary and has mutation tests.

**Limitations:** These checks reduce wrong-row overwrites and preserve conservative results; they do not prove visible Pi delivery, exactly-once effects, or full cross-process ownership fencing for arbitrary job termination. T10/ECO-10 and the 16 ECO aggregate claims remain PARTIAL. New exact-SHA CI Windows, macOS, Linux and Release Gate are required; do not inherit prior SHA receipts. External independent review was replaced only by explicit SELF_AUDIT_ONLY for bounded PR #45 scope; no main merge or release.


### T10-R10 — journal record finality and one-time retry-claim preservation (2026-11-01)

An additional T10/T04 concurrency defect was confirmed: `BackgroundJobJournal.record` previously removed any existing entry by id and wrote the caller's full snapshot. A stale original process could overwrite its original `stopped` record after `claimInterruptedForRetry`, or overwrite a newer terminal result and its delivery receipt. The bounded fix runs under the existing cross-process journal lock and refuses any stale, duplicate or unauthorized row replacement. A normal `running -> completed/failed/stopped/timed_out/flooded` transition is allowed only with the same immutable job identity and unchanged delivery metadata. A durable authorized `interrupted` retry claim may transition **once** to `running` with its exact authorization binding; a second start is rejected. Terminal and claimed rows never revert through `record`. An unrecognized identity change or delivery-state mutation is rejected without rewriting bytes.

Regressions cover: (1) real second Node writer publishing terminal failure before a stale process attempts to finish and enqueue, (2) stale original child attempting to erase a consumed retry claim, (3) exact one-time claim start plus subsequent valid finish, (4) actual `BackgroundJobRegistry.runAuthorizedRetry` with journal persistence, and (5) a terminal delivery receipt surviving attempted stale overwrites. The source and adversarial mutation checks are included in R4 SELF_AUDIT_ONLY. This is source-level protection against observed interleavings, **not** complete cross-process execution owner fencing, not native Pi display ACK, and not exactly-once side-effect proof. T10/T04/ECO aggregate remain PARTIAL. The old parent SHA 2a2676c had Release Gate and core checks PASS but CI was still running Windows/macOS at inspection; new source requires its own exact-SHA cross-OS checks. F5-01/F5-02 are IN_PROGRESS. No independent review or main merge.


### Corrective exact-SHA gate after ed59afc (2026-11-01)

Candidate ed59afcc0c5f666bb1dd460e76138753a2b2f5b6 did **not** pass the required gates: R4 SELF_AUDIT_ONLY (41346278481), Pi runtime evidence (41346278448), Release Gate (41346278479) and the affected CI jobs stopped at the same deterministic TypeScript TS2379 error at `tests/background-job-journal.test.ts:212`: a snapshot object explicitly set optional `deliveryState: undefined` under `exactOptionalPropertyTypes`. The journal implementation was not exercised in these blocked jobs. The minimal correction omits the absent optional property in that test fixture, preserving the intended stale-delivery conflict. No production logic or test assertion is weakened. Full source, exact-SHA CI, R4 and Release Gate must run on the corrective SHA. Old successes from ed59afc or earlier are not evidence for the new SHA; no FULL, independent review or merge is claimed.


### T04/T10-R11 — claim identity for real authorized retries (corrective candidate 2026-11-01)

R4 SELF_AUDIT_ONLY on SHA 4bae3bc69cd2216a3764c41caea04951e3e5791b failed its new synthetic retry test because a fixture used a non-UUID `newJobId`. The CI full suites on Windows and macOS independently exposed a **real** regression in `tests/authorized-job-retry.test.ts` (`hard process death after the authorized write ...`): the new `BackgroundJobJournal.record` immutable-identity guard refused the legitimate `interrupted -> running` retry. Root cause: `claimInterruptedForRetry` persisted authorization, command and scope but did not copy the interrupted row's `args` and `cwd`; the actual launched job supplies both, so comparison was (correctly) unequal. The corrective implementation writes the original bounded args and cwd into the one-use claim. It does NOT relax terminal finality, duplicate-start denial, scope or authorization checks. The fixture now uses a valid UUID; a direct regression asserts that arguments and cwd survive the claim; the R4 source/mutation gate protects these fields, and its focused suite now includes the real hard-process-death test. This candidate requires fresh exact-SHA R4, CI and Release Gate before admission. Do not call the predecessor SHA PASS, infer FULL, claim independent review or merge to main. T04/T10/ECO and F5 stay evidence-bounded PARTIAL/IN_PROGRESS.


## T10-R12 — progreso verificable bajo contención del journal (2026-11-01; candidato, NO admitido aún)

El CI Windows del SHA `270923bf176bf6ebdfde320b7e16bd839aaf1472`, ejecución 41347622946, falló en `serializes journal updates from independent Pi processes without losing records`: el segundo escritor expiró en `Background journal is busy; refusing a concurrent overwrite` tras 3 segundos. Ubuntu/macOS y los gates Release/Architecture/Pi/T07/R4/F5 pasaron para ese SHA anterior, pero el CI global NO pasó. El fallo no demuestra pérdida de registros ni descarta un problema del entorno Windows.

Corrección acotada T10-R12: mantener 3 segundos como límite cuando no cambia el fichero durable del journal, renovar ese límite solo cuando cambie una identidad observable del fichero (dispositivo/inodo/tamaño/mtime) y fijar un máximo absoluto de 15 segundos, aunque un actor siga alterándolo. No se elimina ningún lock ajeno ni se confía en su PID; una espera agotada sigue rechazando la escritura. Se conserva la prueba real de dos procesos y 100 escrituras; se añaden escenarios adversariales con reloj simulado: progreso real durante más de 3 segundos, lock inmóvil, churn continuo con tope absoluto y denegación EPERM. La autoauditoría R4 comprueba la presencia de ambos límites y de la renovación condicionada, y prueba mutaciones que eliminan cada guardia.

Todo este conjunto se publica como **un único commit/actualización de ref**, con pruebas y documentación, para disparar una sola ronda normal de CI. No se han ejecutado pruebas locales del repositorio en el entorno de este chat: sin checkout GitHub accesible ni dependencias de Node compatibles. No es PASS ni FULL por publicarse; exigir CI exact-SHA Windows/macOS/Linux, Release Gate, R4 SELF_AUDIT_ONLY, F5 estático y demás gates. F5-01/F5-02 siguen IN_PROGRESS, T09/T10/ECO siguen PARTIAL, sin merge a main, sin proveedor ni firma independiente.


## Windows CI 41350048894 — T10 same-size workspace test (2026-11-01)

CI on cf2f5c382d1ebabca30064184a845a9ba1354805 ended FAILURE: Ubuntu/macOS tests PASS and Release Gate/Architecture/Pi/R4/F5/T07 PASS, but Windows tests/t10-public-workspace-actions.test.ts failed at git status --porcelain after a successful same-byte-length replacement (original newline -> resolved newline). The assertion checked transient Git index-stat detection; Windows also emitted LF/CRLF warnings. A racy index/stat view is plausible but not independently proven.

Test-only candidate: use a different-size replacement where the integration test asserts porcelain changes. Separately verify same-length edits through exact changed file bytes, unchanged HEAD blob and unchanged index blob, without relying on immediate porcelain metadata. No production behavior, permissions or authority changed. This must be validated by a fresh exact-SHA Windows/Linux/macOS CI, no FULL promotion on documentation alone.


## T10-R13 retry-of-CI, 2026-11-01: await the scoped asynchronous diagnostic

Exact predecessor SHA `bd82d3374a03702dae27c865b27adf960b726432` reported CI 41351846474 FAILURE on Windows and macOS while Ubuntu CI test lane PASS; R4 workflow 41351846461 FAILED. The failing focused test is identical across three jobs: `tests/background-job-delivery.integration.test.ts`, `a losing process cannot send or acknowledge an unpersisted terminal outcome`, assertion `user gets a scoped diagnostic, not a false success`. The existing test checked `registry.snapshot().persistenceError` and yielded just one `setImmediate`. This only establishes that the synchronous terminal persistence CAS failed; the extension asynchronously awaits monitor flushing and identity canonicalization before emitting the scoped diagnostic. No real product evidence demonstrates a lost notification, a false Pi enqueue or overwritten terminal record from these failures.

Surgical corrective test: wait **at most 5 seconds** for the exact diagnostic from the owning UI (10 ms polling, the same bounded pattern used elsewhere in this integration suite). Keep the precise `persistenceError` assertion and zero Pi enqueues, plus durable competing-row, delivery receipt and restart-no-replay invariants. Do **not** change security policy, production code, timeouts of product operations, waived provider paths or authority pins. The test is no longer tied to an arbitrary scheduling turn, yet a genuinely absent UI notice still fails within 5 seconds. Validation remains pending exact-SHA CI/R4; this is not a claimed local RED/GREEN, F5 FULL, external reviewer or reference parity.

One commit/one ref update per this focused repair; verify CI Windows, macOS, Ubuntu, R4 automated and Release Gate for the resulting exact SHA.

## T09-R7 — preserve journal on unhealthy rollback (candidate, 2026-11-01)

On PR #45 parent 4c67310f1e6c13bcde2d34957dca3f1c78a35f32, managed upgrade could select the old version, fail its CLI probe, report rolled-back and discard the durable recovery journal. Explicit rollback also discarded its journal after a failed probe or skipped the health probe when target was already active. No actual production incident has been observed. Corrected candidate retains the journal, reports ambiguous, and requires a successful observed CLI before clearing the interrupted-upgrade recovery marker. A test with temporary signed versions makes v1 unhealthy only after v2 activation, blocks unsafe re-upgrade and proves later explicit recovery. No trust, installation roots, user data or host configuration are changed. T09 remains PARTIAL until exact-SHA CI/R4 validation.

Recovery authority guard: while an interrupted upgrade journal exists, an explicit --to override pointing anywhere other than its recorded from-version is refused with RECOVERY_REQUIRED, not accepted as clearing the incident. The regression verifies this negative behavior before successful recovery.

Added an explicit interrupted-upgrade journal fixture with current v2 and unhealthy prior v1 to cover the distinct manual-selector rollback path, not just automatic rollback followed by already-selected recovery. The test verifies report ambiguity, retained journal and subsequent verified recovery after the temporary CLI fault is removed. All files and signing keys are generated under test-owned temporary roots.
