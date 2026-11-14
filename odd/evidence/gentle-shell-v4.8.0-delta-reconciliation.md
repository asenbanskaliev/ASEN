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

## P01 discovery results (2026-11-14, subagent mwg5mavl-2-9bv6)

ASEN registers 37 commands (`src/runtime/command-catalog.ts:3-40`), 5 keymap actions (`keymaps.ts:29-35`), 24 tools, 0 CLI flags. Gentle Shell v4.8.0 registers 39 static + 1 dynamic command family, 10 keymap actions, 17+ tool call sites, 1 flag.

**Gap summary:** MATCH 8 groups, PARTIAL 7, MISSING_IN_ASEN 19 entries, EXTRA_IN_ASEN 13 entries.

**Top 5 impactful gaps:**
1. No curated grouped palette catalog (ASEN derives from live registration; GS has 23-item hand-ranked catalog)
2. 6 missing keymap actions: preset alt+l, agents.stop alt+s, agents.collapse ctrl+shift+a, jobs.collapse ctrl+shift+j, todo.collapse ctrl+shift+t, stats.view
3. 0 registered CLI flags (GS has `NO_SKILL_REGISTRY_FLAG`)
4. Banner family stub: `asen-banner` is a no-op notice; GS has 4 banner commands
5. 9 absent feature surfaces: images, vim, animations, double-esc-cancel, voice, music, design, guide, scratch, desktop

Full gap table in subagent output. Evidence is read/grep-based (CodeGraph index unavailable).

## P03 discovery results (2026-11-14, subagent mwg5mtpm-4-87to)

~22 dependency contracts mapped across 13 categories. ASEN host-API surface rooted in `extensions/asen.ts:100-101` (CommandContext + PiLike types).

**9 MANDATORY_GAP:**
1. Desktop RPC subsystem (10 files, entire IPC transport absent from ASEN)
2. `pi.events` bus (ASEN has no production use; v4.8.0 requires it for every bridge)
3. Interactive-RPC host gate (`mode==="rpc" && GENTLE_SHELL_INTERACTIVE_HOST==="1"`)
4. Guide/tour consumer (`gentle-guide.ts:62-148` vs ASEN static text only)
5. Design canvas consumer (`gentle-design.ts:96,137,143,179-192`)
6. Audio/music consumer (`gentle-music.ts:282-346`)
7. Voice consumer (`lib/voice-command.ts`)
8. `registerProvider` (ASEN uses env-only credentials; v4.8.0 has `nan-provider.ts:5`)
9. Image disk cache (`image-disk-cache.ts:26,49`, per-session keyed on `getSessionId()`)

Plus secondary: `registerMessageRenderer` (custom-message display).

**6 VERSION_RISK (Pi 1.2 → 1.5):**
1. `ui.custom` + `tui.*` keymap action-id drift
2. Hidden-message ordering: `triggerTurn:false` vs 1.5.2 append-on-turn-end
3. `--mode rpc` envelope parsing (v4.8.0 adds `extension_ui_request setWidget` control traffic)
4. `sendUserMessage` option `expandPromptTemplates` absent from ASEN PiLike
5. Function-valued `setWidget` + `getAllThemes` undeclared in ASEN types
6. Events ASEN never registers: `session_before_switch/fork/tree`, `resources_discover`, `agent_start`, `tool_execution_end`

**Top 3 priorities:**
1. Add `pi.events` usage + interactive-RPC gate + ASEN RPC command/widget publisher
2. Build `emit(channel,{context,respond})` owner bridges over existing ASEN owners (permission, profiles, jobs, agents, usage)
3. Close persistence slices: per-session image cache + ContextEvent reply-language anchor

## P02 discovery results (2026-11-14, subagent mwg5mk6w-3-9fhz)

9 pipeline stages compared. ASEN uses deterministic typed-trigger selection (`registry.ts:66-77`) with SHA256-pinned assets and re-derivation at dispatch. v4.8.0 uses model-mediated description matching with disk registry/cache/watcher.

**Key architectural difference:** ASEN is *deterministic and tamper-evident* (typed triggers → closed dependency expansion → issued context → re-derived paths → `--skill` argv). v4.8.0 is *model-mediated and discovery-based* (disk registry → effective view → prose heading → child `read`).

**v4.8.0 mechanisms missing in ASEN (7):**
1. Disk registry + cache/watcher refresh (`.atl/skill-registry.md`)
2. Effective-session-view block injection
3. Unlisted-skill detection and blocking
4. Scope labels/provenance precedence (project/user/package/global)
5. Load-time tool overlay (`add`/`remove`, drop-in dir, project override)
6. Role-instruction markdown assets with frontmatter model/thinking/mode
7. `skill_resolution` fallback taxonomy + oversized-instructions temp-file transport

**ASEN mechanisms absent in reference (intentional adaptations):**
- Selection-profile gate (`organic`) + auto-TDD suppression
- `WeakSet`-issued, task/candidate-bound, single-use selection contexts
- Re-derivation & exact path equality re-validation at dispatch
- Apply-phase + evidence gate before write grant
- SHA256-pinned runtime assets with temp staging
- Native `edit`/`write` tool authority ledger

**Top 3 impacts:**
1. Tool overlay lifecycle (P46) — ASEN cannot vary per-role toolsets declaratively
2. Role-asset loading — no scoped markdown/frontmatter resolution for agent instructions
3. Selection observability — no `skill_resolution` outcome vocabulary

**Note:** ASEN intentionally forbids `.atl` in its own skill bodies; disk registry parity would contradict an existing local contract. This must be dispositioned as approved adaptation, not a gap to close.

## P24 discovery results (2026-11-14, subagent mwg5upfx-5-7ubg)

ASEN's mode enumeration, hard-deny ladder and epoch/mode rechecks are at or above parity with v4.8.0. Gaps concentrated in lexical shell reasoning and exposure/rendering.

**9 v4.8.0 behaviors absent in ASEN:**
1. `deliveryCommandScopes` compound/subshell/background scope stack (if/fi, while/done, case/esac)
2. Delivery-mode tokenizer with attached redirections, comment/escape-newline, `blankHeredocs`
3. Directory/routing resolution (cd chains, git -C, pushd/popd, export GIT_*) + nested exec recursion
4. `readOnlyVcsSegment`/READ_ONLY_GIT/LITERAL_GIT/READ_ONLY_GH + RESERVED_WORDS wrapper walking
5. Mode badges 🔥/💥 + `Permissions: MODE` status key + banner suppression
6. Desktop RPC permission bridge (get/set methods, events, owner-adapter discovery, persist semantics)
7. Unknown-custom-tool admission (ASEN passes ungated in normal/yolo/super-yolo)
8. AUTO_MODE_NOTICE disclosure + SUPER_YOLO_DIRECTIVE enumerated never-auto-answer list
9. Canonical git-workspace mode identity + interactiveGrant/seen revocation

**Top 3 priorities:**
1. Port deliveryCommandScopes + delivery tokenizer into ASEN shell-command-syntax/destructive-command-guard
2. Add Desktop/host-mode permission bridge with owner-adapter discovery and persist events
3. Close unknown-tool hole + add mode-badge rendering

## P19 discovery results (2026-11-14, subagent mwg5uyip-6-mbdi)

ASEN applicability chain: 6 machine reason codes + 3 contradiction codes, one-use WeakMap tokens burned pre-gate, typed RED state machine with dual observation. v4.8.0 uses prose-shaped admission with content predicates and full-delegation bypass.

**Key gaps:**
1. No ASEN equivalent of disjoint-parallel-batch or context-backstop admission routes
2. No live-mode re-read per turn; ASEN mode is per-decision input
3. No external-pane escalation concept (`openProjectPaneIfMissing`)
4. Shell's `full-delegation` short-circuit has no ASEN escape hatch → blocked work can become unimplementable
5. ASEN structured/contradiction blocks leave dispatcher permanently blocked with no operator-visible re-route

## P18 discovery results (2026-11-14, subagent mwg5uyip-6-mbdi)

ASEN: durable journal + 9-phase lifecycle chain with CAS revision, exclusive file lock, `succeeded` (awaiting-review) state distinct from `done`. v4.8.0: prompt/orchestrator turn state, no CAS on todos, ceremony diet changes only prompt text (no phase-transition signal change).

**Key gaps:**
1. Shell voids parallel admission if todo call appears in same message as writers; ASEN has no same-message batch concept
2. Shell has no journal replay, no `succeeded` state; ASEN's done/succeeded split has no Shell counterpart
3. Shell's own ODD tracker has task-truth drift (pending tasks claimed implemented); not CAS-guarded
4. ASEN `recover()` maps running→blocked; Shell equivalents fail closed without persisted review state

## P20 discovery results (2026-11-14, subagent mwg5uyip-6-mbdi)

ASEN: 27 static contracts, deterministic typed-trigger selection with transitive requires closure, evidence-blocking gates. Shell: model-mediated description matching, no closure, no evidence blocking.

**Key gaps:**
1. Shell can under/over-select (no closure); asen-work-unit/asen-safe-change chain unenforceable
2. Shell has no evidence-blocking concept; verifySkillEvidence gating has no counterpart
3. Organic auto-TDD skip removes guiding skill but keeps gate; observable difference is prompt-body quality
4. Organic runs depend on model remembering RED discipline without skill body

## Combined Q2 top-3 priorities

1. **Blocked-outcome escape hatch (P19):** ASEN needs a full-delegation-equivalent bypass or blocked work becomes unimplementable
2. **Failed-test observation asymmetry (P19/P20):** Decide whether parity means Shell gains a gate or ASEN documents a quality hole
3. **Same-message batch semantics (P18):** Any ASEN→Shell delegation path emitting todo+writer silently loses admission

## P08/P09/P10 discovery results (2026-11-14, subagent mwg5ztdy-7-easa)

**P08 Rename:** ASEN has `renameProfile` (profiles.ts:31) and `renameProfileFallbacks` (profile-fallback-store.ts:100-105) but NO production caller — only tests. No rename UI in asen-profiles menu. v4.8.0 orchestrates profiles write + chains follow + pins follow + workflow remap, but swallows follower failure (documented partial-write window). NEW apply gate in v4.8.0 (single-slot Symbol) guards apply paths but NOT rename/delete.

**P09 Removal:** ASEN has active-profile rejection (profiles.ts:30) but no confirmation dialog, no pin refusal, no removal UI. v4.8.0 adds explicit confirm/cancel, pin-layer refusal, typed error codes, workflow cleanup. Removal is NOT gate-protected in either system.

**P10 Fallback chain:** ASEN editor is hardcoded to role="orchestrator" Global only (asen.ts:1528-1575). v4.8.0 has full per-row chain editor per agent including `*`, plus Desktop RPC whole-store replacement with expectedRevision. Both share ≤8 unique steps, optional thinking, role-before-* lookup.

**10 v4.8.0 behaviors absent from ASEN:**
1. Single-slot apply gate + profile_apply_busy refusal
2. Rename/delete carrying chains + pins + workflow map
3. Content-bound confirmation token / confirmation_required
4. Delete refusal while pin layer names the profile
5. Explicit delete confirmation dialog with cancel=no-op
6. Duplicate with -copy suggestion and empty-input no-op
7. Typed error codes (duplicate_name/missing_profile/invalid_name/active_profile)
8. Lossless expectedRevision whole-store write with revision_conflict
9. Stale-active marker reported, never silently cleared
10. Partial-write acknowledgment (best-effort follower + operator note)

**ASEN strengths to preserve:** cross-process hard-link lock with dead-owner reclaim, fsync, Windows EPERM rename retry.

**Top 3 priorities:**
1. Build missing rename/remove orchestrator (primitives exist unused)
2. P10 editor: add role selection including * and project scope
3. Serialization gap: process-wide single-slot gate for multi-step apply

## P26-P30 discovery results (2026-11-14, subagent mwg60clq-9-g8qn)

All five cards confirmed **NO_CONSUMER** in ASEN — inventory/registration only, no runtime execution.

**P26 Design canvas:** No consumer. All ASEN "design" references are SDLC phase artifacts. v4.8.0 has 4 stores (parts/layout/tokens/comments), server, 2 tools, Desktop RPC bridge, a11y/i18n browser assets, ~26 tests. Entirely absent from ASEN.

**P27 Guide/tour:** No consumer. ASEN `command-guide.ts` formats command metadata only; no step/popover/navigation. ⚠️ ODD claim "live guide integrated 21/21" is unsupported by runtime evidence. v4.8.0 has 18-step GuideTour with popover, keymap-aware try-line, agent-mode nonCapturing placement.

**P28 Music/audio:** No consumer. Zero audio/playback/device code in ASEN. v4.8.0 has gentle-stream pip spec, install consent (~150 MB), terminal handover (tui.stop→child→tui.start), Windows unsupported.

**P29 Voice:** No consumer. No recording/transcription runtime. v4.8.0 has push-to-talk dictation, pasteToEditor (never sent), 2-min truncation, platform-specific remediation, sha512-pinned runtimes, child-env allowlist.

**P30 Provider & fast-mode:** No consumer for either half. ASEN PiLike has no `registerProvider`; credentials are env-allowlist only. No fast-mode/tier concept. v4.8.0 has nan-provider with registerProvider, 11-model catalog, live discovery, and service_tier ("priority"/"default") via before_provider_request hook.

**All 5 remain MANDATORY_GAP.** These are feature surfaces, not bugs — implementing them requires owner prioritization decisions.

## P11/P12/P16/P17 discovery results (2026-11-14, subagent mwg60310-8-087r)

**P11 Child routing:** ASEN uses frozen deep-copy snapshots re-validated at every boundary (dispatcher.ts:59-77), with authority digest verification and env-only credentials. v4.8.0 adds Desktop RPC transport: owner-service event bus with bounded discovery (100ms), generation guard, 150ms coalesce, byte-dedupe, whitelisted DesktopAgentEntry projection. ASEN has no external control-plane transport — only TUI tools + widget. ⚠️ Naive projection would leak prompt text and writeSurfaces from ASEN snapshots.

**P12 Accepted-switch notice:** ASEN notifies parent switches via ui.notify after acceptance + identity re-check (parent-model-fallback.ts:101-108). Child switches observed but have NO durable record or human-visible notice path. v4.8.0 appends MODEL_FALLBACK_ENTRY durably, has distinct launch-swap wording, and exposes fallbackFrom/modelSource via Desktop RPC agents_update. ASEN has no launch-time cooling swap at all.

**P16 Job transitions:** ASEN has 8-state model (queued/running/interrupted/completed/failed/stopped/timed_out/flooded) with journal persistence, crash→interrupted rewrite, delivery-state ledger, and capacity-128 fail-closed bus. v4.8.0 has 4-state registry + Desktop RPC lifecycle (list_jobs/cancel_job, jobs_update push events, label safety refusing command-derived text). ASEN's stronger journal semantics (interrupted/persistenceError/delivery states) are NOT represented in any observable outcome surface.

**P17 Visible outcome projection:** ASEN notification-projection.ts filters by ui-instance+session+project equality, sha256 dedupe, 180-char cap, "unconfirmed" header, capacity-128 fail-closed. v4.8.0 uses generation counters + active-session guard, byte-identical dedupe, 150ms coalescing (never fails), response-before-event ordering on cancel.

**Top 3 priorities:**
1. P11: Any external projection must reuse ASEN authority checks and whitelist fields only (snapshots contain prompt text)
2. P12: Child-accepted switches need a durable notice path; launch-time cooling swap absent entirely
3. P16/P17: Journal semantics exist but widget silently drops outcomes under churn; verify fail-closed truthfulness

## P33/P34/P35 discovery results (2026-11-14, subagent mwg66hpj-c-n9ff)

**P33 Packaged resolution:** ASEN uses disk-only dedupe by scope rank (project<user<global), recursive walk with symlink containment. v4.8.0 adds ResolvedSkill with sourceInfo.origin:"package", mergeResolvedWithLoose + suppressedPaths so Pi-hidden skills don't resurface, and poll fallback (WATCH_FALLBACK_POLL_MS=30s) for ENOSPC/EMFILE/WSL2. ASEN has no package-origin label, no Pi runtime-resolved skill merge, no poll fallback → silent staleness where inotify is exhausted.

**P34 Key-binding edit/reload:** ASEN keymaps.ts is a faithful port of v4.8.0 lib/keymaps.ts (same schema, precedence, reserved list). BUT: edit surface is NOT wired — prepareKeymapChange/writeKeymaps exist but have no UI caller. keymaps.json is read-only in practice. v4.8.0 has keymaps-customize.ts with rows/capture/disable/reset/"Reload now" mounted in gentle-shell.ts. ASEN also has only 5 actions vs v4.8.0's 10 (missing preset, agents.stop/collapse, jobs.collapse, todo.collapse, stats.view).

**P35 Persisted startup preference:** ASEN header has no art/text/color knobs. /asen-banner ships a refusal notice. src/runtime/presentation.ts (color/banner/theme fields) is unwired dead code. /asen-presentation writes a different 2-value schema. No theme/profile persistence at all. v4.8.0 has BannerConfig with showRose/showTextLogo/color, versioned VISUAL_SCHEMA, atomic write, visual-customize-view.ts (~814 lines) with Banner/Themes/Keymaps/Profiles/Reset categories.

**Top 3 priorities:**
1. P34: Wire keymaps edit UI (library semantics already match 1:1)
2. P35: One versioned settings file + strict read-for-edit path for banner/startup prefs
3. P33: Merge Pi runtime-resolved skills + add poll fallback to RegistryLifecycle

## P13/P14/P15 discovery results (2026-11-14, subagent mwg6680q-b-zaxs)

**P13 Steer/question/reply:** ASEN has NO steer tool, NO child→parent question channel, NO reply mechanism. State machine (agent-store.ts:53) has no `waiting`/ASK edge. "Steer" exists only as terminal notice delivery mode (agent-terminal-delivery.ts:29-43). v4.8.0 has full closed-loop: subagent_send_message→steer, child messenger.query with WAITING state, reply + replyLate (bounded 16 queries/task, 64 tasks). Desktop RPC agents service is read/cancel projection only — no IPC-mediated steer.

**P14 Interrupted continuation:** ASEN uses fresh task id + prompt replay to new child (agent-store.ts:155-171), one-use atomic claim, sha256 receipt. v4.8.0 resumes child's own Pi session natively (`pi --session <path>`), preserving transcript/history. ASEN has no `completed→continue` route; v4.8.0 supports follow-up on finished tasks. ASEN continuation is automatic on owner death; v4.8.0 is user-initiated via subagent_continue.

**P15 Cross-session scope:** ASEN asen_session_consult is same-project only, per-call UI confirm, one-use 60s TTL, returns 5 metadata fields only. No prompts/transcripts/credentials. v4.8.0 orchestrator_send_message works across trusted local profile sessions, carries notifications/cursors/bounded advice (≤8192B), mandatory reason field, profile trust model. Desktop RPC adds nothing to cross-session messaging.

**Top 3 priorities:**
1. P13: Child↔parent question channel needs new store transition (running↔waiting) + query ids + journal interplay
2. P14: Native session resume instead of prompt replay requires persisting session path per task
3. P15: Declared subjects/taskAlias cheap to add; real cross-session messaging is a new authority class

## P06/P07 discovery results (2026-11-14, subagent mwg65yqy-a-4015)

**P06 Install/update:** ASEN has manifest-signature trust (stronger anchor), journal-based staging/selection/rollback, and strict downgrade refusal. v4.8.0 adds: build-metadata/go version authenticity proof, Windows busy-file publication retry, `changed:false` no-op report, rollback from any installed version (journal-less recovery), tombstone/processAlive dead-owner takeover, and update-owner resolution (~25 refusal reasons). ASEN gaps: no build-metadata proof, no Windows EBUSY retry, no journal-less rollback, no dead-owner lock takeover, no update-owner resolution.

**P07 Restore/removal:** ASEN is ahead on SQLite-consistent backup with WAL snapshot. v4.8.0 is ahead on: pre-removal plan report (own/kept/notTouched/dry-run), SIGINT/EOF interruption predicate with "nothing removed" guarantee, Windows deferred self-held binary removal, canonical-home/.pi directory guards, and post-removal config sanitization. ASEN gaps: no Ctrl-C/EOF predicate, no deferred self-removal, no pre-removal plan, no canonical-home guard beyond protectedPaths.

**Top 3 priorities:**
1. Add SIGINT/EOF predicate + non-interactive exit codes to lifecycle restore/removal
2. Pre-operation plan report for uninstallManaged + broaden guard set to canonical Pi homes
3. Journal-free rollback path from retained versions + dead-owner lock takeover/tombstone

## P25/P31 discovery results (2026-11-14, subagent mwg6fovc-e-e13k)

**P25 Local memory:** ASEN has 2 tools (search/save), context injection, delete via command-only with UI confirm. NO Engram protocol consumer — purely local SQLite core. Unwired consumers: `continueMemoryContext` (restart) and `importProject` (restore) are implemented+tested but unreachable from Pi runtime/CLI. No memory-side pruning. reply-language-anchor.ts has zero contact with memory persistence. v4.8.0 uses external Engram (mem_save/mem_search/mem_context injected); ASEN's local core is an intentional adaptation.

**P31 History restoration:** ASEN selectHistoryEntry yields id only, never text — asen.ts discards it via notify. No pasteToEditor restoration. v4.8.0 has full restoration via ctx.ui.pasteToEditor(selected.text), overlay selector with lazy windowing, tab project↔global scope, delete with confirm modal + tombstone, legacy store migration, GC on session_shutdown. Desktop RPC does NOT expose history.

**Top 3 priorities:**
1. P31: Wire history restoration — return permitted entry text and insert via host editor API (smallest fix in existing owner)
2. P25: Decide whether to wire continueMemoryContext/importProject or record as explicitly blocked
3. P25 non-goals: no mandatory Engram, no memory pruning, no Desktop-RPC history surface

## P21/P22/P23 discovery results (2026-11-14, subagent mwg6fh9m-d-51yo)

**P21 Assessment:** ASEN has inline gating only — hardcoded risk triple (severity:"high", lenses:[risk,resilience,reliability]) at ordinary-review-command.ts:157-159, never derived from native assess. review-assessment-policy.ts confirmed unused (zero production callers). v4.8.0 has full coordinator lifecycle: assess→inspect→STATUS≤24 loop, 9-outcome taxonomy, finding-claim truncation (1024B/claim, 8192B total with truncated/omitted marks), in-process reviewer with registry composition, typed failure vocabulary, frozen START intent separate from authority.

**P22 Consent/correction:** ASEN consent is candidate-bound and strictly pre-provider with re-validation. Correction uses plain path allowlist (allowedPaths = finding paths ∩ changed paths). v4.8.0 adds: correction-plan admission with `## Allowed edit surfaces` grammar + per-entry diagnosis, writer launch gated on ODD feature document or context backstop, surface inheritance for continuations, development-surface scoping, session repository authority captured synchronously, candidate-tree symlink tri-state discovery (tracks/no/unconfirmed) with ref-metadata cache eligibility.

**P23 Ack/delivery:** ASEN asen-accept-review is a todo acceptance ledger only — no native lineage/token/ACK, explicitly grants no write/merge. v4.8.0 adds: pre-delivery gate on bash (detect delivery actions, per-root RDD mode, HEAD/base identity check), mechanical conflict-marker commit refusal, structured blocker (13 categories), process-local continuation registry (64-entry), cross-boundary failure-fact reader, native ACK path with burned authority verification, reviewer-run forecast requiring explicit host presentation.

**Top 3 priorities:**
1. P23: Add pre-delivery gate + conflict-marker guard + blocker classification (mechanical, unit-testable without native authority)
2. P21: Wire parsed risk/review_due into runWorkspaceReview (replace hardcoded triple) + adopt claim truncation vocabulary
3. P22: Replace 120000-reject with symlink tri-state discovery + allowed-edit-surfaces parser

## P32/P37/P38 discovery results (2026-11-14, subagent mwg6g08x-f-89ox)

**P32 Status/integrations:** ASEN status line is flat text with truthful `cost/sub ?` and `connection:unknown` anchors. v4.8.0 refactored to groups/loose layout model returning {lines,targets,groups,loose}, profile moved to Stats section, mode badges 🔥/💥, usage windows with 3-stage degradation + click span, DesktopUsageBridge with generation fencing. ASEN has no geometry/targets, no Stats section, no usage windows. Cost/subscription `?` is intentional — do not close by copying.

**P37 Panel/detail navigation:** ASEN native-m2-navigator has keyboard-only overlay (j/k/Enter/Backspace/Tab), manual scroll clamping, opaque DTO identity selection. v4.8.0 adds persistent fold state (survives close), per-section card geometry via cardGroups(width), pointer hit routing (RailHit/dispatchPartMouse), native ScrollView with wheel delegation, per-section digest cache preventing sibling re-render. ASEN loses folds on close, has no mouse in panel/M2, no digest memo.

**P38 Palette:** ASEN complete is deliberately manual-guidance-only (never executes). Grouping is dynamic from catalog with no curated order/titles. v4.8.0 executes via sendUserMessage, has fixed 22-item curated catalog (not 23 as previously assumed), shortcut hints right-justified, Tab→key capture for rebinding. ASEN divergence (manual-only) is deliberate; parity means stated fidelity, not execution.

**Top 3 priorities:**
1. P38: Adopt curated group titles/order + shortcut hints while keeping manual-only complete
2. P32: Mirror groups/loose layout + profile-in-Stats without inventing cost/usage numbers
3. P37: Add handleMouse hits + persistent fold state to panel/M2

## P42/P44/P45 discovery results (2026-11-14, subagent mwg6pb2x-h-ce06)

**P42 Combined journeys:** Zero of five segments is admission-ready. launch/home BLOCKED (9 unported guard behaviors). profile/model/fallback BLOCKED by unwired owners (rename/remove have no production caller). task/delegate/job evidenced at source level but visible leg fails (journal semantics not projected). visible completion/error/review MISSING in part (no steer/question/reply channel, hardcoded risk triple, accept-review grants nothing). cancel/restart is the strongest segment but restart leg missing (no completed→continue route). No Desktop-mediated journey variant is expressible — RPC host surface absent.

**P44 Measurement:** GS ceremony-diet achieved parent −32%, total −20% cost reduction. ASEN has measurement primitive (pi-history-stats.ts aggregates tokens/cost per session) but NO baseline. GS saving comes from Engram/orchestrator ceremony that ASEN doesn't carry. P44 correctly deferred; next step is owner-permitted baseline run, not optimization.

**P45 Desktop RPC:** Transport uses ordinary Pi prompt `/gentle:desktop {json}`, reply via setWidget extension_ui_request. Channel lifecycle resets on session_start/shutdown. Gate: mode==="rpc" && GENTLE_SHELL_INTERACTIVE_HOST==="1". Security: env marker is only gate (stdin-equals-control boundary), mitigated by whitelisted bounded projections, no paths in responses, store identifiers only, 9-step ordered validator for writes. No server-side reconnect. ASEN would need: interactive-RPC gate, registerCommand("asen:desktop"), router with sequence/publisher-guard ordering, owner bridges reusing ASEN authority checks (snapshots contain prompt text — never project internals).

**Top 3 priorities:**
1. Wire unwired owners first (P08/P09 rename/remove, P10 editor, P31 history restore) — cheapest P42 blockers
2. Build P45 as additive read/cancel-only control plane — unblocks visible completion leg
3. Run one owner-authorized ASEN baseline with pi-history-stats for P44 gate

## P39/P41/P43 discovery results (2026-11-14, subagent mwg6p1ff-g-v74n)

**P39 Routing-editor:** ASEN route editing uses step-wise ui.select with NO width budgeting — responsive helpers exist unused. Long labels fail closed on truncating hosts (asen.ts:1373). Chains vertically unbounded. No editor/overlay integration for profiles. v4.8.0 has draft-state editor screen; RPC exposure is apply-only with content-bound token + single-slot gate. Edits via set_config refused during apply.

**P41 Customization:** ASEN asen-customize is a 6-entry inventory + one permission select. v4.8.0 declares 12 categories with preview/choice/visible()-fails-closed rows, inline input/capture/confirm that commit only when fully visible, fingerprint-bound profile actions. ASEN has no theme/banner/keymap/reset owners and no dialog-visibility contract.

**P43 Residual universe:** NOT closed. Six cards (P04, P05, P36, P40, P42, P44) have no recorded discovery. ~13 subsystem clusters remain unclosed: notifications (13 files), ask-user/questionnaire, vim (5 files), metrics/cost (10 files), session-profile stores (8 files), orchestrator family (11 files), review persistence/relay/consent remainder (~24 files), shell rendering/theme/animation, image attachments, scratch/worktree, herdr, auto-permission internals, RPC config slice. Highest-value remaining edges: notification+ask-user cluster (feeds P41/P13), desktop-rpc-config/apply-gate (feeds P39/P08-P10), shell theme/visual-preview (feeds P35/P36).

**Top 3 priorities:**
1. Wire width budgeting into profile/route/chain menus (responsive helpers exist, just unused)
2. Close notification + ask-user/dialog cluster (highest remaining value for P41/P13)
3. Trace shell theme/visual-preview files for P35/P36 closure

## P46-P50 discovery results (2026-11-14, subagent mwg6yk8f-i-v02c)

**P46 Agent tool overlay:** v4.8.0 loadToolOverlays merges agent-overlays.d/*.json → global tools.json → project .pi/gentle-ai/tools.json per-tool (add/remove). Applied at agents-config.ts:232 per parsed agent. Malformed files skipped with notice. ASEN has NO declarative per-role tool variation — roles are compile-time union, tool/skill variation computed in code. Confirmed absent.

**P47 Reply language anchor:** v4.8.0 records first 100 chars of human text, adds anchor only when context tail is automated (never mid-tool-loop), persists via context_with_system hook, survives compaction (in-memory keyed by session). Placement maintains prompt-cache invariant. ASEN has NO context/context_with_system handler, no ContextEvent import, no language persistence. Confirmed absent.

**P48 Execution surface guard:** Card premise correction — execution-surface-guard.ts is 19 lines, checks only openProjectPaneIfMissing property (non-boolean fails closed). Real writer admission (maskSecrets, parallelWriterBatch, ## Allowed edit surfaces parser) lives in bounded-writer-admission.ts. ASEN has authority-token writer admission with NO overlap in mechanism. No maskSecrets, no allowedEditSurfaces parser, no parallelWriterBatch.

**P49 Delivery conflict markers:** 344-line mechanical guard refusing git commit/sequencer --continue that adds conflict markers. Pushes NOT checked. Fail-open everywhere. Compound-command correction: NO if/fi, while/done, case/esac awareness (only ; && || | & () newline splitting). Heredoc body stripped before tokenizing. Staging prediction for git add in same command. Budgets: 5s deadline, 16MiB buffer, 200 files, 1MiB untracked. ASEN has NO mechanical commit guard. Confirmed absent.

**P50 Image disk cache:** Opt-in per-session cache at XDG_CACHE_HOME/gentle-shell/images. Privacy: 0700 dir, 0600 files. Safe path segments prevent traversal. Lifecycle: write returns path or undefined on any error, dispose removes session dir, sweepStale at startup (7-day horizon, own-file-only pattern). Paths never enter prompts — chip token binds bytes in memory, diskPath exposed only via cachedPaths() for tool lookup. ASEN has NO image-attachment path at all — card is downstream of missing prerequisite.

**Implementation priority ranking:**
1. P46 tool overlay — smallest, pure, fully unit-testable, highest value-to-risk
2. P49 conflict markers — high safety value, self-contained, fail-open, testable offline
3. P48 surface guard (19-line part) — trivial, ship immediately; writer admission needs separate design decision
4. P47 language anchor — cheap but needs Pi context_with_system event probe first
5. P50 image cache — lowest, no image-attachment prerequisite in ASEN
