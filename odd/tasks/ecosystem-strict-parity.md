# Ecosystem strict behavioral parity

## Goal

Deliver evidence-backed parity with Reference A for every non-branding observable ecosystem behavior, under ASEN-owned names and paths. Preserve honest `MISSING`/`PARTIAL` status until behavior is implemented and verified. Pretty/quiet behavior, opt-in history, privacy-preserving usage and telemetry, startup and presentation behavior, and workspace visuals may be later priorities, but all remain required before overall parity is `FULL`.



## Current exact-HEAD checkpoint — 2026-10-08

- La primera revisión documental `32cf9f0477095fd5f5a341469942e80971407c45` falló CI arquitectura y Phase 0 en `audit-upstream-boundary` por el localizador externo añadido. Se registra como regresión documental, no como defecto de producto; esta continuación lo elimina y exige ejecutar workflows otra vez sobre su propio SHA.
This checkpoint supersedes older “current delivery” and pending-CI statements below; those entries remain historical evidence. No implementation, source inventory, authority, or route status changes are implied.

- PR #32 remains open and draft. Branch `feat/strict-parity-prerequisites` HEAD: `a4a9862d4d52c4130e0622110d91b6c7c49ac647`; base `main`: `49129b616c5349fbf323b74860136fc1593f9b2a`; compare: 250 ahead / 0 behind. The only commit after the previous A4R baseline `f03bcfa529340b7a13ba9131cc7e3e2e09d28f0c` is `a4a9862d4d52c4130e0622110d91b6c7c49ac647`, changing checkpoint recovery validation and its regression test. The recovery guard rejects invalid deserialized task phases; valid checkpoint compatibility is covered by the existing checkpoint/session recovery suite. This is the current candidate evidence, not a parity closure.
- Exact GitHub Actions for this SHA: CI run `37729892795` SUCCESS (Ubuntu, macOS, Windows, architecture); Release Gate `37729892739` SUCCESS (Ubuntu, macOS, Windows package jobs); Phase 0 Architecture `37729892685` SUCCESS; Pi 1.0 runtime evidence `37729892673` SUCCESS. Pi Free Smoke `37729892697` is SKIPPED, not PASS. Do not transfer these results to another SHA.
- CI-PREQ-04 reopened on exact candidate `4a8b6d819554f86447ef24c328a95bb5924d09c4`: Windows CI run `37732480152`, attempt 3, reproduced `usage counters persist and concurrent increments do not lose updates` failing 1/985 at `wx` attempt 24 with `EPERM` after earlier `EEXIST`; immediate `lstat` found `ENOENT`. The same SHA's Windows Release Gate passed 983/985 (two platform skips), so the Windows race remains intermittent. This candidate adds a single fail-closed retry only after prior contention plus confirmed lock absence; initial permission errors and existing-lock permission failures still propagate. Deterministic regression tests cover both retry and refusal paths. Results for this candidate are pending its exact-SHA Actions run.
- ECO-01C-2 source-identity progress: GitHub confirma el commit de la fuente congelada `08de420ca29be16b6f6bee725a30b599b061df16`; su árbol raíz `9af648106ed75fa270476e9d474bad93aa38af6b` coincide con el árbol del manifiesto. El localizador externo se omite para cumplir el límite de aislamiento; los IDs Git fijados bastan para reproducir la verificación.
- Exact current claim registry remains 16 PARTIAL / 0 MISSING / 0 FULL. R01–R20 remain PARTIAL; no route is promoted by CI or source-tree checks. The checkpoint recovery defect remains repaired. CI also surfaced an intermittent native watcher observation on macOS (one failure, then pass on the same SHA), and the Windows lock-create race recorded above; neither is misclassified as resolved without its exact evidence.
- Next canonical order: finish ECO-01C-2 semantic/edge adjudication; then ECO-01E mapping/invalidation, remaining ECO-01 and ECO-02; only then continue ECO-03–16. Reuse existing stores, registry, dispatcher, session/recovery, authority, and ODD/Memories. Do not redesign Memory or create parallel persistence.

## Current roadmap annotation unit

This bounded documentation unit annotates the existing ECO owners from a 23-page user-provided product brief (`SHA-256 143bf702ea5150c2a100679806097e8aadd52a367c7dcca8aad741b8a47782c0`). It adds prioritization and evidence gaps only: no new ECO/EP backlog, dependency reorder, runtime implementation, frozen-source identity, refreeze, installed-feature claim, `FULL` claim, or new authority. The brief describes a v4.0.0 product while this repository tracks unreleased main; its one-to-three-run performance figures are directional constraints, not proven ASEN results. Windows end-to-end behavior remains unverified.

Annotation work is based on published local/remote HEAD `f8fbb9820219c2affe34fae27c441337616ec439`; exact-HEAD CI runs are launching. The documentation map at `f8fbb98` was audited with nine checks plus isolation evidence. CI-PREQ-01 source commit `7246966cb2d3aef6ad95f4317a96eba3a7f076b9` has native acknowledgement evidence (12 CodeGraph checks plus 6 extension checks), while compiler/full CI remains pending remotely. Native combined review `review-7dc163635532f99f` approved the immutable CI-PREQ-02/03 slice; exact acknowledgement succeeded and burned authority for target `sha256:3e1dd3fee1113a8dc5b92c798cac012791a4955eea944629bd0845cbb8222792` at revision `88d498d557d2173797e2d036e6866c8bd22440f2f0a751806dd09502f72e7ce6`. Earlier review `review-7078f73f836ff282` remains only historically approved and unacknowledged; no old-target burn is claimed. The `f8fbb98` documentation-map review was auto-approved at low risk; acknowledgement was unavailable because selector retention had expired, so no burn is claimed, while independent checks fulfilled the fallback evidence boundary. No vendor package repair is included.

## Non-goals and required differences

- Do not copy branding, trademarks, artwork, prose, or external names and paths.
- Do not expose or imitate provider-owned private authority; integrate only through public, provider-issued boundaries.
- For the adopted scope, branding, trademarks, copied artwork or text, and provider-owned private authority remain the only inherent behavioral-content differences. The user-deferred NaN provider is an explicit accepted-scope limitation, not a parity equivalence: it narrows adopted scope and keeps full Reference A parity incomplete until reauthorized or otherwise adjudicated.
- Internal architecture and identifiers may differ when observable behavior remains equivalent.
- This plan integrates, and does not replace, `odd/tasks/skill-contract-parity.md` or `odd/tasks/memory-strict-parity.md`.
- No phase authorizes commit, push, publication, release, automatic source adoption, or remote delivery.
- A future provenance manifest may contain the external repository locator only under a narrow, audited path exception. Ordinary documentation calls the source Reference A.

## Frozen baseline and confidence

Reference A's authoritative machine snapshot is pinned to commit `08de420ca29be16b6f6bee725a30b599b061df16`. `registry/parity/ecosystem-sources-v1.json` currently freezes 167 tracked regular Git blobs and 46 roots from that snapshot with exact object IDs, byte SHA-256, family/visibility/source IDs, anchor-line hashes, dependency versions and 988 persisted reference records. These totals were mechanically verified against the current checked-in JSON during ECO-01C-1; the previous 166/647 counts described an earlier inventory expansion. The later extension comparison at `6e681f1d08fff3092273cf305206094d15cacd18` is supplemental source analysis only; it is not an automatic rebaseline, drift adoption, runtime proof, or `FULL` claim. Existing registry records remain authoritative and untouched by this reconciliation. `ecosystem-media-v1.json` records dimensions/frame/alpha metadata and visual inspection without shipping source artwork. Exact-object verification checks every media record. These are SOURCE_INSPECTED records, not runtime parity. The subsequent closure expansion is recorded below; complete normative semantics and explicit unresolved-reference adjudication still remain.

Verified selected inventory includes 20 extension files, including seven history files; one README plus ten documentation files; seven SVGs; one GIF and six PNGs across docs and root assets. Five PNGs belong to docs; the sixth is the root logo. Exact objects were re-collected from the pinned source clone and matched the manifest. Static AST import/re-export/dynamic-literal and Markdown-link current closure inventory reaches 167 blobs; this does not imply every runtime-computed asset/command reference has been resolved.

The current unit-by-unit comparison is `odd/tasks/ecosystem-reconciliation.md`; machine-checked current claims are `registry/parity/ecosystem-claims-v1.json`. GSP-06 is CLOSED at accepted provider-limited scope, while the 12 Skill rows stay PARTIAL where output evidence is absent. Memory R01–R09 retain admitted closure. Historical arrow-by-arrow text does not reopen either track. The old Phase 10 inventory's primitive PARITY labels do not establish strict ecosystem FULL.

## Honest current status

### Extension families

| Family | Status | Current limitation |
| --- | --- | --- |
| Ask-user | `PARTIAL` | Native dialog tools, bounded validation, cancel/timeout and concurrency exist. Linux offline RPC choice/cancellation passes; full TUI/questionnaire/platform journeys and mutation-consumer integration remain unverified. |
| CodeGraph | `PARTIAL` | Canonical explicit opt-in `init` plus `query`/`explore` and the read-only compatibility alias are committed at `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` and exact-range review-approved (pre-push 11/11 plus registration 6/6). Alias operations remain read-only and never auto-initialize. Real CLI/index lifecycle, restart, platform and host evidence remain open; the prior nine and new five nonblocking advisories remain bounded hardening in the same disclosed classes and do not reopen approval. |
| Agents | `PARTIAL` | Public tools and lifecycle/transport/activity behavior are incomplete. |
| Primary orchestrator | `PARTIAL` | Prompt, status, doctor, and review-boundary behavior are incomplete. |
| Workspace | `MISSING` | Workspace interaction and UI are absent. |
| Todo | `PARTIAL` | Exact durable task mirror exists; public transitions, replay and staleness remain incomplete. |
| History | `PARTIAL` | Opt-in capture, redaction-before-write, private files/locks, bounded search, export and confirmed reset are wired; selector UI, transcript/shared import, migration/scale behavior and host/platform evidence remain open. |
| Pretty/quiet | `MISSING` | Required presentation modes/tools are not implemented. |
| Resume | `PARTIAL` | Restart, Windows, and session restoration evidence is incomplete. |
| Runtime metrics | `PARTIAL` | Privacy-preserving local usage is wired. Telemetry transport, dual authorization, preview/revocation and host/network evidence are absent and decision-gated. |
| Skill registry | `PARTIAL` | Startup/watch/debounce/disable/shutdown core is locally verified; missing/recreated-source watchers and real all-platform Pi lifecycle evidence remain. |
| Banner | `PARTIAL` | A pure bounded presentation/banner projection exists; no production header/customization UI, lifecycle or host evidence exists. |
| Package exports | `PARTIAL` | Absent export target repaired to the shipped entry. Local actual packed install resolves all 28 public exports and rejects private paths; exact new-candidate multiplatform/Pi packaging evidence is still required. |

### Documentation families

| Family | Status | Current limitation |
| --- | --- | --- |
| ODD, delegation, Skills, review, authority, Windows, package install | `PARTIAL` | Existing material is incomplete or broader than evidence. |
| Launcher and workspace UI | `MISSING` | No behavior-backed guide. |
| Change attribution | `MISSING` | No behavior-backed guide. |
| Agent UI and RPC | `MISSING` | No behavior-backed guide. |
| Profiles and customization | `MISSING` | No behavior-backed guide. |
| History | `PARTIAL` | Existing capture/store behavior can be documented; selector/import/host behavior cannot yet be described as shipped. |
| Usage and telemetry | `PARTIAL` | Local usage has shipped behavior; telemetry remains decision-gated with no transport-backed guide. |

The current checked-in machine claim registry validates 16 PARTIAL / 0 MISSING / 0 FULL; the previously quoted 12 PARTIAL / 4 MISSING totals were historical. these are snapshot counts, not totals recomputed from the narrative tables above. `npm run audit:ecosystem` rejects unsupported FULL, unaccepted exclusions, absent source/implementation references, stale candidate/source bindings, drifted source rows and missing executed evidence receipts. This documentation reconciliation does not mutate or promote registry claims. Legacy historical labels are not current strict claims.

## Evidence and claim rules

A row may be `FULL` only when automated evidence covers:

1. positive behavior;
2. negative/rejection behavior;
3. failure and recovery behavior;
4. restart and cross-session behavior where state or lifecycle is observable;
5. Windows, POSIX, and macOS where path, process, terminal, packaging, or filesystem semantics matter; and
6. real Pi host plus Pi Free execution where mocks cannot prove registration, TUI, RPC, model-backed routing, compaction, transport, or session lifecycle.

Deterministic tests own pure parsing, state machines, manifests, hashes, path policy, claim validation, fixtures, snapshots, privacy filters, and mocked fault injection. Pi-host/Pi-Free probes must be minimal and used only for host/model boundaries. File presence, copied shape, mocked registration, or a passing happy path alone never proves `FULL`.

Every claim records source IDs, implementation IDs, evidence IDs, platform scope, Pi boundary, status, differences, and invalidation state. Missing required evidence forces `PARTIAL` or `MISSING`.

Every authored audit, runtime, test, documentation, workflow, and validator slice must stay below 400 additions. If a cohesive unit cannot meet that limit, split it into independently reviewable slices before writing; never compress the work or take an implicit or explicit exception.

## Dependency order

Implementation order is strict and cannot be changed by research or planning discoveries:

```text
GSP-04 -> GSP-05 -> GSP-06
                    |
                    v
MEM-01..MEM-09 strict local memory parity
                    |
                    v
ECO-01 baseline -> ECO-02 honest claims/package correction
                    |
                    v
ECO-03..ECO-08 essential runtime -> ECO-09..ECO-14 complete runtime
                    |
                    v
ECO-15 behavior-backed documentation -> ECO-16 final verification
```

- Finish GSP-04–06 first so public repository workflows, orchestration/review contracts, and verified Skill behavior are complete.
- Complete strict local memory parity second. Its canonical projects, sessions, privacy, recovery, and compaction behavior are prerequisites for ecosystem implementation.
- Only after Skills and memory are complete may ECO-01 freeze the immutable source identity and invalidation baseline, ECO-02 correct package behavior and existing claims, and ECO-03–16 implement and document the ecosystem.
- Current ecosystem research may inform plans, task boundaries, and acceptance criteria, but it never authorizes or reorders implementation ahead of GSP-04–06 and strict memory parity.
- Essential runtime establishes interaction, secure code intelligence, agent lifecycle, orchestration, todo, and registry lifecycle before launcher/workspace and customization surfaces compose them.
- Feature documentation follows implemented behavior; contract and verification documentation may land with the behavior slice it governs.

## EXT-04 ownership reconciliation

This tracker is the **sole execution backlog**. The `EP-*` identifiers in [`reference-extension-parity.md`](reference-extension-parity.md) are design aliases only and carry no execution checkboxes. Every alias has exactly one primary owner or an explicit deferred/excluded disposition:

| EP alias | Primary ECO owner or disposition | Reuse, remaining behavior and evidence boundary |
| --- | --- | --- |
| EP-001 | ECO-02A | Add only minimal package/host version, mode and registration-collision preflight before ECO-03–08. It must not wait for the future ECO-09 launcher. Reuse existing package evidence; final host/platform packaging evidence remains pending. |
| EP-002 | ECO-06 | Reuse ODD routing/tracking; add primary lifecycle and host evidence without another ODD core. |
| EP-003 | ECO-06 | Add the future primary-session sensitive-path/shell admission hook and host evidence. It is not the owner or prerequisite for the existing child authority boundary. |
| EP-004 | ECO-06 | Discover published/provider-issued contracts, then add the strict public review decoder/state machine; provider-private authority stays excluded. |
| EP-005 | ECO-06 | Add immutable candidate-view binding through public contracts and prove restart/drift behavior. |
| EP-006 | ECO-06 | Add public read-only provider status/assessment integration; absence or mismatch remains nonauthority. |
| EP-007 | ECO-06 | Add public consent/start execution through provider-issued transitions with session/TTL binding. |
| EP-008 | ECO-06 | Add public capture/recovery/collect/acknowledgement and exact burn criteria. Accepted GSP-06 provider-limited closure remains closed and is not reopened. |
| EP-009 | ECO-11 | Reuse the existing profile store; add deterministic live/restart routing, compensation and host evidence. |
| EP-010 | ECO-07 | Reuse the durable ODD task mirror without conflating it with session Todo; add the validated Todo reducer/replay. |
| EP-011 | ECO-07 | Add Todo public lifecycle and host evidence without creating a second ODD core. |
| EP-012 | ECO-05 | Reuse the existing local child isolation boundary: the runner disables package extensions/skills, supplies exact tools, and confirms the pinned authority extension before prompt dispatch; the authority excludes non-`read`/`edit`/`write` tools and confines writes. Add the public agent protocol/store/tools without depending on EP-003, and keep authority/tool-exclusion tests mandatory. |
| EP-013 | ECO-05 | Reuse the bounded runner; add hostile-stream/process cleanup and platform evidence. |
| EP-014 | ECO-05 | Add completion/query delivery, restoration and session transport over the owned lifecycle. |
| EP-015 | ECO-05 | Add foreign-root grants and mutation attribution without duplicate dispatch/authority cores. |
| EP-016 | Deferred under ECO-05 | No work while isolated children do not load package context. If package context is admitted, ECO-05 owns the filter and evidence. |
| EP-017 | Deferred under ECO-05 | Default remains no child shell and expansion requires an explicit user decision. If admitted, ECO-05 owns child-only admission, recognizer, destructive-command, wrapper and background-job prerequisites and evidence; this deferred capability does not depend on primary-session EP-003. |
| EP-018 | ECO-03 | Reuse hardened ask-user validation; add canonical compatibility, balanced host events and TUI/RPC/headless/platform evidence. |
| EP-019 | ECO-14 | Reuse pure status/presentation projections; add sanitized shell status/footer behavior without duplicating usage storage. |
| EP-020 | ECO-14 | Add minimal TUI shell/header lifecycle over the existing pure projection. |
| EP-021 | ECO-14 | Add overlays/commands and queued prompt/cancel behavior with deterministic cleanup. |
| EP-022 | ECO-14 | Add quiet rendering/wrappers only after host factory discovery preserves execution identity. |
| EP-023 | ECO-14, product/security/license gated | Optional third-party pretty integration is nonadopted until approved and does not gate adopted scope; if adopted, ECO-14 owns it. Its absence keeps full-reference parity incomplete unless explicitly adjudicated. |
| EP-024 | ECO-08 | Reuse the wired hardened skill-registry lifecycle; add tracked-output/duplicate-load protection and missing host/platform/restart evidence without another registry. |
| EP-025 | ECO-13 | Keep local usage storage; add a distinct read-only Pi-history stats collector and host evidence without replacing the private usage store. |
| EP-026 | ECO-12 | Reuse opt-in private history capture/store/search/export; add selector UI/structured fallback and host evidence. |
| EP-027 | ECO-12 | Add bounded schema/tombstone migration and platform evidence without a second private store. |
| EP-028 | ECO-12, privacy/import gated | Optional transcript/shared-history import requires an explicit home/privacy decision. It is not an incidental prerequisite and does not gate adopted scope while unadopted. |
| EP-029 | ECO-14, using ECO-09 launcher | Reuse checkpoint identity; implement the one-shot handoff only after launcher surfaces exist, then prove quit/restart/platform behavior. |
| EP-030 | **EXCLUDED by user** | NaN has no prerequisite, gate, API/credential/dependency work, or execution owner until explicit reauthorization. This narrows adopted scope only and prevents a full-reference parity claim. |
| EP-031 | ECO-13, privacy/product decision-gated | Local usage remains useful without transport. Telemetry requires dual authorization, preview/minimization/revocation and zero-network/host evidence; do not infer consent from the local store. |
| EP-032 | ECO-09 | Reconcile launcher/config/history home boundaries and migration refusal; reuse existing stores rather than creating new ones. |
| EP-033 | Deferred under ECO-13 | HERDR remains nonadopted pending external-integration/privacy approval. If adopted, ECO-13 owns the minimized transport and evidence. |
| EP-034 | ECO-16 | Run only after ECO-15A/B/C and every adopted in-scope owner. Record unsupported cells honestly; excluded/deferred optional features do not gate adopted scope, but disclosed exclusions keep full-reference parity incomplete. |

No row above changes an ECO checkbox or promotes source-only evidence. Accepted GSP-06 provider-limited and MEM R01–R09 closure remain explicit. Reconciliation must reuse existing stores, usage, registry, dispatcher and ODD cores; it must not build duplicate private infrastructure.

## Product-brief prioritization overlay

This overlay is evidence metadata on existing owners, not an execution checklist or dependency change. “Host” means observable real-host behavior; every row still requires the broader acceptance matrix where applicable. ECO-03 public dialogs and ECO-08 registry lifecycle remain minimum core prerequisites even though the brief does not emphasize them.

| Priority | Brief pages | Existing owner | Existing core to reuse / evidence gap | Observable acceptance boundary (positive; negative; recovery; host) |
| --- | --- | --- | --- | --- |
| Critical | 4, 5, 8 | ECO-06 | Reuse ODD routing, task tracking, and accepted GSP-06 boundary; public authorize/explore/classify, risk-scaled verification, logbook-plus-memory and provider-issued review lifecycle remain unproved. | Correct bounded route and durable record; reject prose/expired/mismatched authority; recover from interruption/unknown outcome without replay; real primary-session lifecycle is visible. |
| Critical | 6, 10, 21 | ECO-05 | Reuse dispatcher, bounded runner, pinned child authority and exact tool exclusion; durable background lifecycle, cancel/continue/restart and write-conflict handling remain open. | Isolated task completes with owned evidence; foreign/conflicting mutation is denied; cancellation/crash releases or quarantines capacity; real child/session restoration is observable. |
| High | 11 | ECO-10 / ECO-07 | Reuse project/session identity, mutation evidence, ODD mirror and replay validation; workspace attribution and session Todo composition remain open. | Correct actor/worktree/Todo state is shown; stale/cross-session/conflicting state is rejected; replay restores deterministically; host UI exposes attribution without authority inflation. |
| High | 12 | ECO-11 | Reuse the profile store; actual model/effort choices, precedence, live application, rollback and restart semantics lack host evidence. | Selected route follows documented precedence; unknown/partial settings fail safely; compensation restores the prior profile; live and restarted host agree. |
| Critical | 13 | ECO-04 | Reuse approved canonical and compatibility tools; real CLI/workspace index lifecycle, stale/error recovery, executable resolution and restart/platform evidence remain open. | Init/query/explore work in the intended workspace; traversal, alias auto-init and stale misuse fail closed; interrupted/stale index recovers explicitly; real CLI host result is observable. |
| High | 14 | ECO-12 / ECO-13 | Reuse private opt-in redacted history and transport-free local usage; selector/scale evidence and separately dual-consented telemetry remain open. | Opted-in local history/usage is inspectable; no capture/send occurs without the relevant consent; corrupt/revoked state recovers or fails closed; host/network observation proves privacy boundaries. |
| High | 3, 22 | ECO-02 / ECO-09 | Reuse packed-export checks and checkpoint identity; isolated-home install/setup, rollback and cross-platform paths remain unproved. | Clean isolated-home install resolves public surfaces; collision/permission/ambiguous-home cases refuse safely; rollback preserves prior state; Windows/macOS/Linux hosts are observed. |
| Constraint | 5, 17–19 | All owners / ECO-16 | Reuse each owner's receipts; latency, token, cost and error-detection figures need proportional, repeatable measurement rather than a new runtime feature. | Baseline and candidate are measured under the same workload; regressions/invalid samples are rejected; interrupted runs remain distinguishable; host receipts report distributions and limits, not promises from one-to-three runs. |
| Lower attention, required | 15 | ECO-14 | Reuse checkpoint validation and pure presentation projections; adopted pretty/quiet, startup/resume and accessible terminal behavior lack production wiring and host evidence. | Chosen modes render deterministically; non-TTY/narrow/control-text cases degrade safely; restart/corruption restores or diagnoses; real TTY/non-TTY behavior is observable. |

## Phases and task checklist

### Audit and baseline

- [x] **ECO-00 — Complete read-only ecosystem audit.** Record directional extension/doc statuses and visible inventory; make no freeze or parity claim.
- [x] **ECO-01A — Freeze extension source manifest.** Read exact tracked paths and bytes from Reference A Git objects; record commit, path, blob identity, SHA-256, family, normative anchors, and visibility; reject worktree-only/untracked inputs.
  - Initial exact objects/anchor index verified in `c6f120222089da2626e0da86a69b5c53c62564c2`; subsequent checkpoint adds stable IDs, family/visibility and validation. Anchor identities are navigation to frozen source, not implemented behavior or complete semantic contracts.
- [x] **ECO-01B — Freeze documentation and media manifests.** Record README/docs/media paths and hashes; inspect every SVG and raster asset, dimensions/frames/alpha where relevant, and human visual findings without copying excluded artwork.
  - Every source/media identity was verified from exact objects; rendered SVG and raster frames were inspected. Synthetic PNG/GIF/SVG parser fixtures and metadata/hash/identity negative tests now pass. GIF alpha is inspected over all frame control records, correcting the initial first-frame-only observation.
- [ ] **ECO-01C — Freeze import and reference closure.** Resolve static/dynamic imports, assets, docs links, command/tool references, dependencies, and normative anchors; classify absent, optional, generated, external, and unresolved edges.
  - AST imports, source-relative URL assets, HTML src/srcset, commands/tools/events and inline command references are inventoried; complete registration bodies have hash-bound anchors. Cwd-dependent resources and computed names remain explicitly unresolved. Full semantic obligations and generated/optional reference adjudication remain open; no parsed edge is silently excluded.
  - **ECO-01C-1 — Complete:** classify scanner-level computed versus cwd-dependent unresolved references, with semantic RED/GREEN and frozen-manifest compatibility tests. Scanner diagnostics must not change the authoritative source manifest or promote closure/FULL.
  - **ECO-01C-2 — Pending:** recover verified exact frozen-source bytes and adjudicate remaining optional/generated/external/reference semantics. The supplemental newer snapshot is not evidence for older frozen bytes.
  - **ECO-01C-1 checks:** worker-observed semantic RED on missing diagnostic reason, then independently observed focused GREEN 16/16; claims tests 5/5; manifest audit PASS (167 objects); claim audit PASS (16 PARTIAL, no FULL). Source and media manifests remain unchanged; zero persisted scanner `reason` fields. Scoped source/tests: 39 additions / 7 deletions. Source/test commit `95ad615a04c60b6947e1bfa813be77984efb397f` contains only `scripts/ecosystem-baseline.mjs` and `tests/ecosystem-baseline.test.ts`. Native committed-range review `review-7df0b50d7151e8cf` approved; exact acknowledgement completed and authority burned for target `sha256:5aabdb5e47911602e1fc016587398eea817e07c495e8e9a5f35cc8dafe542f5e`. Syntax and diff checks PASS. One claims-audit attempt omitted the test-only TypeScript resolver and failed dependency resolution; rerun with resolver passed. Typecheck/build and exact frozen-source recollection were not performed. Final read-only seal PASS: HEAD equaled the source/test commit, exact two-file scope and zero scoped drift were confirmed, and registry contents/statuses remained unchanged. Subsequent documentation work units are committed at `54bd5f730a4bd1bfd35dd21588f19da900e49760`, `d54326acb9ddf963edfde70a00619c7fac41359d`, and `35127605b20a46f4653259c9513718f298f2dd0f`. ECO-01C as a whole remains open; ECO-01E mapping/invalidation work follows only the relevant verified contract mappings.
- [x] **ECO-01D — Add baseline validators and fixtures.** Use synthetic Git repositories/objects and image fixtures to prove exact-byte hashing, malformed manifests, missing blobs, path escapes, cycles, duplicate IDs, broken closure, and deterministic rendering.
  - Git-object, drift and synthetic media fixtures implemented. Independent adversarial review reproduced three metadata defects; repair observed 3/3 RED then GREEN. All named validator/fixture obligations are locally verified, including lexical-shadowing and registration-anchor negatives. Complete semantic contract/asset closure remains separately assigned to ECO-01C.
- [ ] **ECO-01E — Add automatic drift detection.** Report `ADDED`, `REMOVED`, unique-hash `RENAMED`, `CONTENT_CHANGED`, dependency/reference changes, and normative-anchor changes. A scheduled/manual candidate-source check may propose a report but never adopt changes automatically; changed sources invalidate affected `FULL` rows until re-audited.
  - Report-only detector supports these classifications plus transitive importer invalidation; manual exact-commit comparison is available through `scripts/ecosystem-baseline.mjs`. Full contract/asset-edge invalidation awaits their completed mapping.

### Honest package and claims

- [ ] **ECO-02A — Repair package exports and establish minimal host preflight.** Add install/pack fixtures proving every declared public export resolves from the packed artifact and undeclared paths fail as designed. Before ECO-03–08, add only the package/host version, mode and canonical registration-collision preflight needed by EP-001; do not depend on ECO-09 launcher work.
  - **Reuse/implemented:** functional export defect repaired in `d7af2f3d80bf782ed4b2995205475e915243eb1e`; true Node resolution RED then GREEN; `verify:pack` verifies actual offline installed tarball bytes and all 28 exports.
  - **Remaining/evidence:** minimal host preflight plus exact final multiplatform packed-install and real-host registration evidence remain pending. Existing package evidence is the seam; no duplicate package registry.
- [x] **ECO-02B — Establish claim registry and validator.** Replace broad prose with evidence-linked rows and reject `FULL` without required positive, negative, failure, platform, restart/session, and Pi evidence.
  - Current registry/validator added with all 16 aggregate units, source hashes, implementation/test mappings, explicit gaps and required boundaries. FULL requires applicable executed receipt classes, exact candidate/source, receipt byte identities and no source invalidation. Positive/negative receipt and invalidation fixtures pass; independent review repaired editable flags that could lower fixed evidence minimums. Receipt consistency is not execution authenticity. This validator subunit is IMPLEMENTED / VERIFIED; remaining ECO units are not promoted by general green tests.
- [ ] **ECO-02C — Correct current claims and README maturity.** Narrow Pi-native extension, Skills, destructive-Git safety, basic FTS, compaction, review, authority, Windows, and package-install claims to observed scope; label roadmap behavior explicitly.

### Essential ecosystem runtime

- [ ] **ECO-03 — Ask-user interaction.** Implement choice/question contracts, accessible TUI, RPC transport, validation, cancellation/timeout, unavailable-host behavior, and fail-closed mutation gates.
  - **Reuse/implemented:** hardened validation, timeout/abort, late-dialog quarantine and ASEN-named tools exist. **Remaining:** EP-018 canonical translation, collision handling and balanced blocked events. **Verification:** real TUI/questionnaire, RPC, unavailable-host and Windows/macOS/Linux evidence remain pending.
- [ ] **ECO-04 — Secure CodeGraph integration.** Preserve the canonical explicit opt-in `init`/`query`/`explore` tool and read-only compatibility alias; alias operations must remain read-only and never auto-initialize.
  - **Reuse/implemented:** canonical and alias behavior is committed at `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200`; pre-push CodeGraph 11/11 and extension registration 6/6 passed. Exact committed-range review `review-093f38eea8f16cb4` approved and burned authority for `sha256:6d320e0e09873df6d1708ad4909830a2bbafebbc5fc571497b86d2ff1812dcc9`. The prior review remains historical evidence with nine advisories; five new advisories in the same classes are also nonblocking. **Remaining:** only real CLI/index lifecycle, stale-index/error/restart behavior, executable resolution, platform/host evidence and bounded advisory hardening. Do not reopen or duplicate the approved core.
- [ ] **ECO-05 — Agent lifecycle.** Implement public tools; queue, cancel, continue, persistence, session transport, activity/status, restart recovery, ownership, bounded concurrency, and terminal outcomes.
  - **Reuse/implemented:** dispatcher, bounded Pi runner, authority extension and lifecycle types exist. The runner's pinned authority confirmation and exact child tool exclusion are the current local security boundary and remain mandatory before prompt dispatch. **Remaining:** EP-012–015 public protocol/store/tools, hostile-stream/process cleanup, delivery/restoration and grants/attribution; EP-012 does not wait for ECO-06/EP-003. EP-016 package context stays deferred. EP-017 child shell also stays disabled and deferred unless a user admits it; if admitted, its child-only admission/recognizer/destructive-command/wrapper/background constraints are prerequisites within ECO-05. **Verification:** authority-before-dispatch and exact-tool rejection remain required alongside real child/session/restart/transport and OS evidence; do not build a second dispatcher or authority core.
- [ ] **ECO-06 — Primary orchestrator.** Align prompt derivation, status, doctor, routing, ODD fact enforcement, and public provider-owned review/authority boundaries without fabricating private authority.
  - **Reuse/implemented:** ODD routing/tracking, ordinary review request binding and accepted GSP-06 provider-limited closure remain intact. **Remaining:** EP-002 primary lifecycle, EP-003 primary-session sensitive-path/shell safety, and discovery-gated EP-004–008 public native review status, immutable candidate, consent/start, capture/recovery/collect/acknowledgement and exact burn contracts. EP-003 neither owns nor delays ECO-05's existing child authority/tool boundary or deferred EP-017. **Verification:** published/provider-issued contract, restart/lineage, host and failure-path evidence remain pending. Provider-private authority is excluded; do not reopen GSP-06 or create another ODD/review authority core.
- [ ] **ECO-07 — Todo and replay.** Implement durable task projection, transitions, replay, crash recovery, stale-plan detection, conflict handling, and session/project isolation over the memory core.
  - **Reuse/implemented:** exact ODD task mirroring and replay validation exist. **Remaining:** EP-010/011 session Todo reducer, hostile replay, public tool and prompt lifecycle without conflating Todo with ODD. **Verification:** crash/restart/session/branch and real-host evidence remain pending; no second ODD store.
- [ ] **ECO-08 — Skill registry lifecycle.** Complete startup refresh, deterministic watch/debounce, invalidation, disable, shutdown, diagnostics, and restart behavior while preserving GSP evidence and ASEN-owned paths.
  - **Reuse/implemented:** hardened refresh/watch/shutdown, containment and generated-output protection are wired and locally tested. **Remaining:** EP-024 tracked-target refusal, duplicate-load handling and migration classification. **Verification:** recreated-source, restart and cross-platform real-Pi evidence remain pending; keep the existing registry authoritative.

### Complete ecosystem runtime

- [ ] **ECO-09 — Launcher, homes, and setup.** Implement executable/package resolution, project/user homes, setup/link behavior, idempotency, rollback, permissions, spaces/Unicode paths, and Windows/POSIX/macOS cases.
  - **Reuse/implemented:** existing session/checkpoint validation remains the final identity gate. **Remaining:** EP-032 home-boundary reconciliation and launcher setup; provide the launcher seam later consumed by EP-029/ECO-14. **Verification:** clean install, rollback, permissions, path and all-platform evidence remain pending. EP-001 minimal preflight does not wait here.
- [ ] **ECO-10 — Change attribution and workspace UI.** Add project/worktree identity, actor/session attribution, safe concurrent updates, workspace status/actions, accessibility, narrow terminals, and restart behavior.
  - **Reuse/implemented:** preserve existing project/session identities and agent mutation evidence. **Remaining:** workspace composition and attribution UI, not duplicate ownership state. **Verification:** conflict, accessibility, narrow-terminal, restart and host/platform evidence remain pending.
- [ ] **ECO-11 — Profiles, routing, and customization.** Implement deterministic precedence, schema validation, safe overrides, routing diagnostics, live/restart semantics, unknown values, and rollback.
  - **Reuse/implemented:** the existing profile store is the persistence seam. **Remaining:** EP-009 transactional materialization/live routing, compensation and customization composition. **Verification:** host API discovery plus live/restart/platform evidence remain pending; no second profile store.
- [ ] **ECO-12 — Private prompt history.** Complete explicitly opt-in, ASEN-owned history while preserving redaction-before-write, private files/locks, concurrent writers, retention, project/session boundaries, search, export/delete and crash recovery.
  - **Reuse/implemented:** capture, redaction, private atomic store/locks, bounded search, export and confirmed reset are wired. **Remaining:** EP-026 selector and EP-027 bounded migration/compaction; EP-028 transcript/shared import is privacy/home-decision gated and optional. **Verification:** UI, concurrency/restart and host/platform evidence remain pending. Do not replace the private store or weaken corrupt-state handling.
- [ ] **ECO-13 — Usage and telemetry.** Preserve ASEN-owned privacy-preserving local usage; separately decide and, only if adopted, implement one-shot opt-in telemetry with preview, consent, minimization, bounded retry, disable/delete, and no hidden background delivery.
  - **Reuse/implemented:** local usage counters/private storage are wired and transport-free. **Remaining:** EP-025 read-only stats collector; EP-031 telemetry is privacy/product decision-gated; EP-033 HERDR is deferred. **Verification:** history-scale stats, zero-network, consent/revocation, host and platform evidence remain pending. Do not duplicate the usage store or infer transport consent.
- [ ] **ECO-14 — Resume, startup, and presentation.** Complete resume/Windows/startup state restoration, corruption recovery, banner behavior, quiet/pretty tools, non-TTY behavior, width/color/accessibility, and deterministic diagnostics.
  - **Reuse/implemented:** checkpoint validation and pure bounded presentation/banner projections exist. **Remaining:** EP-019–022 shell/TUI/quiet lifecycle and EP-029 handoff using ECO-09 launcher; EP-023 third-party pretty is product/security/license gated. **Verification:** real restart, TTY/non-TTY, host UI and Windows/macOS/Linux evidence remain pending; the current banner is projection only, not UI.

### Documentation and closure

- [ ] **ECO-15A — Author core runtime documentation.** Document ASEN-owned runtime, ODD, delegation, verification, agents, review, authority, memory, Windows, and install/configuration from shipped behavior and evidence.
  - **Evidence boundary:** reuse accepted GSP/MEM documentation and describe only shipped public behavior; public review gaps stay visible until ECO-06 evidence exists.
- [ ] **ECO-15B — Author feature documentation after behavior exists.** Cover launcher/workspace UI, change attribution, agent UI/RPC, profiles/customization, history, usage, telemetry, resume, and presentation only after corresponding runtime acceptance passes.
  - **Evidence boundary:** decision-gated or deferred features are labeled as such; source analysis is not user documentation for shipped behavior.
- [ ] **ECO-15C — Validate documentation.** Check links, commands, package examples, platform variants, claim references, screenshots/media provenance, and unsupported `FULL` language.
  - **Evidence boundary:** validate the frozen `08de420...` registry provenance separately from supplemental `6e681f...` extension analysis; do not recompute snapshot counts from prose.
- [ ] **ECO-16 — Complete strict parity verification.** After ECO-15A/B/C and all adopted in-scope owners, recompute every matrix row, run all deterministic and platform/Pi gates, record permitted branding/private-authority differences plus disclosed accepted-scope limitations, changed-line counts and rollback units, and leave every evidence gap non-`FULL`.
  - **Evidence boundary:** EP-034 aliases this gate. Nonadopted optional features do not block adopted-scope closure, but EP-030 and any other disclosed exclusion/deferment prevent a claim of full Reference A parity. No source/fixture-only evidence may promote a row.

## Acceptance matrix

| Area | Deterministic boundary | Pi host / Pi Free boundary | Required outcome |
| --- | --- | --- | --- |
| Baseline/drift | Git-object fixtures, SHA-256, closure, classification, invalidation | None | Exact reproducible manifests; no auto-adoption. |
| Package/claims | Pack/export and registry validation | Packed install smoke in real Pi host | All exports resolve; prose matches evidence. |
| Ask-user/UI | State machine, validation, RPC faults | Real TUI/RPC interaction | Positive, cancel, invalid, unavailable, and fail-closed paths. |
| CodeGraph | Root/path/process policy and fault fixtures | Real host tool registration/invocation | Secure cross-platform canonical behavior: explicit opt-in `init`, read-only `query`/`explore`, and a read-only alias that never auto-initializes. |
| Agents/orchestrator | Lifecycle/routing/authority state machines | Real sessions and Pi Free routing | Queue/cancel/continue/restart and boundary enforcement. |
| Todo/registry | Replay, staleness, watch/invalidation fixtures | Real startup/shutdown/session restart | Durable, isolated, deterministic lifecycle. |
| Launcher/workspace/profiles | Resolution, precedence, concurrency, rollback | Real install/launch/UI | Supported-platform behavior and safe failures. |
| History/usage/telemetry | Privacy, tombstones, concurrency, consent/retry fixtures | Real session capture and adopted one-shot send | Opt-in, minimized, inspectable, deletable behavior. |
| Resume/presentation | State and terminal snapshots | Real restart, Windows, TTY/non-TTY | Recovery and accessible output match contracts. |
| Documentation | Link/command/claim validators | Selected command walkthroughs | Only shipped, evidenced behavior is described. |

## GitHub/Codex handoff preparation

The documentation work units are complete; do not recreate or duplicate them. The prior handoff push completed at `e11b6a4`: local and remote SHAs were verified equal, but exact-SHA CI is currently red. That historical delivery restriction is superseded only by the bounded authorization below.

- **Verified source:** scanner classification is committed at `95ad615a04c60b6947e1bfa813be77984efb397f`; CodeGraph is committed at `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` (4 files, 353 additions / 46 deletions), with identical blobs to the prior approved candidate, pre-push 11/11 plus 6/6, and approved exact committed-range review `review-093f38eea8f16cb4`.
- **Verified documentation:** extension audit/design map `54bd5f730a4bd1bfd35dd21588f19da900e49760`, canonical ownership reconciliation/reverse map `d54326acb9ddf963edfde70a00619c7fac41359d`, and portable ECO-01C-2 route `35127605b20a46f4653259c9513718f298f2dd0f` are committed work units. Their checks preserved the 25-file coverage, 34-owner mapping, statuses, limits, source pins, and strict order.
- **Current delivery state:** source candidate `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` retains its review approval, but the later CI typecheck is RED; therefore no `FULL` or functional runtime closure is claimed. ECO-01C-2 may continue only after the CI prerequisites are repaired and exact-HEAD required CI is green.

## CI prerequisites

These bounded unblockers sit under the existing CI gates. They are not new top-level ECO owners and do not duplicate the canonical backlog.

- **CI-PREQ-01 — Pi CodeGraph type compatibility — CLOSED AT CHECKPOINT f8fbb98; FINAL CANDIDATE REVALIDATION REQUIRED.** Source commit `7246966cb2d3aef6ad95f4317a96eba3a7f076b9` preserves older/modern host compatibility: absent signals are omitted and provided signals preserved. Independent CodeGraph 12/12 and extension 6/6 passed, but these isolated compatibility probes are not full repository typechecking. Native review `review-4e8d8781fe0f2f9b` approved the committed range; acknowledgement completed and authority burned for target `sha256:e2fdf73ba42dd1feca5565654bbe98da55f948a80437c2e9ac05a7ea91518a31`. Original CI provided type RED; the first added regression failed on call count, then a supplementary post-fix exact-baseline probe demonstrated the direct absent-signal assertion RED. Full typecheck and the Ubuntu/macOS/Windows CI jobs passed for exact checkpoint `f8fbb9820219c2affe34fae27c441337616ec439`. Local dependencies remain absent; no installation was performed. Later candidates require their own CI results.
- **CI-PREQ-02 — Preserve, rename, and neutralize the 25-file / 34-alias supplement and restore its source boundary — CLOSED AT CHECKPOINT f8fbb98; FINAL CANDIDATE REVALIDATION REQUIRED.** Commit `37faf7022fd0e6b8a563bbf7d920fd6e6934b46e` independently passed deterministic documentation guards 5/5 plus tracked-boundary audit 1/1, with actual boundary count 462. Earlier review `review-7078f73f836ff282` approved its exact target but remains unacknowledged after the HEAD advance; no burn is claimed for that old target. The later combined review `review-7dc163635532f99f` includes CI-PREQ-02 and CI-PREQ-03, approved immutable range `7246966..1237e3d`, and completed exact acknowledgement/burn for its own target recorded below. Its relative-link advisory is resolved by ASEN-owned commit URLs in `reference-extension-parity.md`; the other link-coverage, policy-coupling and source-locator advisories remain nonblocking and do not reopen review. The neutral path preserves all 25 numbered source-comparison rows, seven history modules, 34 unique EP specifications and 34 canonical owner/disposition rows. Frozen Reference A remains authoritative at `08de420ca29be16b6f6bee725a30b599b061df16`; `6e681f1d08fff3092273cf305206094d15cacd18` is a supplemental later version of the same product, not a second provider/memory source or a refreeze. Historical exact locators remain retrievable from sealed comparison commit `54bd5f730a4bd1bfd35dd21588f19da900e49760`; neutral slots retain commit and line ranges without pretending the frozen manifest proves the supplemental version. GSP-06 and MEM R01–R09 closure, existing counts/statuses, and the accepted NaN exclusion remain unchanged. Do not close this prerequisite before exact-HEAD required CI passes.
- **CI-PREQ-03 — Repair literal newlines in the Pi host workflow and add deterministic contract tests — CLOSED AT CHECKPOINT f8fbb98; FINAL CANDIDATE REVALIDATION REQUIRED.** Commit `1237e3d81705886203fead7785c4ff32daece99a` contains a bounded three-file correction (76 additions / 3 deletions), including three structural tests and an external YAML-parser check: the facade step uses physical YAML lines, and pull-request filters cover the interaction-host and code-intelligence facade evidence. Original-workflow RED observed 1/3 passing and 2/3 failing; focused GREEN passes 3/3, and the external YAML 2.9 parser exposes the facade step with its own `name` and `run`. Native combined review `review-7dc163635532f99f` approved the immutable `7246966..1237e3d` CI slice; exact acknowledgement succeeded and burned authority only for target `sha256:3e1dd3fee1113a8dc5b92c798cac012791a4955eea944629bd0845cbb8222792` at revision `88d498d557d2173797e2d036e6866c8bd22440f2f0a751806dd09502f72e7ce6`. Its four advisories—link coverage, policy coupling, source locators and relative commit links—are nonblocking; only the relative ASEN links are corrected in this documentation unit. Exact-HEAD CI remains required.
- **CI-PREQ-04 — Bounded existing-lock inspection repair — DIAGNOSTICS ONLY AT `17989f7`; FINAL CI PENDING.** Baseline `f83c5ef` run `37603723779` failed `usage counters persist and concurrent increments do not lose updates` (30 concurrent increments) on the exact Windows stack at `src/io/exclusive-file-lock.ts:16`: after `open(lock, "wx")` returned `EEXIST`, inspection `readFile(lock, "utf8")` returned `EPERM`. This is not an initial-`wx` permission failure. Root deletion/recreation or transient Windows inspection interference is plausible but unproven. The bounded contract permits one local per-acquisition retry/reacquisition cycle only for inspection `EPERM`/`EACCES`; persistent inspection permission errors rethrow the original error identity/code promptly, and initial `wx` `EPERM`/`EACCES` propagates immediately. The protected operation still runs only after successful `wx`; stale-lock age/dead-PID/unchanged-content-and-file-identity deletion checks and live-owner/token-cleanup guarantees remain unchanged. Named fault tests are `an existing-lock inspection permission race retries once and reacquires`, `persistent existing-lock inspection permission errors rethrow the original error`, and `initial lock-create permission errors propagate without inspection`. The original usage concurrency test remains unchanged. Direct semantic RED observed the injected `readFile` `EPERM` at the source inspection line; persistent EPERM/EACCES cases each observed one read instead of the required two. Focused GREEN is 6/6 lock tests, including both persistent codes, and the unchanged history/usage file is 8/8 including the 30-increment test. No public seam or configuration was added. Source/test work unit `a46640d9800141afc9f22a65aca6f5769eac7449` independently passed 6/6 lock, 8/8 history/usage and 9/9 guard tests (23/23 total), plus boundary and diff audits. Native review `review-26346ca7d10b017e` approved that exact work unit; successful acknowledgement burned authority for target `sha256:57ab9147bbd928023b1567ed829467ad8dc50df5ef223f18f46114e3d61edb02`. Exact final candidate `aca1f95` then failed every CI job at TypeScript compilation with four named diagnostics in `tests/exclusive-file-lock.test.ts`: TS7006 for callback parameter `file` and TS7019 for rest parameter `args` at lines 29 and 46. No host tests ran, and downstream artifact absence is consequential rather than a separate defect. Checkpoint `f8fbb98` remains historical evidence only. The typing follow-up is limited to erased `Parameters<typeof originalReadFile>` callback tuple annotations; the reviewed source algorithm and fault seams remain unchanged. Post-change runtime checks pass 6/6 lock, 8/8 history/usage and 9/9 existing guards. Local full typecheck dependencies remain unavailable, so no local TypeScript GREEN is claimed; parent independent verification, native exact-unit review and exact-final-SHA remote CI must prove compilation. Injected cases prove fault semantics, not a real Windows-race reproduction.
  - Exact candidate `17989f7` is green for CI, Pi and architecture, except Release Gate run `37672276526`: its Windows job again failed the same 30-increment history/usage test with an initial lock-create `wx` `EPERM` at source line 12. Node 24 local Windows probing did not reproduce it: 25×30 increments produced 11,992 `wx` attempts, 11,242 `EEXIST`, zero `wx` `EPERM`, and two late unclassified permission observations. Those late observations are not confirmed new defects. Microsoft `CreateFileW` documents pending deletion as `ACCESS_DENIED`, and libuv 1.51 maps `ERROR_ACCESS_DENIED` to `EPERM`, leaving pending deletion observationally ambiguous with ACL denial. The next bounded unit therefore adds only a Windows-active, test-local observer to this same failing test; it records same-call attempt context and immediate metadata without retrying, masking, relaxing, or changing production behavior. Exact-final-SHA remote CI remains required; local success is not a real CreateFile fault reproduction.

Observed exact-SHA failures for `e11b6a4` are architecture run `37648646120`, CI runs `37648646046` and `37648638871`, release-gate run `37648646086` for the type/boundary failures, and run `37648636784` for invalid YAML with zero jobs. Additional inherited Windows uncertainty predates this handoff: baseline `f83c5ef` run `37603723779` failed `usage counters persist and concurrent increments do not lose updates` with `EPERM` while opening `usage.json.lock`. CI-PREQ-02 does not patch or adjudicate usage locking, and the three bounded prerequisite repairs do not establish complete CI recovery; that Windows gate remains pending fresh exact-HEAD CI or separate reproduction.

The bounded CI repair and documentation map were published at checkpoint `f8fbb9820219c2affe34fae27c441337616ec439`. Independent remote observation recorded SUCCESS for CI push `37666293383`, CI PR `37666300604`, architecture `37666300707`, Release Gate `37666300614`, and Pi 1.0 runtime evidence `37666300651`, including all applicable Ubuntu/macOS/Windows matrices. Pi Free Smoke `37666300605` was intentionally SKIPPED, not PASS. The subsequent lock work unit and this passive evidence seal require publication and their own exact-HEAD CI; the checkpoint result is not transferred forward. Native review of the CI-PREQ-02/03 slice is closed and acknowledged; the documentation-map selector-retention fallback and CI-PREQ-01 evidence remain as stated above. CI-PREQ-04 implementation plus exact-final-SHA required CI therefore precede ECO-01C-2; then ECO-01E and the remaining ECO-01/02 work continue in the unchanged order. Five roadmap tasks remain checked and twenty remain open; the ECO/source pins, accepted NaN exclusion, GSP/MEM closure, and requirement for canonical CI green before ECO-01C-2 remain unchanged. The current grant permits bounded ordinary CI-repair commits and normal feature-branch pushes to launch verification. Canonical parity implementation resumes only after all applicable checks pass for the final published HEAD. No install, merge, release, force operation, PR metadata mutation, secrets access, NaN work, or unrelated change is authorized.

## CI, rollback, and delivery gates

- Required per slice: focused tests, typecheck, boundary audit, claim validator, manifest/drift checks when affected, and `git diff --check`.
- Required when affected: package tarball install/export tests; Windows, Linux/POSIX, and macOS jobs; restart/multi-process tests; Pi-host/Pi-Free probes; image and docs validation.
- CI must reject stale affected `FULL` rows, changed frozen sources without an explicit reviewed baseline update, missing evidence IDs, oversized unsplit additions, forbidden external names outside the provenance exception, and remote-delivery behavior.
- Every slice has a named contract/evidence boundary and reversible migration or feature flag where state changes. Rollback must preserve prior data, disable new registration cleanly, and never replay unknown remote outcomes.
- No slice commits, pushes, publishes, releases, sends telemetry, or updates remote sources as part of verification. Delivery remains a separate human decision.

## Completion definition

Parity is complete only when every non-branding observable behavior is `FULL` with applicable evidence. Only branding, trademarks, copied artwork or text, and provider-owned private authority may be recorded as explicit differences. Missing pretty/quiet behavior, opt-in history, usage/telemetry behavior, startup/presentation behavior, workspace visuals, platform evidence, restart/session evidence, or real Pi/Pi-Free evidence keeps the affected row and overall ecosystem parity below `FULL`.
