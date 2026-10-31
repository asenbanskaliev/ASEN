# ASEN and Gentle Shell: functional parity evidence

This document is an engineering evidence map, not a marketing claim. It maps the extracted Gentle Shell v2.6 surface and ASEN command
catalog into a capability comparison. Evidence paths are repository-relative so the comparison can be audited from tracked files and tests.

## Verdict

ASEN is a Gentle-Shell-style Pi-native harness in the same functional family, with a different namespace and stronger
release-grade diagnostics. It does not copy every UX surface, but it covers the operational surfaces defining the
workspace flow: agent orchestration, ODD/SDD workflow, evidence-bound review, memory, tasks, profiles/persona,
usage/stats, managed install/recovery, and diagnostics.

## Gentle Shell source command surface observed

From the extracted snapshot:

- `gentle:install-*` (repair/refresh global assets)
- `gentle:sdd-preflight`, `gentle-sdd-init`, `gentle-sdd-status`, `gentle-sdd-continue`
- `gentle:models`, `gentle:profiles`, `gentle:persona`, `gentle:doctor`, `gentle:status`
- `gentle:review-session-permission`, `gentle:review-mode`, `gentle:telemetry`, `gentle:background-subagents`
- `gentle:changes` (changes captured, grouped, opened in editor, with `resolve`)
- `asen` aggregate commands for agents, command palette, startup banner, skill registry refresh, usage
- SDD exposed as command-phase entry points.

## ASEN public command surface observed

From `src/runtime/command-catalog.ts`:

- core: `asen`
- workflow: `asen-workflow`, `asen-route`, `asen-plan`
- review: `asen-review`
- skills: `asen-skill-registry`
- configuration: `asen-profiles`, `asen-persona`, `asen-commands`, `asen-customize` (unimplemented)
- session: `asen-changes`, `asen-agents`, `asen-todos`, `asen-history`, `asen-usage`, `asen-stats`
- memory: `asen-memory`
- diagnostics: `asen-status`, `asen-doctor`, `asen-authority-status`

## 1. Functional family comparison

<|message|> Capability | Gentle Shell surface | ASEN surface | Status / evidence |
| --- | --- | --- | --- |
| Agent orchestration | `/agents`, focused map/write/verify subagents, orchestrator session notifications | `/asen-agents`, background delivery, session notification bus identity/TTL/bounded capacity | Equivalent primitives with different presentation. Evidence: `extensions/asen.ts`, `src/runtime/background-jobs.ts`, `src/runtime/session-notifications.ts`, `src/runtime/background-job-journal.ts`, tests `tests/background-jobs.test.ts`, `tests/session-notifications.test.ts`. |
| ODD / SDD workflow | ODD primary, optional SDD/OpenSpec, native review candidate handling | ODD route + SDD skills + exact workflow selection | Functional parity, methodology plus concrete evidence. Evidence: `src/lifecycle/workflow-selection.ts`, `skills/asen-*`, odd/tasks. |
| SDD phase control | `gentle-sdd-init`, `gentle-sdd-status`, `gentle-sdd-continue`, preflight before phases | `asen-workflow`, runtime selection, phase skills (`sdd-*`, `asen-tasks`, `asen-specification`) | ASEN exposes workflow selection plus phase skills rather than command-phase entry points. Evidence: `src/lifecycle/workflow-selection.ts`, docs `runtime-tools.md`. |
| Changes / diff and correction | `/changes`, grouped caught edits, open editor, conflict resolution | `/asen-changes`, attributed Git snapshots, explicit scoped correction | Equivalent safe flow. Evidence: `src/runtime/workspace-snapshot.ts`, `src/runtime/workspace-resolution.ts`, tests `tests/t12-integrated-boundaries.test.ts`, `tests/workspace-snapshot.test.ts`. |
| Review | Native review with exact candidate, bounded correction, consent continuations | `asen-review`, ordinary review command, authority status command | Equivalent as Ordinary flow; candidate must remain immutable. Evidence: `src/review/ordinary-review-command.ts`, docs runtime-tools. |
| Tasks / resume | todos + session tasks | `/asen-todos` + task bundles and durable workflow | Strong parity. Evidence: `src/runtime/todo-store.ts`, agent delivery. |
| Memory | optional separate companion (engram) | `/asen-memory`, R01-R09 memory foundation | Strong ASEN-local memory scope and deterministic parity. Evidence: `src/runtime/project-memory*`, `tests/project-memory-*.test.ts`, `odd/tasks/memory-strict-parity.md`. |
| Profile / persona / models | `gentle:models`, `gentle:profiles`, `gentle:persona` | `/asen-profiles`, `/asen-persona`, `/asen-usage` | Equivalent control verbs in a simpler ASEN surface. Evidence: `src/runtime/profiles.ts`, `src/runtime/profile-store.ts`. |
| Diagnostics | `gentle:doctor`, `gentle:status`, telemetry | `/asen-doctor`, `/asen-status`, `/asen-authority-status`, `/asen-usage`, `/asen-stats` | Equivalent, more locally bounded status/health gathering. Evidence: `src/runtime/doctor.ts`, `src/runtime/usage-command.ts`. |
| Skills registry | `skill-registry:refresh` | `/asen-skill-registry` + startup watch | Equivalent. Evidence: `src/skills/registry-lifecycle.ts`, `src/skills/registry.ts`, tests. |
| Authority and safety | `gentle:review-session-permission`, sensitive path protection, destructive command guards | `asen-authority-status`, host identity/project/worktree boundaries, consent, scoped correction | Equivalent with stricter machine-local identity. Evidence: `extensions/authority.ts`, `src/runtime`, `docs/remote-continuation.md`. |
| Installation lifecycle | repair `gentle:*` install assets through harness ecosystem commands | signed acquire/stage/upgrade/rollback/update preview/selected version launch/browser consent/environment audit | ASEN is materially more transactional in this layer. Evidence: `src/runtime/managed-lifecycle.ts`, `managed-install.ts`, `managed-update-preview.ts`, `managed-selected-launch.ts`, `docs/installation.md`, tests `managed-*.test.ts`. |
| Subagent controls | `gentle:background-subagents` dedicated controls | background delivery entries as part of agent store and diagnostics | Similar delivery flow, consolidated rather than split controls. Evidence: `src/runtime/background-jobs.ts`, extensions agent tools. |
| Command discovery | grouped command palette | `/asen-commands` and public command catalog | Equivalent concept, different user shape. Evidence: `src/runtime/command-catalog.ts`. |
| Memory of tasks (tagging) | command discipline and companion tasks | ASEN durable task docs in `odd/tasks/` plus mirror in Engram, updates preserving completed work | Functional parity and stronger persisted documentation. Evidence: `odd/tasks/pi-capability-completion.md`, Engram protocol. |

## Flow parity

Gentle Shell flow:

1. human intent is clarified
2. parent session delegates bounded work
3. artifacts and helper evidence are produced and reviewed
4. correction loops allow further iteration
5. review itself does not authorize delivery automatically

ASEN enforces the same concepts:

1. one parent orchestrator retains decisions
2. bounded units require explicit reason to delegate
3. ODD/SDD artifacts are referenced rather than paraphrased
4. evidence gates (tests/audits) are executed
5. an exact, immutable candidate definition is preserved for correction
6. user controls release gates (`release:check`, publish still unrestricted by agent)

## 3. Observable gap register

These are the principal differences that are not merely naming:

1. `asen-customize` was previously cataloged `implemented:false`; it is now implemented as a read-only parameter hub with no new mutable datastore.
2. Generic model-management verb equivalent to `gentle:models` is not exposed as a standalone command; `asen-profiles` covers the primary route.
3. Gentle exposes an explicit `gentle:telemetry` command and startup banner toggle controls.
4. Gentle exposes `gentle-live-research-probe` (test-shaped opt-in verification).
5. ASEN exposes more formal managed-installation transaction and audit categories, including version selection, staged updates, rollback, browser consent, and cleanup uncertainty.
6. ASEN intentionally carries persistent release-debt documentation (normative source proof and an unmet platform matrix) rather than concealing them.

## 4. Bottom-line demonstration

For operational engineering work, **functional parity is achieved**: same workflow milestones, bounded delegation, exact-candidate evidence, corrective iteration, skills registry, memory/task tracking, review posture, profiles and diagnostics. ASEN is not mechanically the same code or command vocabulary, but its behavior goal quality matches (and exceeds in transactional evidence for managed install) the Gentle Shell description.

Where it does not match yet is surface-level UX breadth (`customize`, branded startup/banner and a richer palette) and global product availability claims. No claim of absolute identical UX is made.

## Evidence map appendix

- `src/runtime/command-catalog.ts`
- `src/runtime/command-palette`-adjacent: `src/runtime/command-catalog.ts`
- `extensions/asen.ts`
- `src/lifecycle/workflow-selection.ts`
- `src/runtime/workspace-snapshot.ts`
- `src/runtime/workspace-resolution.ts`
- `src/review/ordinary-review-command.ts`
- `src/runtime/profiles.ts`
- `src/runtime/profile-store.ts`
- `src/runtime/todo-store.ts`
- `src/runtime/history-command.ts`
- `src/runtime/usage-command.ts`
- `src/runtime/status.ts`
- `src/runtime/doctor.ts`
- `src/runtime/skill-registry.ts` / `src/skills/registry-lifecycle.ts`
- `src/runtime/project-memory*`
- `src/agents/*`
- `managed-*` runtime files
- `docs/runtime-tools.md`
- `odd/tasks/pi-capability-completion.md`
- Gentle extracted source: `/extensions/*.ts`, README features and command descriptions
