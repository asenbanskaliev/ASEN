# ASEN vs Gentle Shell — per-module difference map

**Date:** 2026-11-14
**Reference product:** `gentle-pi` **4.8.0**, `C:\gentle-shell`, tag `v4.8.0`, HEAD `3dc90297`
**Subject product:** `asen` **0.1.0**, `C:\Asen`, branch `feat/t12-integrated-acceptance-merge`, HEAD `f4bc7a90`
**Evidence class:** read-only static source analysis of two complete TypeScript repositories. No runtime execution, no build, no provider call, no parity certificate. Every verdict below is a source-level classification.

**Verdict legend**

| Verdict | Meaning |
| --- | --- |
| `EQUIV` | Both products own a module for the same operation; shape and responsibilities align. |
| `PARTIAL` | Both own the operation, but one side covers materially less (fewer states, no UI, no persistence, weaker or absent gate). |
| `MISSING` | Gentle Shell owns the operation in source; ASEN has no module for it. |
| `ASEN-ONLY` | ASEN owns the operation; Gentle Shell has no module for it. |
| `DIFFERENT` | Both address the same need through incompatible mechanisms; neither is a subset of the other. |
| `VENDOR` | The operation lives in the shared `@earendil-works/pi-*` host, not in either product. |

---

## 0. Top findings

**F-I — The parity plans are bound to a reference that no longer exists.** ASEN's parity evidence targets *Reference Shell 4.3.0*; `odd/evidence/gentle-shell-v4.8.0-delta-reconciliation.md` re-bases the cards onto 4.6.0 → 4.8.0; the local reference checkout is **4.8.0 at `3dc90297`**. Every card in `asen-gentle-shell-per-point-matrix.md` that cites a 4.3.0 permalink is now pointing at moved code. This map is derived from the 4.8.0 tree, so it is a *different baseline* than most ASEN parity statements.

**F-II — The two products are inverted, not offset.** Gentle Shell is a **presentation-and-authority extension suite** for a Pi install: 265 `lib` modules dominated by UI surfaces, rendering policy, audio/pulse, design canvas, and a review wire protocol with 81 JSON contracts. ASEN is a **process-and-governance harness**: ODD routing, TDD cycle, delivery chains, issue preparation, defect binding, evidence stores. ASEN is not "Gentle Shell minus N features"; it is a different product that shares a host.

**F-III — The missing mass in ASEN is predominantly human-facing.** Of the 80 `MISSING` rows, 48 are surfaces: shell UI/editor 17, design canvas 11, desktop RPC 8, voice 4, notifications/audio 4, stats/telemetry 4. Another 5 are agent views, 4 are installer facade, 3 are job widgets. Only 12 are backend authority: review lifecycle 7, provider contract bundle 3, contract schemas 2. That is the shape of the gap: ASEN has the engine, Gentle Shell has the cockpit.

**F-IV — ASEN's advantage is concentrated where Gentle Shell is thin.** Gentle Shell spends 2 files on ODD phase inference and 0 on delivery chains, issue preparation, or defect binding. ASEN spends 5 on ODD flow, 5 on TDD, 9 on delivery, 5 on defects, 2 on issues, and 7 on evidence. The governance layer ASEN tracks GP-01..GP-50 against is, in the reference, largely prose in `extensions/gentle-ai.ts`.

**F-V — Contract direction is opposite.** Gentle Shell ships **wire contracts** (`contracts/`: capability v1.1–v1.5, consent, projection, lens, operation, failure, correction, admitted-result, 81 files). ASEN ships **capability specifications** (`registry/`: 21 `CAP-*.yaml` + ecosystem source/claim ledgers + forensic findings, 142 files). ASEN's registry states intent; Gentle Shell's contracts state protocol. Neither substitutes for the other.

---

## 1. Entry, CLI, and bootstrap

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Program identity / name / banner | `lib/gentle-program-identity.ts`, `extensions/gentle-program-identity.ts`, `extensions/startup-banner.ts` (45 KB) | `src/cli.ts`, `src/runtime/persona.ts`, `src/runtime/presentation.ts`, `src/runtime/focus-chrome.ts` | `PARTIAL` | GS owns a persisted, customisable banner; ASEN has a fixed identity header. |
| Executable entry | `bin/gentle-shell.mjs` (128 KB), `runtime/gentle-shell.mjs` | `bin: ./dist/cli.js` → `src/cli.ts` | `DIFFERENT` | GS ships a compiled launcher; ASEN ships a `tsc` build of a CLI module. |
| Startup sequence | `lib/gentle-shell-startup-flow.ts` + `runtime/gentle-shell-startup-flow.mjs` | `src/runtime/setup.ts`, `src/runtime/lifecycle-cli.ts`, `src/runtime/launcher.ts` | `PARTIAL` | GS has an explicit ordered startup flow module; ASEN spreads initiation across setup/launcher/lifecycle. |
| Startup update check | `lib/gentle-shell-startup-update.ts` | `src/runtime/managed-update-preview.ts`, `managed-cli-version-probe.ts` | `PARTIAL` | Both probe; ASEN's probe feeds a signed acquisition path, GS's feeds a panel. |
| System prompt append | `lib/append-system-prompt.ts` | `src/runtime/request-guidance.ts`, `src/runtime/plan-context.ts` | `PARTIAL` | GS has one owner for prompt append; ASEN splits guidance vs plan context. |
| Resume hint | `lib/gentle-shell-resume-hint.ts`, `extensions/resume-hint.ts` | `src/session/pi-resume.ts`, `src/session/recovery-key.ts` | `PARTIAL` | GS hints; ASEN owns a recovery key. |
| Command catalog | `lib/command-palette-catalog.ts`, `lib/command-palette.ts` | `src/runtime/command-catalog.ts`, `command-palette.ts`, `native-command-palette.ts` | `EQUIV` | Both maintain a catalog + palette pair. |
| Command guide / help | `lib/gentle-guide.ts`, `extensions/gentle-guide.ts`, `guides` | `src/runtime/command-guide.ts`, `src/runtime/guide-tour.ts` | `PARTIAL` | GS owns a guided tour product; ASEN has a tour module without GS's registration surface. |
| Doctor / self-diagnosis | — (no doctor module; `scripts/installer-preflight`, `installer-probes`) | `src/lifecycle/doctor.ts`, `src/runtime/doctor.ts`, `src/runtime/installation-doctor.ts` | `ASEN-ONLY` | ASEN owns `CAP-LFC-002-doctrine`; GS has installer probes only. |
| Route command / dispatcher | `lib/orchestrator-work.ts`, `lib/orchestrator-mode-policy.ts` | `src/runtime/route-command.ts`, `src/runtime/plan-dispatcher.ts` | `PARTIAL` | |
| Reply language anchor | `lib/reply-language-anchor.ts` | `src/runtime/reply-language-anchor.ts` | `EQUIV` | Added to ASEN in `0d0d3e74`. |
| Request context placement | `lib/request-context-placement.ts` | `src/runtime/plan-context.ts` | `PARTIAL` | |

## 2. Launcher, install, update, uninstall

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Launcher core | `lib/gentle-shell-launcher.ts`, `runtime/gentle-shell-launcher.mjs` (59 KB) | `src/runtime/launcher.ts`, `managed-selected-launch.ts` | `DIFFERENT` | GS launches a Pi install it locates; ASEN launches a version it selects and verifies. |
| Bundled distribution | `lib/gentle-shell-bundled.ts`, `runtime/gentle-shell-bundled.mjs` (41 KB) | — | `MISSING` | ASEN has no bundled-payload path. |
| Pi import / adoption | `lib/gentle-shell-import-pi.ts`, `runtime/gentle-shell-import-pi.mjs` | — | `MISSING` | GS can adopt an existing Pi install. |
| Signed acquisition | — | `managed-trust.ts`, `managed-fetch.ts`, `managed-acquisition-copy.ts`, `-update.ts`, `-verification.ts` | `ASEN-ONLY` | 5 modules, no GS counterpart. |
| Version verification / monotonicity | — | `managed-version-verification.ts`, `managed-cli-version-probe.ts` | `ASEN-ONLY` | |
| Install | `bin/gentle-shell-install.mjs`, `scripts/bundled-install`, `scripts/installer-*` (13 files) | `src/runtime/managed-install.ts` | `DIFFERENT` | GS: scripted installer with wizard, downloads, Windows artifacts. ASEN: programmatic signed install. |
| Install wizard (interactive) | `scripts/bundled-wizard`, `scripts/install-wizard-preview`, `docs/install-wizard.md` | `src/runtime/setup.ts` | `PARTIAL` | |
| Update | `lib/gentle-shell-update-panel.ts`, `runtime/gentle-shell-update-panel.mjs`, `scripts/pi-update` | `managed-update-preview.ts`, `managed-acquisition-update.ts`, `lifecycle-cli.ts` | `PARTIAL` | GS surfaces a panel; ASEN stages and verifies. |
| Maintenance lock | — | `managed-maintenance-lock.ts` | `ASEN-ONLY` | |
| Uninstall | `lib/gentle-shell-uninstall.ts`, `runtime/gentle-shell-uninstall.mjs` (39 KB), `docs/gentle-shell-uninstall.md` | — (only `home-backup.ts`, `managed-lifecycle.ts`) | `MISSING` | GS owns a full removal flow; ASEN has no uninstall operation. |
| Backup / restore | `runtime/gentle-shell-uninstall.mjs` (backup leg) | `src/runtime/home-backup.ts`, `src/memory/project-memory-backup.ts`, `-restore-plan.ts`, `-restore-stage.ts` | `DIFFERENT` | ASEN backs up *memory*, not the installation. |
| Installer acceptance harness | `scripts/test-installer-acceptance`, `verify-installer-tap`, `verify-package-files`, `npm-pack-result` | `scripts/verify-pack-environment.mjs`, `scripts/ecosystem-package-*` | `PARTIAL` | |
| Windows startup console visibility | `docs/windows-startup-console-visibility.md` | — | `MISSING` | |

## 3. Agents, subagents, profiles, orchestrator

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Subagent runner | `lib/agents-runner.ts` (71 KB) | `src/agents/agent-runtime.ts`, `pi-process-runner.ts`, `pi-artifact-runner.ts` | `PARTIAL` | ASEN splits spawn / artifact / runtime; GS has one 71 KB runner with lifecycle, completion, reporting. |
| Tool overlay injection | `lib/agent-tool-overlay.ts` | `src/agents/tool-overlay.ts` | `EQUIV` | |
| Agent status | `lib/agent-status.ts`, `extensions/gentle-agent-status.ts` | `src/runtime/agent-inspect.ts`, `agents-panel.ts` | `PARTIAL` | |
| Agent assets / home | `lib/agent-assets.ts` (24 KB), `lib/agent-home.ts` | `src/agents/pi-authority-assets.ts` | `PARTIAL` | GS routes gentle-ai support docs by ownership key; ASEN ships authority assets. |
| Agent config | `lib/agents-config.ts` (19 KB) | `src/runtime/profile-store.ts`, `integration-profile-inspection.ts` | `PARTIAL` | |
| Agent profiles (model pin per agent) | `lib/agent-profiles.ts` (27 KB), `agent-profile-pin.ts`, `agent-model-resolution.ts` | `src/runtime/profiles.ts`, `profile-store.ts`, `profile-fallback.ts`, `profile-fallback-store.ts`, `session-profile-binding.ts` | `PARTIAL` | ASEN owns profiles + frozen session binding; GS owns per-agent model resolution and pinning. |
| Agent protocol | `lib/agents-protocol.ts` (33 KB) | `src/agents/pi-agent-tools.ts`, `dispatcher.ts` | `PARTIAL` | ASEN's protocol is Pi tool registration, not a bespoke agent protocol. |
| Agent messaging | `lib/agents-messaging.ts`, `agents-message-delivery.ts`, `agents-completion-delivery.ts`, `agents-keys.ts` | `src/agents/agent-project-access.ts` (single consult), `extensions/asen.ts:786` | `PARTIAL` | GS has cross-agent messaging; ASEN has one same-project consult with consent. |
| Agent RPC publisher | `lib/agents-rpc-publisher.ts` | — | `MISSING` | |
| Agent session transport (cross-process) | `lib/agents-session-transport.ts` (42 KB), `lib/windows-session-transport.ts`, `runtime/windows-session-transport.ps1` (73 KB) | — (uses `node-pty` directly) | `MISSING` | Different mechanism entirely. |
| Agent transcript | `lib/agents-transcript.ts` | `src/runtime/agent-store.ts`, `agent-terminal-delivery.ts` | `PARTIAL` | |
| Agent history | `lib/agents-history.ts` | `src/runtime/agent-store.ts`, `history-store.ts` | `PARTIAL` | |
| Agent report cap | `lib/agents-report-cap.ts` | `src/agents/pi-artifact-runner.ts` (bounded output) | `PARTIAL` | |
| Agent completion delivery | `lib/agents-completion-delivery.ts` | `src/runtime/agent-notification-journal.ts`, `task-agent-reconciler.ts` | `PARTIAL` | |
| Thread view | `lib/agents-thread-view.ts` | — | `MISSING` | |
| Agents view / layout | `lib/agents-view.ts`, `agents-view-layout.ts` | `src/runtime/agents-panel.ts` | `PARTIAL` | |
| Agents widget (transcript-embedded) | `lib/agents-widget.ts` | — | `MISSING` | |
| Task ↔ agent binding | — | `src/runtime/task-agent-coordinator.ts`, `task-agent-link-store.ts`, `trusted-task-agent-binder.ts`, `task-store.ts` | `ASEN-ONLY` | |
| Interrupted agent continuation | `lib/agents-history.ts` (partial) | `src/agents/interrupted-explorer-continuation.ts` | `ASEN-ONLY` | |
| Dispatcher / delegation admission | `lib/bounded-writer-admission.ts`, `writer-batch-admission.ts`, `writer-surfaces.ts` | `src/agents/dispatcher.ts`, `src/runtime/parallel-writer-readiness.ts`, `workspace-writer-lease.ts` | `PARTIAL` | |
| Orchestrator state / presence | `lib/orchestrator-state.ts`, `orchestrator-presence.ts` | `src/orchestration/orchestrator.ts` | `PARTIAL` | |
| Orchestrator discovery / fallback | `lib/orchestrator-discovery.ts`, `orchestrator-fallback.ts`, `orchestrator-alias.ts` | `src/runtime/profile-fallback.ts`, `parent-model-fallback.ts`, `model-fallback-policy.ts` | `PARTIAL` | |
| Orchestrator consultation | `lib/orchestrator-consultation.ts`, `orchestrator-helper.ts`, `orchestrator-helper-consent.ts` | `src/agents/agent-project-access.ts`, `src/interaction/ask-user.ts` | `PARTIAL` | |
| Orchestrator mode policy | `lib/orchestrator-mode-policy.ts` | `src/flow/odd-routing.ts`, `src/runtime/fast-mode-policy.ts` | `DIFFERENT` | GS reduces delegation ceremony; ASEN routes by ODD task size. |
| Orchestrator catalog / scope | `lib/orchestrator-catalog.ts`, `orchestrator-scope.ts` | `src/orchestration/executable-plan.ts` | `PARTIAL` | |
| Orchestrator work search / card | `lib/orchestrator-work.ts`, `-work-search.ts`, `-tool-card.ts`, `-message-card.ts` | `src/runtime/native-work-panel.ts`, `presentation.ts` | `PARTIAL` | |
| Child context files | `lib/child-context-files.ts`, `extensions/child-context.ts`, `child-safety.ts` | `src/agents/pi-process-runner.ts` | `PARTIAL` | |
| Child package injection | `lib/child-package-injection.ts`, `runtime/child-package-injection.mjs` | — | `MISSING` | |
| Explorer / writer budget | `lib/exploration-budget.ts`, `context-backstop.ts`, `context-threshold.ts` | `src/runtime/explorer-budget.ts`, `explorer-read-policy.ts` | `PARTIAL` | GS also owns context backstop + threshold; ASEN does not. |
| Background subagent policy | `lib/background-subagents-policy.ts` | `src/runtime/background-jobs.ts` | `PARTIAL` | |

## 4. Review and RDD authority

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Ordinary review policy | `lib/review-policy-ordinary.ts`, `review-triggers.ts` | `src/review/ordinary-review-controller.ts`, `ordinary-review-command.ts`, `review-assessment-policy.ts` | `PARTIAL` | |
| Judgment-day / dual review | `lib/review-policy-judgment-day.ts` | `src/review/dual-review.ts`, `dual-rejudgment.ts` | `EQUIV` | |
| Risk assessment | `lib/review-risk.ts`, `review-risk-assessment.ts`, `runtime/review-risk-assessment.mjs` (22 KB) | `src/review/review-risk.ts`, `src/review/review-assessment-policy.ts` | `PARTIAL` | GS ships a compiled assessor + CLI; ASEN has policy + risk model. |
| Native review authority | `lib/native-review-cli.ts`, `runtime/native-review-cli.mjs` (168 KB) | `src/review/native-rdd-control.ts`, `native-rdd-result.ts` | `PARTIAL` | GS *is* the native review implementation; ASEN invokes and interprets. |
| Authority quarantine | `lib/native-review-authority-quarantine.ts` | — | `MISSING` | |
| Review transaction / lineage freeze | `lib/review-transaction.ts`, `review-canonical.ts`, `review-lock.ts` | `src/review/workspace-review-session.ts`, `workspace-review-projection.ts` | `PARTIAL` | ASEN freezes a workspace projection, not a transaction with lineage+revision+target tokens. |
| Review object store | `lib/review-object-store.ts`, `review-repository.ts` | `src/review/review-session.ts` | `PARTIAL` | |
| Review snapshot | `lib/review-snapshot.ts`, `review-start-context.ts` | `src/review/review-tree-inspection.ts`, `review-tree-paths.ts` | `PARTIAL` | |
| Review integration v2 (wire) | `lib/review-integration-v2.ts`, `review-compact-contract.ts`, `review-relay-contract.ts`, `review-host-relay.ts`, `runtime/review-integration-v2.mjs` (165 KB) | `src/review/` consumes the external contract; no in-repo relay | `MISSING` | ASEN calls `gentle-ai review`; GS implements the relay. |
| Consent UI | `lib/review-consent-ui.ts`, `-consent-component.ts`, `-consent-latch.ts` | — (delegated to external CLI) | `MISSING` | |
| Correction lifecycle | `lib/review-correction-lifecycle.ts`, `review-continuation-registry.ts`, `review-last-event-controller.ts` | `src/review/bounded-correction.ts` | `PARTIAL` | ASEN has the bounded-correction budget, not the continuation registry. |
| Delivery preflight | `lib/review-delivery-preflight.ts` | `src/review/delivery-preflight.ts` | `EQUIV` | |
| Publication gate | `lib/review-publication-gate.ts` | `src/review/review.ts` (informational outcome) | `DIFFERENT` | GS gates publication; ASEN explicitly refuses to derive delivery authority from review. |
| Reviewer stream | `lib/reviewer-stream.ts`, `lib/inprocess-reviewer.ts` | `src/review/pi-model-reviewer.ts` | `PARTIAL` | |
| Review blocker | `lib/review-blocker.ts`, `review-failure-facts.ts` | `src/review/review-session.ts` | `PARTIAL` | |
| Candidate view / ownership | `lib/review-candidate-view.ts`, `review-candidate-view-owner.ts`, `review-sidebar-state.ts` | `src/review/review-view.ts`, `src/runtime/review-panel.ts` | `PARTIAL` | |
| Candidate symlink scan | `lib/review-candidate-symlink-scan.ts` | `src/review/review-tree-paths.ts` (path guards) | `PARTIAL` | |
| Last-event closure | `lib/review-last-event-controller.ts`, `contracts/last-event-closure.schema.json` | — | `MISSING` | |
| Reminder receipt | `lib/review-reminder-receipt.ts` | — | `MISSING` | |
| Standing permission (session) | `lib/review-session-standing-permission.ts`, `-ipc.ts` | `src/security/permission-session.ts` | `PARTIAL` | |
| RDD mode control | `lib/rdd-mode-control.ts` | `src/review/native-rdd-control.ts` | `EQUIV` | |
| Verifier admission / settle | `lib/verifier-admission.ts`, `verifier-settle-reminder.ts` | `src/verify/verifier.ts` | `PARTIAL` | |
| Review graph schema | `lib/review-graph-schema.ts` | — | `MISSING` | |
| Legacy detector | `lib/review-legacy-detector.ts` | — | `MISSING` | |
| Review execution evidence | — | `src/evidence/review-execution.ts` | `ASEN-ONLY` | |

## 5. Memory

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Memory store | none owned — Engram injected via prompt protocol (`docs/`, `prompts/`) | `src/memory/sqlite-store.ts`, `library.ts`, `types.ts` | `ASEN-ONLY` | ASEN owns a local SQLite memory core; GS depends on an external Engram binary (`bin/engram-guard`). |
| Project resolution | — | `src/memory/project-resolution.ts` | `ASEN-ONLY` | |
| Passive capture | — | `src/memory/passive-capture.ts` | `ASEN-ONLY` | |
| Context assembly | — | `src/memory/context.ts` | `ASEN-ONLY` | |
| Compaction recovery | — | `src/memory/recovery.ts` | `ASEN-ONLY` | |
| Export validation | — | `src/memory/export-validation.ts` | `ASEN-ONLY` | |
| Git sync | — | `src/memory/git-sync.ts` | `ASEN-ONLY` | |
| Pi integration | — | `src/memory/pi-integration.ts` | `ASEN-ONLY` | |
| Project memory backup / restore | — | `src/memory/project-memory-backup.ts`, `-restore-plan.ts`, `-restore-stage.ts`, `src/runtime/project-memory-backup-preview.ts` | `ASEN-ONLY` | |
| Engram guard binary | `bin/engram-guard` | — | `MISSING` | GS ships a guard wrapper; ASEN has no equivalent. |

## 6. Skills and assets

| Operation | Gentle Shell | ASEN | Verdict | Note |
| --- | --- | --- | --- | --- |
| Skill registry | `extensions/skill-registry.ts` (39 KB) | `src/skills/registry.ts`, `generated-registry.ts`, `registry-lifecycle.ts` | `PARTIAL` | GS single 39 KB extension; ASEN splits registry / generated snapshot / lifecycle. |
| Skill discovery | same | `src/skills/discovery.ts`, `src/interaction/pi-tools.ts` | `PARTIAL` | |
| Skill context assembly | `lib/agent-assets.ts` ownership routing | `src/skills/context.ts`, `document.ts` | `EQUIV` | |
| Bundled skill set | 15 skills | 27 `asen-*` skills | `DIFFERENT` | Different catalogues and naming. |
| Skill style guide | `docs/skill-style-guide.md` | `docs/skill-style-guide.md` | `EQUIV` | |
| Auxiliary assets | `lib/agent-assets.ts`, `assets/` (66 files) | `registry/` (142 files) | `DIFFERENT` | GS ships assets; ASEN ships capability specs + ledgers. |
| CodeGraph tools | `extensions/codegraph-tools.ts` | `src/interaction/code-intelligence.ts`, `codegraph-local-exclude.ts` | `EQUIV` | |

## 7. Design canvas

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Canvas server | `lib/design-canvas-server.ts`, `runtime/design-canvas-assets.mjs` | — | `MISSING` |
| Canvas assets | `lib/design-canvas-assets.ts` | — | `MISSING` |
| Layout model | `lib/design-layout.ts` | — | `MISSING` |
| Parts / components | `lib/design-parts.ts` | — | `MISSING` |
| Sources | `lib/design-sources.ts` | — | `MISSING` |
| Comments | `lib/design-comments.ts` | — | `MISSING` |
| Handoffs | `lib/design-handoffs.ts` | — | `MISSING` |
| Design system tokens | `lib/design-system-tokens.ts` | — | `MISSING` |
| Open in browser | `lib/design-open-browser.ts` | — | `MISSING` |
| Design extension surface | `extensions/gentle-design.ts`, `lib/gentle-design.ts` | — | `MISSING` |
| Desktop design service | `lib/desktop-design-service.ts`, `desktop-rpc-design.ts` | — | `MISSING` |

## 8. Voice

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Push-to-talk | `lib/voice-push-to-talk.ts` | — | `MISSING` |
| Session lifecycle | `lib/voice-session.ts` | `src/runtime/voice-dictation.ts` | `PARTIAL` |
| Command routing | `lib/voice-command.ts` | `src/runtime/voice-dictation.ts` | `PARTIAL` |
| Platform adapter | `lib/voice-platform.ts` | `src/platform/platform.ts` | `PARTIAL` |
| Install / provisioning | `lib/voice-install.ts`, `scripts/voice-worker` | — | `MISSING` |
| Settings / UI | `lib/voice-settings.ts`, `voice-ui.ts`, `extensions/gentle-voice.ts` | — | `MISSING` |
| Artifacts / retention | `lib/voice-artifacts.ts` | — | `MISSING` |

## 9. Notifications, audio, pulse

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Notification service | `lib/notification-service.ts`, `extensions/gentle-notifications.ts` | `src/runtime/session-notifications.ts` | `PARTIAL` |
| Event model | `lib/notification-events.ts` | `src/runtime/agent-notification-journal.ts` | `PARTIAL` |
| Policy | `lib/notification-policy.ts` | `src/runtime/notification-projection.ts` | `PARTIAL` |
| Scheduler | `lib/notification-scheduler.ts` | `src/runtime/session-notifications.ts` | `PARTIAL` |
| Audio playback | `lib/notification-audio.ts`, `-audio-native.ts`, `-audio-windows.ts` | — | `MISSING` |
| Customisation | `lib/notification-customize.ts`, `notification-ui.ts` | — | `MISSING` |
| Pulse protocol | `lib/notification-pulse-protocol.ts`, `-pulse-client.ts`, `-pulse-stream.ts`, `-pulse-worker.ts` | — | `MISSING` |
| Sound docs | `docs/sound-notifications.md`, `sound-notifications-proposal.md` | — | `MISSING` |

## 10. Background jobs

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Job engine | `lib/background-jobs.ts`, `background-monitor.ts` | `src/runtime/background-jobs.ts` | `PARTIAL` |
| Job tools | `lib/background-jobs-tools.ts` | `src/runtime/background-job-tools.ts` | `EQUIV` |
| Job journal | — | `src/runtime/background-job-journal.ts` | `ASEN-ONLY` |
| Authorized retry | — | `src/runtime/authorized-job-retry.ts` | `ASEN-ONLY` |
| Job inspection | — | `src/runtime/job-inspect.ts` | `ASEN-ONLY` |
| Cache warming | `lib/background-cache-warming.ts` | — | `MISSING` |
| Jobs view / widget | `lib/jobs-view.ts`, `jobs-widget.ts`, `jobs-sidebar-state.ts` | — | `MISSING` |
| Desktop jobs service | `lib/desktop-jobs-service.ts`, `desktop-rpc-jobs.ts` | — | `MISSING` |

## 11. History

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| History store | `extensions/history/store.ts` (39 KB) | `src/runtime/history-store.ts` | `PARTIAL` |
| History index | `extensions/history/index.ts` (51 KB) | `src/runtime/history.ts` | `PARTIAL` |
| Selector UI / helpers | `extensions/history/selector-helpers.ts`, `hide-prompts.ts` | `src/runtime/history-selector.ts`, `history-command.ts` | `PARTIAL` |
| Session scan | `extensions/history/session-scan.ts` | `src/runtime/workspace-snapshot.ts` | `PARTIAL` |
| Shared history load | `extensions/history/load-shared-history.ts` | `src/runtime/shared-session-directory.ts` | `PARTIAL` |
| Capture policy | `lib/history-capture-policy.ts` | — | `MISSING` |
| Pi history stats | — | `src/stats/pi-history-command.ts`, `pi-history-stats.ts` | `ASEN-ONLY` |

## 12. Permissions and security

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Permission mode policy | `lib/permission-mode-policy.ts`, `docs/permission-modes.md` | `src/security/permission-mode-policy.ts`, `normal-shell-policy.ts` | `EQUIV` |
| Destructive command guard | `lib/destructive-command-guard.ts` | `src/security/destructive-command-guard.ts`, `src/repository/operation-policy.ts` | `EQUIV` |
| Execution surface guard | `lib/execution-surface-guard.ts` | `src/security/execution-surface-guard.ts` | `EQUIV` |
| Auto-permission classifier | `lib/auto-permission-classifier.ts`, `-tool-context.ts`, `-evidence.ts`, `-memory.ts`, `-runtime.ts` | `src/security/auto-permission-reviewer.ts`, `auto-permission-evidence.ts`, `auto-tool-context.ts` | `PARTIAL` | ASEN lacks a persisted auto-permission memory. |
| Auto permission answers | `lib/auto-permission-answers.ts`, `extensions/ask-user-choice.ts`, `ask-user-question.ts` | `src/interaction/ask-user.ts` | `PARTIAL` |
| YOLO session policy | `lib/yolo-session-policy.ts`, `yolo-temp-scratch.ts`, `docs/yolo-mode.md` | `src/security/yolo-delivery-policy.ts`, `yolo-temp-scratch.ts` | `EQUIV` |
| Foreign target grants | `lib/foreign-target-grants.ts` | — | `MISSING` |
| Session messaging grants | `lib/session-messaging-grants.ts` | `src/agents/agent-project-access.ts` | `PARTIAL` |
| Path safety | — | `src/security/path-safety.ts` | `ASEN-ONLY` |
| Secret redaction | — | `src/security/redact.ts` | `ASEN-ONLY` |
| Shell command syntax parsing | — | `src/security/shell-command-syntax.ts` | `ASEN-ONLY` |
| Primary tool policy | — | `src/security/primary-tool-policy.ts` | `ASEN-ONLY` |
| Scope policy | — | `src/policies/scopes.ts` | `ASEN-ONLY` |
| Conflict-marker guard | `lib/delivery-conflict-markers.ts` | `src/security/delivery-conflict-markers.ts` | `EQUIV` |
| Session permission store | `lib/review-session-standing-permission.ts` | `src/security/permission-session.ts` | `EQUIV` |
| Threat model doc | — | `docs/threat-model.md` | `ASEN-ONLY` |

## 13. Providers, models, routing

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Provider registry | `lib/provider-contract-bundle.ts`, `contracts/provider-contract.lock.json` | `src/runtime/provider-registry.ts` | `PARTIAL` |
| Model discovery | `lib/orchestrator-catalog.ts`, `lib/nan-provider.ts`, `extensions/nan-provider.ts` | `src/runtime/provider-registry.ts` | `PARTIAL` |
| Model fallback policy | `lib/model-fallback-policy.ts`, `-notice.ts`, `-store.ts` | `src/runtime/model-fallback-policy.ts`, `model-fallback-notice.ts`, `profile-fallback-store.ts` | `EQUIV` |
| Model fallback notice UI | `lib/model-fallback-notice.ts` | `src/runtime/model-fallback-notice.ts`, `parent-model-fallback.ts` | `EQUIV` |
| Model routing authority | `lib/model-routing-authority.ts` | `src/runtime/provider-registry.ts` | `PARTIAL` |
| Price ratio | `lib/model-price-ratio.ts` | — | `MISSING` |
| Selection engine (model picker UI) | `lib/selection-engine.ts` | — | `MISSING` |
| Fast tier | `lib/openai-fast-tier.ts`, `extensions/gentle-fast.ts`, `docs/fast-mode.md` | `src/runtime/fast-mode-policy.ts` | `PARTIAL` |
| Bridge cost | `lib/bridge-cost.ts` | — | `MISSING` |
| Provider failure handling | — | `src/runtime/eco07-provider-failure.ts` | `ASEN-ONLY` |

## 14. Stats, usage, telemetry

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Stats collector | `lib/stats-collector.ts`, `stats-view.ts` | `src/runtime/usage-store.ts` | `PARTIAL` |
| Shell stats / gauge | `lib/shell-stats.ts`, `shell-gauge.ts`, `gauge-theme.ts` | `src/runtime/usage.ts` | `PARTIAL` |
| Usage view | `lib/shell-usage.ts`, `shell-usage-view.ts` | `src/runtime/usage-command.ts` | `PARTIAL` |
| Runtime metrics | `lib/runtime-metrics.ts`, `-policy.ts`, `-children.ts`, `-delivery.ts`, `-native.ts`, `extensions/runtime-metrics.ts` | — | `MISSING` |
| Telemetry trigger | `lib/telemetry-trigger.ts`, `runtime/telemetry-trigger.mjs`, `docs/telemetry.md` | — | `MISSING` |
| TPS meter | `extensions/gentle-tps.ts` | — | `MISSING` |
| Desktop usage service | `lib/desktop-usage-service.ts`, `desktop-rpc-usage.ts` | — | `MISSING` |
| Status timing diagnostics | `lib/status-timing-diagnostics.ts`, `runtime/status-timing-diagnostics.mjs` | `src/runtime/status.ts`, `host-status-projection.ts` | `PARTIAL` |

## 15. Shell UI, TUI, themes, editor

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Shell bar | `lib/shell-bar.ts`, `shell-card.ts` | `src/runtime/focus-chrome.ts`, `presentation.ts` | `PARTIAL` |
| Sidebar | `lib/shell-sidebar.ts`, `-layout.ts`, `-banner.ts` | `src/runtime/m1-readonly-rail.ts` | `DIFFERENT` |
| Panel | `lib/shell-panel.ts`, `shell-page.ts` | `src/runtime/native-work-panel.ts`, `ide-panel.ts` | `PARTIAL` |
| Prompt decoration | `lib/shell-prompt.ts`, `shell-hover.ts` | `src/runtime/presentation.ts` | `PARTIAL` |
| Todo presentation | `lib/shell-todo.ts`, `extensions/gentle-todo.ts` | `src/runtime/todo-presentation.ts`, `todo-store.ts`, `pi-todo-tools.ts` | `EQUIV` |
| Changes view | `lib/shell-changes.ts`, `shell-changes-view.ts`, `session-changes.ts`, `session-change-capture.ts` | `src/runtime/git-diff-preview.ts` | `PARTIAL` |
| Responsive layout | `lib/shell-sidebar-layout.ts`, `agents-view-layout.ts` | `src/runtime/responsive-layout.ts` | `PARTIAL` |
| Native choice list | `lib/native-choice-list.ts` | `src/runtime/ask-user.ts` (interaction) | `PARTIAL` |
| Native fullscreen interaction | `lib/native-fullscreen-interaction.ts` | `src/runtime/native-m2-navigator.ts` | `PARTIAL` |
| Native pointer region | `lib/native-pointer-region.ts` | — | `MISSING` |
| Overlay repaint | `lib/overlay-repaint.ts` | `src/runtime/focus-chrome.ts` | `PARTIAL` |
| Animation policy | `lib/animation-policy.ts` | — | `MISSING` |
| Keymaps | `lib/keymaps.ts`, `keymaps-customize.ts`, `pi-tui-keys.ts` | `src/runtime/keymaps.ts`, `shortcuts.ts` | `PARTIAL` |
| Vim normal engine | `lib/vim-normal-engine.ts` | — | `MISSING` |
| Vim operator engine | `lib/vim-operator-engine.ts` | — | `MISSING` |
| Vim visual engine | `lib/vim-visual-engine.ts` | — | `MISSING` |
| Vim policy / adapter | `lib/vim-policy.ts`, `vim-editor-adapter.ts` | — | `MISSING` |
| External editor bridge | `lib/external-editor.ts` | — | `MISSING` |
| Terminal theme | `lib/terminal-theme.ts`, `theme-customization.ts`, `themes/` (3) | `src/runtime/focus-theme.ts` | `PARTIAL` |
| Visual customisation | `lib/visual-customization-policy.ts`, `visual-customize-view.ts`, `visual-layout-preview.ts`, `visual-profiles.ts` | — | `MISSING` |
| Questionnaire | `lib/questionnaire/` (view, schema, validate) | — | `MISSING` |
| Quiet tools | `lib/quiet-tools-config.ts`, `extensions/quiet-tools.ts` | — | `MISSING` |
| Hidden tools | `lib/hidden-tools.ts` | — | `MISSING` |
| Star prompt | `lib/star-prompt.ts`, `extensions/gentle-star-prompt.ts`, `docs/star-prompt.md` | — | `MISSING` |
| Herdr activity / busy | `lib/herdr-activity.ts`, `herdr-busy.ts`, `herdr-task-summary-policy.ts`, `extensions/gentle-herdr-*.ts` | — | `MISSING` |
| Card content / style policy | `lib/card-content-policy.ts`, `card-style-policy.ts` | — | `MISSING` |
| Double-esc cancel | `lib/double-esc-cancel-policy.ts` | `src/runtime/shortcuts.ts` | `PARTIAL` |
| Music control | `extensions/gentle-music.ts`, `docs/gentle-music.md` | — | `MISSING` |
| Image attachments | `lib/clipboard-image.ts`, `image-attachments.ts`, `pasted-image-paths.ts` | `src/runtime/browser-assistant.ts` | `PARTIAL` |
| Image disk cache | `lib/image-disk-cache.ts` | `src/runtime/image-disk-cache.ts` | `EQUIV` |
| Codemode renderer | `lib/codemode-renderer.ts`, `builtin-codemode-optout.ts` | — | `MISSING` |
| Pretty renderer | `extensions/pi-pretty.ts`, dep `@heyhuynhgiabuu/pi-pretty` | — | `MISSING` |
| TUI dependency | `@earendil-works/pi-tui` | none (no `pi-tui` dependency) | `DIFFERENT` |
| Command palette | `lib/command-palette.ts`, `-catalog.ts` | `src/runtime/command-palette.ts`, `native-command-palette.ts` | `EQUIV` |
| Agent/task/review/integration panels | `lib/agents-view.ts`, `jobs-view.ts`, `stats-view.ts` | `src/runtime/agents-panel.ts`, `review-panel.ts`, `integrations-panel.ts`, `ide-panel.ts` | `PARTIAL` |

## 16. Desktop RPC

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| RPC host / server | `lib/rpc-host.ts`, `lib/desktop-rpc.ts` | `src/runtime/desktop-rpc.ts` (7.6 KB) | `PARTIAL` |
| Agents service | `lib/desktop-agents-service.ts`, `desktop-rpc-agents.ts` | — | `MISSING` |
| Design service | `lib/desktop-design-service.ts`, `desktop-rpc-design.ts` | — | `MISSING` |
| Jobs service | `lib/desktop-jobs-service.ts`, `desktop-rpc-jobs.ts` | — | `MISSING` |
| Usage service | `lib/desktop-usage-service.ts`, `desktop-rpc-usage.ts` | — | `MISSING` |
| Permissions RPC | `lib/desktop-rpc-permissions.ts` | — | `MISSING` |
| Profiles RPC | `lib/desktop-rpc-profiles.ts` | — | `MISSING` |
| Config RPC | `lib/desktop-rpc-config.ts` | — | `MISSING` |
| Extension surface | `extensions/gentle-desktop-rpc.ts`, `docs/desktop-rpc.md` | — | `MISSING` |

## 17. ODD and TDD flow

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| ODD phase model | `lib/odd-phase.ts` | `src/flow/odd.ts`, `odd-execution-contract.ts` | `PARTIAL` |
| ODD phase inference | `lib/odd-phase-inference.ts` | `src/flow/odd-routing.ts` | `EQUIV` |
| Task tracking / feature document | — | `src/flow/odd-task-tracking.ts`, `src/tasks/task.ts` | `ASEN-ONLY` |
| Risk classification | `lib/review-risk.ts` (review only) | `src/flow/risk.ts` | `ASEN-ONLY` |
| Workflow selection | `lib/orchestrator-mode-policy.ts` | `src/lifecycle/workflow-selection.ts` | `PARTIAL` |
| Applicability decision | — | `src/lifecycle/applicability.ts` | `ASEN-ONLY` |
| Transactional change | — | `src/lifecycle/transaction.ts`, `src/core/state-machine.ts` | `ASEN-ONLY` |
| Writer authorization snapshot | `lib/writer-surfaces.ts` | `src/lifecycle/writer-authorization-snapshot.ts` | `EQUIV` |
| Strict TDD cycle | `strict-tdd.md` as a delegated asset only | `src/test/strict-tdd-cycle.ts`, `tdd-cycle.ts`, `tdd-observation.ts`, `tdd-completion-record.ts`, `non-tdd-alternative.ts` | `ASEN-ONLY` |
| Plan dispatch / replay | — | `src/runtime/plan-dispatcher.ts`, `plan-context.ts`, `task-replay.ts`, `natural-plan-tool.ts` | `ASEN-ONLY` |
| Bounded correction budget | `lib/review-correction-lifecycle.ts` | `src/review/bounded-correction.ts` | `EQUIV` |
| Executable plan | `lib/orchestrator-work.ts` | `src/orchestration/executable-plan.ts`, `orchestrator.ts` | `PARTIAL` |

## 18. Delivery, Git, PR

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Branch preparation | — | `src/delivery/branch-preparation.ts` | `ASEN-ONLY` |
| Work-unit policy | `lib/commit-slice-signal.ts` | `src/delivery/work-unit-policy.ts`, `work-unit-evidence.ts`, `work-unit-review-candidate.ts` | `PARTIAL` |
| Chain policy | — | `src/delivery/chain-policy.ts`, `chain-artifact-accounting.ts` | `ASEN-ONLY` |
| Local delivery | — | `src/delivery/local-delivery.ts` | `ASEN-ONLY` |
| Remote delivery | — | `src/delivery/remote-delivery.ts` | `ASEN-ONLY` |
| PR labels | — | `src/delivery/pr-label-publication.ts` | `ASEN-ONLY` |
| Destructive git guard | `lib/destructive-command-guard.ts` | `src/repository/operation-policy.ts`, `src/security/destructive-command-guard.ts` | `EQUIV` |
| Worktree registry | `lib/session-worktree-registry.ts` | `src/runtime/workspace-store.ts`, `workspace-resolution.ts` | `PARTIAL` |
| Session scratch | `lib/session-scratch.ts`, `extensions/session-scratch.ts` | `src/security/yolo-temp-scratch.ts`, `src/io/*` | `PARTIAL` |
| Commit slice signal | `lib/commit-slice-signal.ts` | `src/delivery/chain-artifact-accounting.ts` | `PARTIAL` |
| Evidence store | — | `src/evidence/store.ts`, `persistence.ts`, `git-lineage.ts`, `execution.ts`, `process-tree.ts`, `spawn-contained.ts` | `ASEN-ONLY` |
| Delivered test/lint gate | `lib/delivered-test-lint.ts` | `src/lifecycle/applicability.ts`, `src/test/tdd-completion-record.ts` | `PARTIAL` |

## 19. Issues and defects

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Issue preparation | — | `src/issues/issue-preparation.ts` | `ASEN-ONLY` |
| Issue publication | — | `src/issues/issue-publication.ts` | `ASEN-ONLY` |
| RDD defect policy | — (only `defect` comments in review code) | `src/defects/rdd-policy.ts`, `rdd-policy-source.ts` | `ASEN-ONLY` |
| Defect binding | — | `src/defects/rdd-defect-binding.ts` | `ASEN-ONLY` |
| Defect reproduction | — | `src/defects/rdd-reproduction.ts` | `ASEN-ONLY` |
| Repository inspection for defects | — | `src/defects/rdd-repository-inspection.ts` | `ASEN-ONLY` |
| Issue-first skill | — | `skills/asen-issue-workflow`, `asen-defect-workflow` | `ASEN-ONLY` |

## 20. Sessions, profiles, workspace

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Session profile binding | `lib/session-profile-binding.ts`, `-authority.ts`, `-freeze.ts`, `-persistence.ts`, `-integration.ts`, `-disk-reader.ts`, `-append-controller.ts`, `docs/session-profile-format.md` | `src/runtime/session-profile-binding.ts`, `profile-store.ts` | `PARTIAL` |
| Session directory | — | `src/runtime/session-directory.ts`, `shared-session-directory.ts` | `ASEN-ONLY` |
| Checkpoint | — | `src/session/checkpoint.ts` | `ASEN-ONLY` |
| Workspace attribution / resolution | — | `src/runtime/workspace-attribution.ts`, `workspace-resolution.ts`, `workspace-store.ts`, `workspace-snapshot.ts` | `ASEN-ONLY` |
| Workspace writer lease | `lib/writer-batch-admission.ts` | `src/runtime/workspace-writer-lease.ts` | `EQUIV` |
| Interrupted write inspection | — | `src/runtime/interrupted-write-inspection.ts`, `authorized-write-recovery.ts` | `ASEN-ONLY` |
| Atomic file write | `extensions/history/atomic-write.ts` | `src/io/atomic-write.ts`, `exclusive-file-lock.ts`, `private-file.ts`, `bounded-file.ts` | `EQUIV` |
| Host status | `lib/shell-bar.ts` (status segment) | `src/runtime/host-status-projection.ts`, `status.ts` | `PARTIAL` |
| MCP status | `docs/mcp-status.md` | — | `MISSING` |
| Prompt budget | `docs/prompt-budget.md` | — | `MISSING` |
| Work continuity | `docs/work-continuity.md` | `docs/asen-agent-continuation.md`, `docs/remote-continuation.md` | `EQUIV` |

## 21. Contracts and capability specifications

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Capability contract versions | `contracts/capabilities.v1.1`–`v1.5` + fixtures (81 files) | `registry/CAP-*.yaml` (21) | `DIFFERENT` | GS: wire schema with versioned fixtures. ASEN: capability intent specs. |
| Consent envelope schema | `contracts/consent.schema.json` | — (external protocol) | `MISSING` |
| Review operation/projection/lens schemas | `contracts/operation`, `projection`, `lens`, `artifact-subject`, `admitted-result`, `failure`, `correction-plan-request` | — | `MISSING` |
| Provider contract lock | `contracts/provider-contract.lock.json`, `provider-capabilities.baseline.json`, `provider-roles.baseline.json` | `registry/ecosystem-sources-v1.json`, `ecosystem-claims-v1.json` | `DIFFERENT` |
| Capability registry tooling | `scripts/check-provider-contract`, `mirror-provider-contract` | `scripts/audit:parity`, `audit:skills`, `audit:ecosystem`, `audit:upstream-boundary`, `audit:ef-plan` | `DIFFERENT` |
| Forensic findings ledger | — | `registry/forensic-findings-wave*.yaml` | `ASEN-ONLY` |
| Public capability matrix | `docs/readme-reference.md` | `odd/evidence/ui-host-public-capability-matrix.md`, `docs/harness-capability-map.md` | `EQUIV` |

## 22. Tests and verification

| Operation | Gentle Shell | ASEN | Verdict |
| --- | --- | --- | --- |
| Test volume | 672 files / 12.4 MB | 459 files / 4.07 MB | `PARTIAL` |
| Test runner | `scripts/run-test-suite` | `scripts/run-tests.mjs` (`npm test`) | `EQUIV` |
| Installer acceptance | `scripts/test-installer-acceptance`, `test-packed-runner` | `scripts/verify-pack-environment.mjs` | `PARTIAL` |
| Shell snapshot | `scripts/shell-snapshot` | — | `MISSING` |
| Render cache perf harness | `scripts/render-cache-performance`, `-worker`, `render-cache-host`, `docs/render-cache-performance.md`, `ci-performance.md` | — | `MISSING` |
| Types baseline | `scripts/types-baseline`, `check-types` | `npm run typecheck` (`tsc --noEmit`) | `PARTIAL` |
| Native authority slimming measurement | `scripts/measure-native-authority-slimming` | — | `MISSING` |
| Verifier preparation | `scripts/prepare-verifier` | `src/verify/verifier.ts` | `PARTIAL` |
| Strict TDD evidence | — | `src/test/tdd-completion-record.ts`, `odd/evidence/*.json` | `ASEN-ONLY` |
| Adversarial/dual review evidence | `docs/review-integration/*` | `docs/t12-r4-adversarial-review.md`, `odd/evidence/*` | `PARTIAL` |

---

## 23. Totals

Counted mechanically from the tables above (275 mapped operations, table headers and the legend excluded).

| Verdict | Rows | Share |
| --- | --- | --- |
| `PARTIAL` | 100 | 36.4% |
| `MISSING` (in ASEN) | 80 | 29.1% |
| `ASEN-ONLY` | 52 | 18.9% |
| `EQUIV` | 30 | 10.9% |
| `DIFFERENT` | 13 | 4.7% |
| **Total** | **275** | |

Per domain:

| § | Domain | Total | EQUIV | PARTIAL | MISSING | ASEN-ONLY | DIFFERENT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Entry, CLI, bootstrap | 12 | 2 | 8 | 0 | 1 | 1 |
| 2 | Launcher, install, update, uninstall | 13 | 0 | 3 | 4 | 3 | 3 |
| 3 | Agents, subagents, profiles, orchestrator | 30 | 1 | 21 | 5 | 2 | 1 |
| 4 | Review and RDD authority | 25 | 3 | 13 | 7 | 1 | 1 |
| 5 | Memory | 10 | 0 | 0 | 1 | 9 | 0 |
| 6 | Skills and assets | 7 | 3 | 2 | 0 | 0 | 2 |
| 7 | Design canvas | 11 | 0 | 0 | 11 | 0 | 0 |
| 8 | Voice | 7 | 0 | 3 | 4 | 0 | 0 |
| 9 | Notifications, audio, pulse | 8 | 0 | 4 | 4 | 0 | 0 |
| 10 | Background jobs | 8 | 1 | 1 | 3 | 3 | 0 |
| 11 | History | 7 | 0 | 5 | 1 | 1 | 0 |
| 12 | Permissions and security | 16 | 6 | 3 | 1 | 6 | 0 |
| 13 | Providers, models, routing | 10 | 2 | 4 | 3 | 1 | 0 |
| 14 | Stats, usage, telemetry | 8 | 0 | 4 | 4 | 0 | 0 |
| 15 | Shell UI, TUI, themes, editor | 35 | 3 | 13 | 17 | 0 | 2 |
| 16 | Desktop RPC | 9 | 0 | 1 | 8 | 0 | 0 |
| 17 | ODD and TDD flow | 12 | 3 | 3 | 0 | 6 | 0 |
| 18 | Delivery, Git, PR | 12 | 1 | 5 | 0 | 6 | 0 |
| 19 | Issues and defects | 7 | 0 | 0 | 0 | 7 | 0 |
| 20 | Sessions, profiles, workspace | 11 | 3 | 2 | 2 | 4 | 0 |
| 21 | Contracts and capability specifications | 7 | 1 | 0 | 2 | 1 | 3 |
| 22 | Tests and verification | 10 | 1 | 5 | 3 | 1 | 0 |

`MISSING` concentration: shell UI/editor (17), design canvas (11), desktop RPC (8), review (7), agents (5), install (4), voice (4), notifications (4), stats (4), providers (3), jobs (3), tests (3), sessions (2), contracts (2), history (1), security (1), memory (1).

`ASEN-ONLY` concentration: memory (9), issues/defects (7), ODD/TDD (6), delivery (6), security (6), sessions/workspace (4), jobs (3), install (3), agents (2).

## 24. What this map does not establish

1. **No runtime equivalence.** Every `EQUIV` is a source-shape match. No paired execution, no screenshot, no recording, no provider call.
2. **No coverage percentage.** `PARTIAL` rows are not fractional. Counting modules would reward Gentle Shell for splitting files and punish ASEN for cohesive ones; the map is per operation on purpose.
3. **No claim that `MISSING` should be built.** 17 of the 21 missing clusters are surface features. Whether ASEN needs a design canvas or vim engine is a product decision, not a parity debt.
4. **No authority over the P00–P44 cards.** Those cards remain the normative parity instrument. This map is an independent structural reading of the 4.8.0 tree and will diverge from cards still bound to 4.3.0/4.6.0 permalinks (finding F-I).
5. **Vendored behaviour is excluded.** Anything inside `@earendil-works/pi-*`, `@heyhuynhgiabuu/pi-pretty`, `typebox`, or `node-pty` is host behaviour, not product behaviour, and is not mapped.
