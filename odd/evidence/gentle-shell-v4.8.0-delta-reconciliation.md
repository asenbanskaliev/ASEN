# Gentle Shell v4.6.0 → v4.8.0 delta reconciliation against ASEN parity plan P00–P44

**Date:** 2026-11-14
**Source:** `C:\gentle-shell` at tag `v4.8.0` (commit `3dc902975`)
**Baseline:** tag `v4.6.0` (commit `1f74e9e24`)
**Delta:** 578 commits, 580 files changed, +79,882 / −6,047 lines
**Scope:** Read-only source analysis. No ASEN code touched. No runtime execution. No parity claim.

## Summary of new subsystems and major changes

| Area | New/changed files | Nature |
|---|---|---|
| Desktop RPC | 10 new files (`lib/desktop-rpc*.ts`, `extensions/gentle-desktop-rpc.ts`, `docs/desktop-rpc.md`) | Entirely new IPC subsystem for Electron/desktop host |
| Review system | 9 new files (`review-coordinator`, `inprocess-reviewer`, `delivery-conflict-markers`, `bounded-writer-admission`, `review-candidate-symlink-scan`, `review-blocker`, `review-continuation-registry`, `review-delivery-preflight`, `review-failure-facts`, `review-relay-phase-timing`, `review-start-context`, `reviewer-stream`, `writer-batch-admission`) | Major review lifecycle expansion |
| Design canvas | 4 new files (`design-parts`, `design-canvas-assets`, `design-layout`, `design-system-tokens`) + i18n + Quality checks | Canvas maturation |
| Agent tool overlay | `agent-tool-overlay.ts`, `agent-status.ts`, `gentle-agent-status.ts` | Load-time tool injection for subagents |
| Reply language anchor | `reply-language-anchor.ts` | Harness-level language persistence |
| Image disk cache | `image-disk-cache.ts` | Per-session private image persistence |
| Execution surface guard | `execution-surface-guard.ts` | Writer scope enforcement |
| Orchestrator mode policy | `orchestrator-mode-policy.ts` | Delegation ceremony reduction |
| RDD mode control | `rdd-mode-control.ts` | Receipt-driven development toggle |
| Hidden tools | `hidden-tools.ts` | Tool visibility control |
| Herdr busy | `herdr-busy.ts` | Desktop busy-state signaling |
| Shell bar/sidebar | Significant refactor (+198/−98 shell-bar, +152/−52 sidebar-layout) | Groups/loose layout, mode badges, project segment |
| Profiles | `agent-profiles.ts` +162, `desktop-rpc-profiles.ts` +196 | Apply gate, Desktop bridge |
| Destructive guard | `destructive-command-guard.ts` +253 | Tokenizer, delivery scopes, heredoc blanking |
| Skill registry | `skill-registry.ts` +516 | ResolvedSkill interface, disk scan, scope labels |

## Card-by-card impact

### P00 — Reproducible scoped identity
- **v4.8.0 impact:** Reference version must update from 4.6.0 to 4.8.0. Pin commit changes from `1f74e9e24` to `3dc902975`. Gentle AI pin moves to 4.5.0, Engram to 3.7.2.
- **Action needed:** Rebind all reference permalinks and version declarations in the parity plan.

### P01 — Reachable public-entry graph
- **New entries in v4.8.0:** `gentle-desktop-rpc` extension, `gentle-agent-status` extension, `gentle-tps` extension, multiple new `/gentle:*` commands via Desktop RPC bridge.
- **Impact:** Command catalog enumeration must include Desktop RPC registrations. New dynamic registrations through `registerChildBackgroundJobs` and agent tool overlay.
- **Gap status:** Wider. More entry points to map.

### P02 — Instruction/asset consumption
- **Skill registry overhaul:** New `ResolvedSkill` interface with `sourceInfo`, scope labels (`resolvedScopeLabel`), disk scanning (`scanDisk`), Unicode-aware comparison. `clearEffectivePrompt` for prompt lifecycle. `unlistedEntries` detection.
- **Impact:** P02's trace of selected bodies must account for the new resolution pipeline. The old registry66–99 text observation is superseded.
- **Gap status:** Partially closed by new structured resolution; needs re-trace.

### P03 — Companion/host dependency contracts
- **Desktop RPC is a major new host dependency:** 10 files defining config, agents, jobs, permissions, profiles, usage, design bridges over IPC. `docs/desktop-rpc.md` (1253 lines) documents the protocol.
- **Image disk cache:** New per-session private directory (0700/0600 privacy contract).
- **Reply language anchor:** Harness-level dependency on human message persistence.
- **Impact:** P03 must add Desktop RPC as a first-class host dependency alongside the existing Pi TUI host. The ANCHORS_ONLY status may upgrade to SOURCE_READY for Desktop-specific consumers.
- **Gap status:** Significantly expanded. Desktop RPC is a parallel host surface.

### P04 — Genuine paired observation protocol
- **Design canvas Quality checks:** Accessibility checks with Show/Fix workflow, token inspector, All sizes preview frames. These provide new observable surfaces for paired captures.
- **Impact:** Additional capture dimensions (accessibility, token conformance, multi-size rendering). Still EXTERNALLY_BLOCKED on host permission.
- **Gap status:** More observable surfaces available; admission unchanged.

### P05 — Launcher/home behavior
- **Destructive command guard tokenizer:** Complete rewrite with `tokenize()`, `deliveryCommandScopes()`, `blankHeredocs()`. Now parses compound commands (if/fi, while/done, case/esac), subshells, background scopes, heredocs, redirects.
- **Impact:** P05's option/home-result gap analysis must account for the new tokenizer's scope-aware parsing. Invalid-value handling may differ.
- **Gap status:** Guard behavior changed; re-inspection needed.

### P08/P09 — Profile rename/removal integrity
- **Apply gate:** New shared apply gate between profiles screen and Desktop (`fix(profiles): share the apply gate`). Refuses profile store writes while apply runs. Keeps unsaved edits when gate is busy.
- **Desktop RPC profiles bridge:** `desktop-rpc-profiles.ts` (196 lines) exposes profile operations over IPC.
- **Impact:** Cross-file atomicity concerns now include the Desktop RPC channel. The apply gate is a new serialization point that P08/P09 must account for.
- **Gap status:** New concurrency constraint discovered.

### P10 — Fallback chain configuration
- **Agent profiles expansion:** `agent-profiles.ts` +162 lines. New profile application mechanics through Desktop RPC.
- **Impact:** Chain configuration now flows through two paths (TUI + Desktop RPC). P10's candidate seam must cover both.
- **Gap status:** Wider surface; same SOURCE_READY status conditional on dual-path coverage.

### P11 — Admitted child routing
- **Agent tool overlay:** `agent-tool-overlay.ts` provides load-time tool injection for subagents. `registerChildBackgroundJobs` adds IPC-based child job registration.
- **Desktop agents service:** `desktop-agents-service.ts` (294 lines) + `desktop-rpc-agents.ts` (294 lines) expose agent control over RPC.
- **Impact:** Child routing now has an IPC transport layer alongside the existing Pi process runner. P11 must trace both paths.
- **Gap status:** Significantly expanded routing topology.

### P13 — Steer/question/reply contracts
- **Reply language anchor:** `reply-language-anchor.ts` solves the language-drift problem after compaction by persisting the human's own text as an anchor. This is a new steer mechanism.
- **Desktop RPC agents:** Subagent control over IPC adds a new question/reply transport.
- **Impact:** P13's transition inventory must include IPC-mediated steer and the language anchor as a harness-level reply mechanism.
- **Gap status:** New mechanisms discovered.

### P15 — Cross-session scope
- **Desktop RPC:** Provides cross-process communication that may extend beyond same-project boundaries. `desktop-rpc.ts` (225 lines) defines the transport.
- **Impact:** P15's scope analysis must distinguish TUI same-project consult from Desktop RPC cross-process messaging.
- **Gap status:** New transport to analyze.

### P16 — Observed job transitions
- **Desktop jobs service:** `desktop-jobs-service.ts` (263 lines) + `desktop-rpc-jobs.ts` (181 lines) expose job lifecycle over RPC.
- **Register child background jobs:** IPC-based job registration from agent overlay.
- **Impact:** Job start/status/stop/crash outcomes now flow through two channels. P16 must map both.
- **Gap status:** Dual-channel job observation.

### P18 — Task/phase truth
- **Orchestrator mode policy:** `orchestrator-mode-policy.ts` reduces full-delegation ceremony. May affect phase transition observation.
- **Impact:** Phase consumer may see different signal timing. Re-inspect refresh callbacks.
- **Gap status:** Minor; re-verify.

### P19 — Applicability/exception consumers
- **Execution surface guard:** `execution-surface-guard.ts` enforces writer scope boundaries. New guard layer between applicability decision and execution.
- **Bounded writer admission:** `bounded-writer-admission.ts` with `surfaceEntry`, `maskSecrets`, `parallelWriterBatch`. Validates allowed edit surfaces before writer dispatch.
- **Impact:** P19's applicability consumer chain now includes surface validation as a distinct step. Exception handling must account for surface rejection.
- **Gap status:** New guard layer to trace.

### P21/P22/P23 — Review assessment/consent/delivery
- **Major expansion:** 9+ new review files. Key additions:
  - `review-coordinator.ts`: Host orchestration of ordinary native review with finding claim truncation (1024 bytes/claim, 8192 total).
  - `inprocess-reviewer.ts`: In-process reviewer execution (+502 lines changed).
  - `delivery-conflict-markers.ts`: Mechanical guard refusing commits that add conflict markers. Fails open on errors.
  - `review-candidate-symlink-scan.ts`: Symlink detection in candidate trees with bounded file reads.
  - `review-delivery-preflight.ts`: Pre-delivery validation.
  - `review-blocker.ts`, `review-continuation-registry.ts`, `review-failure-facts.ts`, `review-relay-phase-timing.ts`, `review-start-context.ts`: Lifecycle state machines.
  - `reviewer-stream.ts`: Streaming reviewer output.
  - `writer-batch-admission.ts`: Batch writer validation.
- **Non-blocking findings:** New provider non-blocking findings metadata decode and opt-in.
- **Impact:** P21-P23 are significantly impacted. The review lifecycle is now much richer. P23 (ack/delivery) may upgrade from EXTERNALLY_BLOCKED if the new delivery preflight and conflict-marker guard provide sufficient mechanical evidence.
- **Gap status:** Much more source to trace. Some gaps may close; new ones may appear.

### P24 — Permission-mode outcomes
- **Mode badges:** `MODE_GLYPHS = { YOLO: "🔥", "SUPER-YOLO": "💥" }` with `modeBadge()` rendering. Non-NORMAL modes get warning-colored bold badge in statusbar.
- **Push authorization memory:** `fix(permissions): remember git push authorization by operation variant`.
- **Desktop RPC permissions:** `desktop-rpc-permissions.ts` (177 lines) exposes permission mode control over IPC.
- **Destructive guard rewrite:** Tokenizer-aware scope parsing replaces simpler pattern matching.
- **Impact:** Permission mode rendering, persistence, and transport all changed. P24 must re-map actual actions/modes across TUI and Desktop surfaces.
- **Gap status:** Expanded surface; re-inspection required.

### P26 — Design consumer feasibility
- **Canvas maturation:** Parts system (`design-parts.ts`), layout engine (`design-layout.ts`), system tokens (`design-system-tokens.ts`), asset management (`design-canvas-assets.ts`). i18n support (Spanish/English). Quality/accessibility checks.
- **Desktop design service:** `desktop-design-service.ts` (233 lines) + `desktop-rpc-design.ts` (138 lines) expose canvas over RPC.
- **Impact:** P26 upgrades from ANCHORS_ONLY toward SOURCE_READY. The canvas now has real consumers, parts, quality checks, and a Desktop bridge. Mandatory discovery has much more source to work with.
- **Gap status:** Significantly reduced gap. Consumer feasibility can now be assessed from source.

### P27 — Guide/tour consumer
- **No major guide changes detected in the delta.** Existing guide infrastructure unchanged.
- **Gap status:** Unchanged. Still ANCHORS_ONLY.

### P30 — Provider and fast-mode discovery
- **Gentle AI pinned to 4.5.0** (from 4.3.1). This may change provider/fast-mode contracts.
- **Impact:** Re-inspect provider registration and fast-mode tier against the new gentle-ai version.
- **Gap status:** Version bump requires re-validation.

### P32 — Truthful usage/status/integrations
- **Shell bar refactor:** `renderShellStatusSections` now returns `{ lines, targets, groups, loose }` instead of just `{ lines, targets }`. Groups track section boundaries for click targeting. Loose rows are ungrouped content.
- **Profile moved to Stats:** Agent profile row moved from Integrations to Stats section. Integrations no longer shows profile.
- **Permission detail stays in Integrations:** `permissions` label with sanitized detail text. Mode badge only in statusbar.
- **Project segment:** New optional `project` field in statusbar extras.
- **Desktop usage service:** `desktop-usage-service.ts` (310 lines) + `desktop-rpc-usage.ts` (229 lines) expose subscription usage over RPC.
- **Impact:** P32's composed facts contract must account for the section reorganization (profile→Stats), the new groups/loose layout model, and the Desktop usage bridge.
- **Gap status:** Layout model changed; re-trace needed.

### P33 — Packaged resolution
- **Skill registry overhaul:** `ResolvedSkill` with structured source info, scope labels, disk scanning. `toResolvedEntry` conversion. `mergeResolvedWithLoose` for combining sources.
- **Impact:** Packaged resolution pipeline is more structured. P33's investigation anchors update to the new resolution functions.
- **Gap status:** Better source structure; re-trace with new APIs.

### P34 — Key-binding edit/reload
- **No major keymap changes detected.** Existing startup registration preserved.
- **Gap status:** Unchanged.

### P35 — Persisted startup preference
- **Visual customize view:** +237 lines changed. Settings persistence may have new surfaces.
- **Impact:** Re-inspect settings persistence consumer against updated customize view.
- **Gap status:** Minor re-check.

### P36 — Public persistent layout feasibility
- **Desktop RPC provides a new host surface** that may offer persistent layout capabilities not available in the TUI host.
- **Impact:** P36's feasibility assessment should include Desktop RPC as a potential layout host. Still EXTERNALLY_BLOCKED pending actual host testing.
- **Gap status:** New candidate surface; admission unchanged.

### P37 — Panel/detail navigation projection
- **Sidebar layout changes:** Groups/loose model, section collapse tracking, hover targets. `renderShellStatusSections` return type expanded.
- **Jobs view:** +209 lines changed.
- **Impact:** Panel projection must account for the new layout model. Click targets now include group boundaries.
- **Gap status:** Layout model changed; re-trace.

### P38 — Palette selected outcome
- **Command palette:** +150 lines changed.
- **Impact:** Re-inspect selection fidelity against updated palette. DIFFERENT disposition (manual help only) may need re-validation.
- **Gap status:** Minor re-check.

### P39 — Routing-editor interaction
- **Desktop RPC profiles bridge** adds a second interaction surface for profile/routing editing.
- **Apply gate serialization** affects concurrent edit semantics.
- **Impact:** P39 must cover both TUI menu and Desktop RPC profile editing paths.
- **Gap status:** Dual-surface interaction.

### P40 — Native editor/transcript dependency
- **Reply language anchor** modifies how the transcript preserves human language context.
- **Hidden tools** (`hidden-tools.ts`) controls tool visibility in the editor.
- **Impact:** Editor contract now includes language anchoring and tool visibility filtering.
- **Gap status:** New editor behaviors to discover.

### P41 — Customization/dialog contracts
- **Visual customize view** +237 lines. Design canvas i18n adds language switching to customization.
- **Impact:** Settings/customization surface expanded. Re-inspect preview/save/cancel consumers.
- **Gap status:** Expanded surface.

### P42 — Admissible combined journeys
- **Desktop RPC enables new journey paths** (profile apply over RPC, job control over RPC, agent control over RPC).
- **Impact:** Combined journeys must include Desktop-mediated paths alongside TUI paths. Still EXTERNALLY_BLOCKED.
- **Gap status:** More journey variants to eventually admit.

### P43 — Residual-universe ledger
- **42 new files** in lib/extensions. Multiple new subsystems (Desktop RPC, review expansion, design canvas, agent overlay, execution guards).
- **Impact:** Residual universe is significantly larger. Every new file needs closure in the ledger.
- **Gap status:** Expanded.

### P44 — Optional measured improvement
- **Ceremony diet:** `perf(orchestrator): cut full-delegation ceremony` is a measured performance improvement.
- **Impact:** Baseline for P44 measurement shifts.
- **Gap status:** New optimization data point.

## New cards potentially needed

| Proposed ID | Area | Rationale |
|---|---|---|
| P45 | Desktop RPC host dependency | Entirely new host surface not covered by P03's TUI-focused anchors |
| P46 | Agent tool overlay | Load-time tool injection is a new agent lifecycle mechanism |
| P47 | Reply language anchor | Harness-level language persistence not covered by P13 or P40 |
| P48 | Execution surface guard | Writer scope enforcement is a new security/lifecycle layer |
| P49 | Delivery conflict markers | Mechanical commit guard is a new delivery safety mechanism |
| P50 | Image disk cache | Per-session private image persistence with privacy contract |

## Recommended next steps

1. **Rebind P00** to v4.8.0 / `3dc902975` / gentle-ai 4.5.0 / Engram 3.7.2
2. **Add P45–P50** as DISCOVERY cards with typed dependencies
3. **Re-prioritize queues** — Desktop RPC (P45) gates P11/P13/P15/P16/P24/P39; review expansion gates P21-P23
4. **Update execution guide** — Queue 0 adds P00 rebind; Queue 1 adds P45 Desktop RPC discovery; Queue 2 adds P46-P50
5. **Preserve all existing gates** — EQ09-EQ14 frozen, FA01-FA04 unchanged, globalFull:false

## Evidence provenance

All findings from `git diff v4.6.0..v4.8.0` on `C:\gentle-shell` at tag `v4.8.0`. File:line citations verified by grep/read on the checked-out source. No runtime execution, no MCP/REA binary analysis, no ASEN source modification. This document is read-only discovery, not implementation authorization or parity certification.
