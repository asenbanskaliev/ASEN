# Ecosystem strict behavioral parity

## Goal

Deliver evidence-backed parity with Reference A for every non-branding observable ecosystem behavior, under ASEN-owned names and paths. Preserve honest `MISSING`/`PARTIAL` status until behavior is implemented and verified. Pretty/quiet behavior, opt-in history, privacy-preserving usage and telemetry, startup and presentation behavior, and workspace visuals may be later priorities, but all remain required before overall parity is `FULL`.

## Non-goals and required differences

- Do not copy branding, trademarks, artwork, prose, or external names and paths.
- Do not expose or imitate provider-owned private authority; integrate only through public, provider-issued boundaries.
- Branding, trademarks, copied artwork or text, and provider-owned private authority are the only permitted explicit behavioral-content differences.
- Internal architecture and identifiers may differ when observable behavior remains equivalent.
- This plan integrates, and does not replace, `odd/tasks/skill-contract-parity.md` or `odd/tasks/memory-strict-parity.md`.
- No phase authorizes commit, push, publication, release, automatic source adoption, or remote delivery.
- A future provenance manifest may contain the external repository locator only under a narrow, audited path exception. Ordinary documentation calls the source Reference A.

## Frozen baseline and confidence

Reference A is pinned to commit `08de420ca29be16b6f6bee725a30b599b061df16`. `registry/parity/ecosystem-sources-v1.json` now freezes 166 tracked regular Git blobs and 46 roots with exact object IDs, byte SHA-256, family/visibility/source IDs, anchor-line hashes, dependency versions and 647 parsed import/Markdown-link edges. `ecosystem-media-v1.json` records dimensions/frame/alpha metadata and visual inspection without shipping source artwork. Exact-object verification checks every media record. These are SOURCE_INSPECTED records, not runtime parity. Asset/command references beyond the parsed edge kinds and full normative contracts still need their own closure.

Verified selected inventory includes 20 extension files, including seven history files; one README plus ten documentation files; seven SVGs; one GIF and six PNGs across docs and root assets. Five PNGs belong to docs; the sixth is the root logo. Exact objects were re-collected from the pinned source clone and matched the manifest. Static AST import/re-export/dynamic-literal and Markdown-link closure reaches 166 blobs; this does not imply every runtime-computed asset/command reference has been resolved.

The current unit-by-unit comparison is `odd/tasks/ecosystem-reconciliation.md`; machine-checked current claims are `registry/parity/ecosystem-claims-v1.json`. GSP-06 is CLOSED at accepted provider-limited scope, while the 12 Skill rows stay PARTIAL where output evidence is absent. Memory R01–R09 retain admitted closure. Historical arrow-by-arrow text does not reopen either track. The old Phase 10 inventory's primitive PARITY labels do not establish strict ecosystem FULL.

## Honest current status

### Extension families

| Family | Status | Current limitation |
| --- | --- | --- |
| Ask-user | `MISSING` | No equivalent choice/question TUI, RPC, or fail-closed behavior. |
| CodeGraph | `MISSING` | No equivalent secure-root, shell-free, cross-platform integration. |
| Agents | `PARTIAL` | Public tools and lifecycle/transport/activity behavior are incomplete. |
| Primary orchestrator | `PARTIAL` | Prompt, status, doctor, and review-boundary behavior are incomplete. |
| Workspace | `MISSING` | Workspace interaction and UI are absent. |
| Todo | `MISSING` | Todo, replay, and staleness behavior are absent. |
| History | `MISSING` | Prompt history lifecycle is absent. |
| Pretty/quiet | `MISSING` | Required presentation modes/tools are not implemented. |
| Resume | `PARTIAL` | Restart, Windows, and session restoration evidence is incomplete. |
| Runtime metrics | `MISSING` | Usage and telemetry decisions/behavior are absent. |
| Skill registry | `PARTIAL` | GSP work covers a subset; startup/watch/disable/shutdown remain. |
| Banner | `MISSING` | Presentation behavior is absent. |
| Package exports | `PARTIAL` | Absent export target repaired to the shipped entry. Local actual packed install resolves all 28 public exports and rejects private paths; exact new-candidate multiplatform/Pi packaging evidence is still required. |

### Documentation families

| Family | Status | Current limitation |
| --- | --- | --- |
| ODD, delegation, Skills, review, authority, Windows, package install | `PARTIAL` | Existing material is incomplete or broader than evidence. |
| Launcher and workspace UI | `MISSING` | No behavior-backed guide. |
| Change attribution | `MISSING` | No behavior-backed guide. |
| Agent UI and RPC | `MISSING` | No behavior-backed guide. |
| Profiles and customization | `MISSING` | No behavior-backed guide. |
| History | `MISSING` | No behavior-backed guide. |
| Usage and telemetry | `MISSING` | No adopted contract or behavior-backed guide. |

Current strict claims are 10 PARTIAL / 6 MISSING / 0 FULL. `npm run audit:ecosystem` rejects unsupported FULL, unaccepted exclusions, absent source/implementation references, stale candidate/source bindings, drifted source rows and missing executed evidence receipts. Legacy historical labels are not current strict claims.

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

## Phases and task checklist

### Audit and baseline

- [x] **ECO-00 — Complete read-only ecosystem audit.** Record directional extension/doc statuses and visible inventory; make no freeze or parity claim.
- [x] **ECO-01A — Freeze extension source manifest.** Read exact tracked paths and bytes from Reference A Git objects; record commit, path, blob identity, SHA-256, family, normative anchors, and visibility; reject worktree-only/untracked inputs.
  - Initial exact objects/anchor index verified in `c6f120222089da2626e0da86a69b5c53c62564c2`; subsequent checkpoint adds stable IDs, family/visibility and validation. Anchor identities are navigation to frozen source, not implemented behavior or complete semantic contracts.
- [x] **ECO-01B — Freeze documentation and media manifests.** Record README/docs/media paths and hashes; inspect every SVG and raster asset, dimensions/frames/alpha where relevant, and human visual findings without copying excluded artwork.
  - Every source/media identity was verified from exact objects; rendered SVG and raster frames were inspected. Synthetic PNG/GIF/SVG parser fixtures and metadata/hash/identity negative tests now pass. GIF alpha is inspected over all frame control records, correcting the initial first-frame-only observation.
- [ ] **ECO-01C — Freeze import and reference closure.** Resolve static/dynamic imports, assets, docs links, command/tool references, dependencies, and normative anchors; classify absent, optional, generated, external, and unresolved edges.
  - Parsed AST imports/re-exports/dynamic-literal imports and Markdown links are closed. Runtime assets/commands and complete normative obligations remain open. No unresolved parsed edge was silently excluded.
- [ ] **ECO-01D — Add baseline validators and fixtures.** Use synthetic Git repositories/objects and image fixtures to prove exact-byte hashing, malformed manifests, missing blobs, path escapes, cycles, duplicate IDs, broken closure, and deterministic rendering.
  - Git-object, drift and synthetic media fixtures implemented. Independent adversarial review reproduced three metadata defects; repair observed 3/3 RED then GREEN. Complete contract/asset closure remains separately assigned to ECO-01C.
- [ ] **ECO-01E — Add automatic drift detection.** Report `ADDED`, `REMOVED`, unique-hash `RENAMED`, `CONTENT_CHANGED`, dependency/reference changes, and normative-anchor changes. A scheduled/manual candidate-source check may propose a report but never adopt changes automatically; changed sources invalidate affected `FULL` rows until re-audited.
  - Report-only detector supports these classifications plus transitive importer invalidation; manual exact-commit comparison is available through `scripts/ecosystem-baseline.mjs`. Full contract/asset-edge invalidation awaits their completed mapping.

### Honest package and claims

- [ ] **ECO-02A — Repair package exports.** Add install/pack fixtures proving every declared public export resolves from the packed artifact and undeclared paths fail as designed.
  - Functional defect repaired in `d7af2f3d80bf782ed4b2995205475e915243eb1e`: true Node resolution RED before correction, then GREEN; `verify:pack` now verifies actual offline installed tarball bytes and all 28 exports. Exact final multiplatform packaging checks remain pending.
- [ ] **ECO-02B — Establish claim registry and validator.** Replace broad prose with evidence-linked rows and reject `FULL` without required positive, negative, failure, platform, restart/session, and Pi evidence.
  - Current registry/validator added with all 16 aggregate units, source hashes, implementation/test mappings, explicit gaps and required boundaries. FULL requires applicable executed receipt classes, exact candidate/source, receipt byte identities and no source invalidation. Remaining ECO units are not promoted by general green tests.
- [ ] **ECO-02C — Correct current claims and README maturity.** Narrow Pi-native extension, Skills, destructive-Git safety, basic FTS, compaction, review, authority, Windows, and package-install claims to observed scope; label roadmap behavior explicitly.

### Essential ecosystem runtime

- [ ] **ECO-03 — Ask-user interaction.** Implement choice/question contracts, accessible TUI, RPC transport, validation, cancellation/timeout, unavailable-host behavior, and fail-closed mutation gates.
- [ ] **ECO-04 — Secure CodeGraph integration.** Enforce canonical project roots, no shell interpolation, bounded arguments/output, cross-platform executable resolution, stale-index/error behavior, and public read-only boundaries.
- [ ] **ECO-05 — Agent lifecycle.** Implement public tools; queue, cancel, continue, persistence, session transport, activity/status, restart recovery, ownership, bounded concurrency, and terminal outcomes.
- [ ] **ECO-06 — Primary orchestrator.** Align prompt derivation, status, doctor, routing, ODD fact enforcement, and provider-owned review/authority boundaries without fabricating private authority.
- [ ] **ECO-07 — Todo and replay.** Implement durable task projection, transitions, replay, crash recovery, stale-plan detection, conflict handling, and session/project isolation over the memory core.
- [ ] **ECO-08 — Skill registry lifecycle.** Complete startup refresh, deterministic watch/debounce, invalidation, disable, shutdown, diagnostics, and restart behavior while preserving GSP evidence and ASEN-owned paths.

### Complete ecosystem runtime

- [ ] **ECO-09 — Launcher, homes, and setup.** Implement executable/package resolution, project/user homes, setup/link behavior, idempotency, rollback, permissions, spaces/Unicode paths, and Windows/POSIX/macOS cases.
- [ ] **ECO-10 — Change attribution and workspace UI.** Add project/worktree identity, actor/session attribution, safe concurrent updates, workspace status/actions, accessibility, narrow terminals, and restart behavior.
- [ ] **ECO-11 — Profiles, routing, and customization.** Implement deterministic precedence, schema validation, safe overrides, routing diagnostics, live/restart semantics, unknown values, and rollback.
- [ ] **ECO-12 — Private prompt history.** Implement explicitly opt-in, ASEN-owned history with redaction-before-write, tombstones, concurrent writers, retention, project/session boundaries, search, export/delete, and crash recovery.
- [ ] **ECO-13 — Usage and telemetry.** Implement ASEN-owned, privacy-preserving local usage and one-shot opt-in telemetry with preview, consent, minimization, bounded retry, disable/delete, and no hidden background delivery.
- [ ] **ECO-14 — Resume, startup, and presentation.** Complete resume/Windows/startup state restoration, corruption recovery, banner behavior, quiet/pretty tools, non-TTY behavior, width/color/accessibility, and deterministic diagnostics.

### Documentation and closure

- [ ] **ECO-15A — Author core runtime documentation.** Document ASEN-owned runtime, ODD, delegation, verification, agents, review, authority, memory, Windows, and install/configuration from shipped behavior and evidence.
- [ ] **ECO-15B — Author feature documentation after behavior exists.** Cover launcher/workspace UI, change attribution, agent UI/RPC, profiles/customization, history, usage, telemetry, resume, and presentation only after corresponding runtime acceptance passes.
- [ ] **ECO-15C — Validate documentation.** Check links, commands, package examples, platform variants, claim references, screenshots/media provenance, and unsupported `FULL` language.
- [ ] **ECO-16 — Complete strict parity verification.** Recompute every matrix row, run all deterministic and platform/Pi gates, record only the permitted branding/private-authority differences, changed-line counts and rollback units, and leave every evidence gap non-`FULL`.

## Acceptance matrix

| Area | Deterministic boundary | Pi host / Pi Free boundary | Required outcome |
| --- | --- | --- | --- |
| Baseline/drift | Git-object fixtures, SHA-256, closure, classification, invalidation | None | Exact reproducible manifests; no auto-adoption. |
| Package/claims | Pack/export and registry validation | Packed install smoke in real Pi host | All exports resolve; prose matches evidence. |
| Ask-user/UI | State machine, validation, RPC faults | Real TUI/RPC interaction | Positive, cancel, invalid, unavailable, and fail-closed paths. |
| CodeGraph | Root/path/process policy and fault fixtures | Real host tool registration/invocation | Secure cross-platform read-only behavior. |
| Agents/orchestrator | Lifecycle/routing/authority state machines | Real sessions and Pi Free routing | Queue/cancel/continue/restart and boundary enforcement. |
| Todo/registry | Replay, staleness, watch/invalidation fixtures | Real startup/shutdown/session restart | Durable, isolated, deterministic lifecycle. |
| Launcher/workspace/profiles | Resolution, precedence, concurrency, rollback | Real install/launch/UI | Supported-platform behavior and safe failures. |
| History/usage/telemetry | Privacy, tombstones, concurrency, consent/retry fixtures | Real session capture and adopted one-shot send | Opt-in, minimized, inspectable, deletable behavior. |
| Resume/presentation | State and terminal snapshots | Real restart, Windows, TTY/non-TTY | Recovery and accessible output match contracts. |
| Documentation | Link/command/claim validators | Selected command walkthroughs | Only shipped, evidenced behavior is described. |

## CI, rollback, and delivery gates

- Required per slice: focused tests, typecheck, boundary audit, claim validator, manifest/drift checks when affected, and `git diff --check`.
- Required when affected: package tarball install/export tests; Windows, Linux/POSIX, and macOS jobs; restart/multi-process tests; Pi-host/Pi-Free probes; image and docs validation.
- CI must reject stale affected `FULL` rows, changed frozen sources without an explicit reviewed baseline update, missing evidence IDs, oversized unsplit additions, forbidden external names outside the provenance exception, and remote-delivery behavior.
- Every slice has a named contract/evidence boundary and reversible migration or feature flag where state changes. Rollback must preserve prior data, disable new registration cleanly, and never replay unknown remote outcomes.
- No slice commits, pushes, publishes, releases, sends telemetry, or updates remote sources as part of verification. Delivery remains a separate human decision.

## Completion definition

Parity is complete only when every non-branding observable behavior is `FULL` with applicable evidence. Only branding, trademarks, copied artwork or text, and provider-owned private authority may be recorded as explicit differences. Missing pretty/quiet behavior, opt-in history, usage/telemetry behavior, startup/presentation behavior, workspace visuals, platform evidence, restart/session evidence, or real Pi/Pi-Free evidence keeps the affected row and overall ecosystem parity below `FULL`.
