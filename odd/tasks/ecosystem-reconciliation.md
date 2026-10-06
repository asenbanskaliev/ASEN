# Ecosystem reconciliation and final-candidate audit

## Scope and observation

Audited starting candidate: `f5a3f95294bd4017674bfddec27e64dfe4259391`, PR #32, `feat/strict-parity-prerequisites`. The GitHub PR head matched the checkout. Memory R01–R09 and GSP-06 retain their accepted closure. No additional provider execution is authorized solely to improve GSP-06 evidence. Missing ecosystem implementation is not covered by that provider-evidence exception.

Classification: COVERED means the named admitted behavior exists with corresponding evidence, not overall FULL parity. PARTIAL separates implemented primitives from unfinished integration or evidence. MISSING means the required surface has no implementation. OUT-OF-SCOPE applies only to explicit branding/private-authority/cloud differences. Documentation age alone cannot establish a code defect.

## Complete ECO comparison before implementation

This table is the starting audit at the named starting SHA. Subsequent checkpoint records below and the canonical tracker supersede individual starting limitations; the machine-checked claim registry is the current aggregate status.

| Unit | Requirement | Existing implementation and tests/evidence | Real status and necessary action |
| --- | --- | --- | --- |
| ECO-01A | Exact tracked extension baseline | Skill manifest pins the same source commit; no ecosystem Git-object manifest or validator. | MISSING: freeze extension objects and anchors. |
| ECO-01B | Documentation/media identity and inspection | Directional inventory only; no exact ecosystem media manifest. | MISSING: hash tracked docs/media and inspect assets without copying them. |
| ECO-01C | Import/reference closure | No ecosystem closure manifest. Source imports include substantial supporting libraries beyond the 20 entry files. | MISSING: resolve tracked local closure and classify external/optional/unresolved edges. |
| ECO-01D | Baseline adversarial validation | Skill/memory validators exist but do not validate ecosystem objects. | MISSING: object, path, integrity, duplicate, closure and malformed-input fixtures. |
| ECO-01E | Drift and invalidation | `src/radar/radar.ts`, `tests/radar.test.ts` classify broad paths; no ecosystem hash/anchor/dependency invalidation. | PARTIAL: add report-only exact drift detection, no automatic adoption. |
| ECO-02A | Packed public exports | `scripts/verify-pack.mjs`, `tests/package.test.ts`, Release Gate pack/install smoke. Declared `./extensions` targets absent `extensions/index.ts`; existing tests assert the broken declaration. | PARTIAL / PRODUCT DEFECT: reproduce installed export resolution, repair target and enforce packed resolution. |
| ECO-02B | Evidence-linked claims with fail-closed FULL | Skill/memory matrices exist; `external-ecosystem-v1.yaml` is an older broad comparison with unsupported PARITY labels. | PARTIAL: ecosystem-specific evidence requirements and rejection tests. |
| ECO-02C | Honest maturity and claims | README still says architecture bootstrap. Old ecosystem rows call registry N/A although discovery/refresh now exists. | PARTIAL / DOCUMENTATION: reconcile current behavior without promoting general parity. |
| ECO-03 | Ask-user choice/question TUI and RPC | `CAP-INT-001` describes a contract; `extensions/asen.ts` registers status/registry/workflow/review commands only. No choice/question tool or accessible interaction. | MISSING: actual tool/UI/RPC behavior, cancellation/unavailable host and mutation gate. |
| ECO-04 | Secure read-only code intelligence | Canonical tool-path authority exists in `extensions/authority.ts`, tested by `tests/pi-authority.test.ts`. No code-intelligence registration/process adapter. | MISSING: shell-free bounded secure-root integration; do not inspect local index state. |
| ECO-05 | Public agent lifecycle | Dispatcher and Pi process/artifact runners; dispatcher/process/cancellation/authority tests. Queue/concurrency in-process exists. No public queue/continue/status/history/session transport or durable agent lifecycle. | PARTIAL: preserve tested authority; implement missing public lifecycle and restart composition. |
| ECO-06 | Primary orchestration | ODD facts, orchestration, workflow selection, doctor, review controller; routing, applicability, writer-admission and integration tests. Pi facade exposes functions, not automatic user-task execution. | PARTIAL: status/doctor/prompt and actual entry integration remain; private review authority stays OUT-OF-SCOPE. |
| ECO-07 | Durable todo/replay | `odd-task-tracking.ts` mirrors full task/TODO/next-step with SQLite reopen and exact revision/document checks. `EngineeringTask` state is in-process. | PARTIAL: existing mirror is COVERED; public transitions, replay/conflicts/crash recovery and session lifecycle are not. |
| ECO-08 | Registry lifecycle | Discovery, cache, mirror, explicit refresh command; discovery/generated-registry/extension tests. | PARTIAL: refresh is COVERED; startup/watch/debounce/disable/shutdown integration is absent. |
| ECO-09 | Launcher/home/setup | Pi package metadata and packed/Pi install smoke; no ASEN executable or managed setup/link lifecycle. | PARTIAL: package registration is COVERED; launcher/setup/rollback/permission contracts are not. |
| ECO-10 | Attribution/workspace UI | Candidate/repository identities and write scopes exist; no actor attribution/change workspace UI. | MISSING: concurrent attribution and accessible workspace interactions. |
| ECO-11 | Profiles/customization | `CAP-MOD-001` is a policy declaration, not runtime profile parsing/routing. | MISSING: schema/precedence/diagnostics/rollback and live/restart integration. |
| ECO-12 | Opt-in private prompt history | Curated memory/passive capture is implemented; this is not prompt-history UI/storage. | MISSING: separate opt-in history lifecycle and privacy/tombstone/retention behavior; do not redesign memory. |
| ECO-13 | Usage/one-shot telemetry | No metrics extension, consent/preview sender or local usage projection. | MISSING: privacy-preserving adopted local/opt-in contract. Hidden delivery is prohibited. |
| ECO-14 | Resume/startup/presentation | Signed checkpoint and exact Pi session reconciliation; session-recovery/process tests. No banner/pretty/quiet/full startup UI. | PARTIAL: recovery primitives are COVERED; startup/presentation and corresponding real-host journeys remain. |
| ECO-15A | Core behavior-backed docs | `docs/architecture`, existing authority/recovery docs and Skills. | PARTIAL: link each shipped claim to evidence and supported interfaces/platforms. |
| ECO-15B | Feature docs | No shipped launcher/workspace/history/usage/profile features to document. | MISSING: follows implemented feature contracts; do not document proposed features as shipped. |
| ECO-15C | Documentation validation | Skill document/parser audits, but no ecosystem link/command/claim/media validator. | PARTIAL: add checks against shipped command/export/claim inventory. |
| ECO-16 | Final ecosystem verification | General CI/Release/architecture suites exist; no complete ECO matrix or cross-host vectors. | PARTIAL: final closure requires implemented units and applicable evidence, not general green CI. |

## Transversal chain

User → Pi registration is demonstrated by real offline RPC/package probes. Pi → ASEN exposes registered commands and facade methods; it does not yet compose all ecosystem runtime surfaces. ASEN ODD → selection → Dispatcher → Pi tools has genuine one-use provenance, exact candidate/Skill bindings, replay/forgery/mismatch tests and fail-closed direct-Pi writer checks. Generic runner admission is not filesystem confinement. Tool denial is enforced by the reviewed Pi authority extension; same-process hostile code and OS isolation are not claimed.

Evidence → persistence → recovery uses signed envelopes and synthetic child-process tests. Signing-key ownership and rollback limits remain explicit. Memory project/session isolation, close summaries, export/import and operational safety retain R01–R09 evidence; `preserveFinalResponse` guards memory errors. Existing passing memory tests do not establish newly missing history/todo/agent lifecycle behavior. Release Gate does not authorize publication or merge.

Starting exact-head GitHub observations: CI `37482424354`, Phase 0 `37482424349`, Release Gate `37482424011` PASS; Pi Free Smoke `37482424504` SKIPPED. GSP-06 `37482424286`, failed job `112333725705`: inspected logs confirm deterministic preflight PASS, then `odd-positive` HTTP 429 / free-model daily quota with zero remaining. This is QUOTA, not PRODUCT DEFECT. No provider run is retried.

## Checkpoints and observed evidence

- Audit checkpoint: `f1cb6986a8c2c7ce5667e3390415cf35fbbbf911`. Published through GitHub with expected-head lease after unauthenticated Git push failed; the uploaded tree exactly matched the local staged tree. No remote work was overwritten.
- Baseline checkpoint: `c6f120222089da2626e0da86a69b5c53c62564c2`. 166 tracked regular Git blobs, 46 roots, 647 parsed import/document edges: 346 tracked, 208 Node builtins, 68 declared dependencies, 17 external URLs and 8 fragments. Seven SVGs, six PNGs and one 140-frame GIF were hashed and inspected; PNG count includes the root logo. Correction to the original directional inventory: there are six PNGs across both root assets and docs, five within docs. Four noninitial animation frames plus the initial frame were inspected. No source artwork/prose entered ASEN's runtime package.
- Six synthetic Git-object/drift tests PASS; local typecheck PASS; exact-object re-collection PASS; upstream boundary PASS. Tests cover dirty/untracked checkout exclusion, exact UTF-8 bytes, cycles, malformed identities/arrays, missing objects, static versus computed imports, additions/removals, unique versus ambiguous renames, dependency-version drift and transitive importer invalidation. An absent module/fixture is not claimed as semantic RED. Media parsing/image-fixture and command/asset/reference coverage beyond parsed imports/Markdown links remain open; this is research evidence, not runtime parity.
- Package correction observed semantic RED: public Node resolution failed for absent `extensions/index.ts`. GREEN after targeting existing `extensions/asen.ts`: resolution and negative private-path checks PASS. `npm run verify:pack` installs the actual tarball offline without scripts, checks all 28 public exports and reads packed bytes for boundary scanning. No package publication occurred.
- GSP-06 automatic PR trigger is removed. Manual invocation is restricted to the canonical branch and an explicitly matching exact HEAD; no invocation was made. This enforces the accepted quota-saving scope without recording provider PASS.
- Independent audit of exact tree `6a411895c5e835afc5f6056f559fe302d90b4df9` / checkpoint `d7af2f3d80bf782ed4b2995205475e915243eb1e`: 19/19 focused checks PASS, but three baseline metadata defects reproduced. They admitted null dependency names, name/spec contradictions and tracked references without a literal target. New regressions observed 3/3 semantic RED, then GREEN after fail-closed name/spec/reference-binding validation. The independent global verdict correctly rejected FULL/merge-readiness because ecosystem runtime is unfinished.
- Following checkpoint completes family/visibility/stable source IDs, adds byte-bound PNG/GIF/SVG metadata validation and synthetic malformed-image/identity fixtures, and establishes the 16-unit current claim registry. Exact-object verification of every media record corrected GIF transparency from first-frame false to whole-animation true. This was inspection metadata correction, not a runtime memory defect. Fifteen focused baseline/media/claim tests and typecheck PASS; all existing deterministic audits PASS. Current claims remain 10 PARTIAL / 6 MISSING / 0 FULL.
- Canonical tracker, README and registry documentation now distinguish shipped primitives, remaining runtime, historical Phase 10 labels, accepted provider-limited GSP-06 closure and admitted memory closure. GSP parent checkboxes are reconciled with their already-recorded child closures; no Skill row is promoted to FULL.

## Dependency plan and rollback

### Independent adversarial follow-up

Audit of checkpoint `38361d53a958f673b126ec39b38619595b2a829a` passed 15 focused checks and reproduced two additional validator defects: PNG without image data/comment-only SVG acceptance, and editable claim flags lowering mandatory FULL evidence. Two new regressions observed semantic RED. Repairs require PNG image data, balanced actual SVG root structure and fixed per-unit minimum boundaries independent of claim flags. Eight media/claim tests then passed; exact frozen-object/media verification passed. Metadata inspection is bounded structural inspection, not a complete image decoder. Receipt hashes/content binding establish consistency, not execution authenticity; independent CI/audit must establish actual execution.

Full local suite on that checkpoint: 865 tests, 864 PASS, one infrastructure failure in the Pi process cancellation observation (`ps`: `fatal library error, lookup self`). This is not a product RED and is not recorded as PASS. No provider or remote CI was invoked for these checkpoints. Ecosystem remains 10 PARTIAL / 6 MISSING / 0 FULL; these missing implementations are not covered by the accepted GSP-06 provider exception.

After repairs, typecheck, all six deterministic registry/boundary audits and installed package verification (102 files, 28 public exports) passed. Isolated Pi process suite repeated the same infrastructure failure (37 PASS / 1 failure). `npm run check` stopped after typecheck because the `tsx` CLI could not create its IPC pipe (`listen EPERM`); the full suite above used `node --import tsx --test` without altering tests. No complete local/remote CI PASS is claimed for this checkpoint.

Checkpoint A records this comparison. Checkpoint B freezes baseline/closure and adds deterministic validators/drift. Checkpoint C fixes demonstrated package/claim defects, prevents automatic excluded-provider invocation, and reconciles descriptions. Essential runtime ECO-03–08 follows the frozen contract, then ECO-09–14, behavior-backed documentation and final verification. Independent review must try to refute claims; no green suite can substitute for absent implementation.

Commit/push each coherent locally checked checkpoint. Use skipped CI for interim checkpoints; reserve one consolidated exact-candidate deterministic CI after 4R. Never merge, publish a release, modify main or auto-adopt upstream. New baseline records are research metadata, not runtime dependencies; rollback removes their validator/registration without touching memory data. Package rollback is a single reviewed target/verification change.

## Completion ceiling

This comparison demonstrates genuine ecosystem implementation gaps. It does not authorize narrowing them away, declaring overall parity or marking the PR merge-ready. Accepted provider-limited PARTIAL Skill rows remain separate from MISSING ecosystem runtime. The final candidate must report unfinished units honestly.


## ECO-01 closure expansion — continuation from 218be239

GitHub confirmed the exact starting HEAD, main 49129b616c5349fbf323b74860136fc1593f9b2a, 164 ahead / 0 behind and no subsequent commits. Existing ECO-02 export/claim corrections were retained. No memory implementation or provider execution changed.

4R reproduced two semantic RED cases: missing non-root asset closure and missing public registration inventory. GREEN adds AST registrations, source-relative URL resources, HTML src/srcset and inline command references, plus full registration-body anchor hashes and transitive command/asset invalidation. The exact-object baseline now has 167 blobs and 988 edges: 361 tracked, 34 external, 8 fragments, 163 unresolved, 145 declared, 208 builtins, 68 dependencies and one outside-root. The additional blob is tracked platform transport source, not an installed dependency or copied artwork. Cwd-dependent reads, computed expressions and unregistered prose commands are not guessed.

Independent adversarial review found lexical-shadowing false resolution, quoted tool-name omission and missing srcset references. One new semantic RED regression reproduced shadowing; repairs use lexical scopes, reject parameter/destructuring shadow guesses and include quoted property names/srcset. Current focused baseline/media/claims/package/provider-scope checks: 23/23 PASS; exact Git/media verification, ecosystem audit and typecheck PASS. Runtime parity, platform CI and FULL are not established by this source inspection. ECO-01C retains semantic-contract/unresolved-reference work; no unit is silently narrowed to declare closure.


## ECO-03 core interaction checkpoint

Implemented ASEN-owned choice/question tools through public Pi select/input primitives, preserving command-only hosts. Options/questions, closed tokens, descriptions/previews, single/multi/custom answers, cancellation, invalid/unavailable responses, 60-second default deadline, concurrent-dialog exclusion and late-dialog quarantine are bounded. Question cancellation discards partial answers. Parameters reject unknown authority fields, getters/proxies/sparse arrays and terminal controls; snapshots bound bytes/depth/nodes. Answers are descriptive data and never mint existing execution/write/review/delivery authority. No memory schema or format changed.

Observed semantic RED: four missing-registration assertions, then two cancellation/quarantine regressions. GREEN: eight focused interaction tests and related extension/registry/workflow/authority tests (23 total). Typecheck and installed package verification PASS (28 public exports). Independent review found host custom-text ESC admission and further baseline hoisting/shadowing defects; two additional RED regressions then GREEN (21 baseline/interaction tests). Baseline now uses the TypeScript binder with a virtual noLib/noResolve host that reads no checkout or dependency files.

Current aggregate becomes 11 PARTIAL / 5 MISSING / 0 FULL. ECO-03 core is IMPLEMENTED / LOCALLY VERIFIED, not closed: real host/platform interaction, full presentation and integration with genuine human-only mutation consumers remain required. Prior six-MISSING observations above are dated historical observations, not current counts. Rollback removes interaction registration and its two modules; no persistent data migration is involved.


## ECO-03 RPC / ECO-04 read-only checkpoint

The installed Pi RPC host transports a registered ASEN choice and cancellation offline, with zero model invocations (`tests/ask-user-rpc.test.ts`). This is Linux RPC evidence, not TUI or all-platform evidence. ECO-03 still requires full presentation and genuine human-only mutation-consumer integration.

ECO-04 now registers `asen_code_intelligence` for query/explore through the existing primary extension. Its model schema cannot select roots, executables, initialization or permissions. Canonical Git roots, separate literal arguments, bounded output/time, cancellation, sanitized failure results and contained npm JS-entry resolution are tested with synthetic subprocesses. Git environment overrides are removed from root discovery; Windows shell shims are never executed. No real index was inspected or modified. The installed CLI remains trusted local code; this adapter does not claim OS confinement.

4R reproduced the initially absent registration, implemented the minimal process adapter, repaired path/metadata containment, and revalidated positive and hostile arguments, invalid roots/parameters, stale errors, output overflow, timeout, abort and escaping npm entries. Real CLI invocation, permitted initialization lifecycle, native TUI and cross-platform host journeys remain open. Current aggregate: 12 PARTIAL / 4 MISSING / 0 FULL. No ECO unit is newly declared FULL; memory and accepted GSP-06 scope are unchanged.


## ECO-05 concurrency repair / ECO-08 lifecycle checkpoint

The adversarial audit reproduced a real Dispatcher defect: maxConcurrency=1 admitted two simultaneous runners when a new dispatch arrived in the microtask between releasing a slot and waking a queued request. The regression was RED (2 instead of 1), then GREEN after direct FIFO slot transfer. Existing Skill/admission/authority gates are preserved; this does not complete the public agent lifecycle.

ECO-08 now reuses the existing source discovery, cache, output paths and mirror. The primary extension registers startup/shutdown events and the ASEN disable flag; `ASEN_NO_SKILL_REGISTRY` and Pi `--no-skills`/`-ns` disable automatic refresh/watch. Manual refresh remains available. Writes serialize per canonical project, watch events debounce and coalesce while refreshing, stale generations cannot invoke new writes, shutdown cancels timers/closes handles and waits for in-flight preparation/writes. Startup/watch failures remain diagnostic and sanitized, without cancelling final model responses or changing mandatory Skill selection.

4R covers registered startup, disable, debounce, invalidation, late callbacks, project switching, shutdown, queued preparation, concurrent starts and recovery from failed startup. Independent review reproduced host-context mutation redirecting a watcher to another project; a snapshot of the host context/canonical root repaired it, with RED/GREEN isolation regression. Native recursive watch invalidation uses only temporary synthetic Skill documents. Unsupported filesystems report unavailable watchers; missing source roots require manual refresh or restart. All-platform/Pi startup journeys and complete watch recreation remain pending. ECO-08 is IMPLEMENTED / LOCALLY VERIFIED for this bounded core, still PARTIAL. Aggregate remains 12 PARTIAL / 4 MISSING / 0 FULL.

## Consolidated local checkpoint verification

Exact tested HEAD: `309cde51851c9244df7939e83c5a9ff15f9364f2`, tree `94bd372f36cd1a09062115844f22fc4a1435087f`. `node --import tsx --test tests/**/*.test.ts`: 892 tests, 891 PASS / 1 INFRASTRUCTURE failure, 0 skipped. The cancellation observation fails because sandbox `ps` reports `fatal library error, lookup self`; this is neither functional RED nor PASS. Tests and process cleanup were not weakened. Typecheck, all deterministic audits, installed tarball verification (106 files / 28 public exports) and diff whitespace checks pass.

Independent read-only audit on this exact HEAD: 58 focused dispatcher, registry lifecycle, ODD tracking and orchestration checks PASS; earlier interaction/CodeGraph review reproduced the nullable-limit mismatch and confirmed its repair. FIFO and host-context isolation defects were reproduced, repaired and revalidated. No new material defect was reproduced; public agent lifecycle, orchestration/replay composition and full host/platform coverage remain pending. This is not a final global parity audit.

One consolidated remote deterministic/platform check is warranted for the mature runtime batch and sandbox process-observation limitation. Results must bind the newly published candidate exactly; no historical PASS is transferred. Providers remain excluded. The next implementation checkpoint starts with the outstanding public agent queue/cancel/continue/persistence/status/ownership/restart contracts, then primary orchestrator entry/doctor/status and durable Todo transition/replay/conflict composition; preserve the accepted memory core and opaque authority. Canonical baseline semantic mapping, real interaction/CodeGraph/platform journeys and ECO-09–16 remain open. PR #32 remains Draft and not ready for merge.
