# ASEN and Comparator Shell: functional parity evidence

This document is an engineering evidence map, not a marketing claim. It maps the extracted Comparator Shell v2.6 surface and ASEN command
catalog into a capability comparison. Evidence paths are repository-relative so the comparison can be audited from tracked files and tests.

## Verdict

ASEN is a Comparator-Shell-style Pi-native harness in the same functional family, with a different namespace and stronger
release-grade diagnostics. It does not copy every UX surface, but it covers the operational surfaces defining the
workspace flow: agent orchestration, public ODD workflow, evidence-bound review, memory, tasks, profiles/persona,
usage/stats, managed install/recovery, and diagnostics.

Current workflow disposition: **PARTIAL, not FULL**. The older snapshot below is historical comparison evidence, not the current reference policy. Current reference public SDD retirement and ASEN U1 are tracked in `odd/tasks/odd-rdd-shell-parity.md` (S2, L5, L16). No native approval, real-host execution or whole-menu parity is established here.

## Comparator Shell source command surface observed

From the extracted snapshot:

- `comparator:install-*` (repair/refresh global assets)
- `comparator:sdd-preflight`, `comparator-sdd-init`, `comparator-sdd-status`, `comparator-sdd-continue`
- `comparator:models`, `comparator:profiles`, `comparator:persona`, `comparator:doctor`, `comparator:status`
- `comparator:review-session-permission`, `comparator:review-mode`, `comparator:telemetry`, `comparator:background-subagents`
- `comparator:changes` (changes captured, grouped, opened in editor, with `resolve`)
- `asen` aggregate commands for agents, command palette, startup banner, skill registry refresh, usage
- SDD exposed as command-phase entry points.

## ASEN public command surface observed

From `src/runtime/command-catalog.ts`:

- core: `asen`
- workflow: `asen-route`, `asen-plan` (ODD-only; no public SDD selector)
- review: `asen-review`
- skills: `asen-skill-registry`
- configuration: `asen-profiles`, `asen-persona`, `asen-commands`, `asen-customize` (unimplemented)
- session: `asen-changes`, `asen-agents`, `asen-todos`, `asen-history`, `asen-usage`, `asen-stats`
- memory: `asen-memory`
- diagnostics: `asen-status`, `asen-doctor`, `asen-authority-status`, `asen-integrations`

### Frozen U1 inventory and legitimate count changes

Before editing, a read-only registration inventory observed 37 static catalog entries, 37 shared-extension registrations (36 catalog-owned plus `asen-task-agents`), 38 with the separate authority extension, and 7 customization links. Retiring only `asen-workflow` yields 36 catalog entries, 36 shared/production registrations, 37 with authority, and 6 customization links. Native profiles/persona and all other public commands remain unchanged. The existing static `asen-task-agents` omission is not repaired here. These are distinct inventories, not proof that every menu matches.

Internal `workflow-selection.ts`, applicability, lifecycle, issued contexts, authenticated readers and historical records remain compatibility surfaces. Signed legacy SDD is not converted into fresh ODD permission; flags/artifacts without genuine selection remain blocked from structured execution.

## 1. Functional family comparison

<|message|> Capability | Comparator Shell surface | ASEN surface | Status / evidence |
| --- | --- | --- | --- |
| Agent orchestration | `/agents`, focused map/write/verify subagents, orchestrator session notifications | `/asen-agents`, background delivery, session notification bus identity/TTL/bounded capacity | Equivalent primitives with different presentation. Evidence: `extensions/asen.ts`, `src/runtime/background-jobs.ts`, `src/runtime/session-notifications.ts`, `src/runtime/background-job-journal.ts`, tests `tests/background-jobs.test.ts`, `tests/session-notifications.test.ts`. |
| Public ODD workflow | Current reference: proportional ODD-only development, applicable TDD | ODD chat/route/plan; no public SDD selection | PARTIAL local registration/admission checks only. Evidence: `extensions/asen.ts`, `skills/asen-odd/SKILL.md`, `tests/workflow-selection-extension.test.ts`; RDD/independent verification/delivery remain separate work. |
| Legacy SDD compatibility | Historical snapshot exposed SDD phase commands; current public selection retired | Internal selection fixtures, phase skills and authenticated recovery retained | Compatibility only, not product promotion or new ODD authority. Evidence: `src/lifecycle/workflow-selection.ts`, `src/lifecycle/skill-lifecycle.ts`; no migration or historical deletion. |
| Changes / diff and correction | `/changes`, grouped caught edits, open editor, conflict resolution | `/asen-changes`, attributed Git snapshots, explicit scoped correction | Equivalent safe flow. Evidence: `src/runtime/workspace-snapshot.ts`, `src/runtime/workspace-resolution.ts`, tests `tests/t12-integrated-boundaries.test.ts`, `tests/workspace-snapshot.test.ts`. |
| Review | Native review with exact candidate, bounded correction, consent continuations | `asen-review`, ordinary review command, authority status command | Equivalent as Ordinary flow; candidate must remain immutable. Evidence: `src/review/ordinary-review-command.ts`, docs runtime-tools. |
| Tasks / resume | todos + session tasks | `/asen-todos` + task bundles and durable workflow | Strong parity. Evidence: `src/runtime/todo-store.ts`, agent delivery. |
| Memory | optional separate companion (persistent-memory companion) | `/asen-memory`, R01-R09 memory foundation | Strong ASEN-local memory scope and deterministic parity. Evidence: `src/runtime/project-memory*`, `tests/project-memory-*.test.ts`, `odd/tasks/memory-strict-parity.md`. |
| Profile / persona / models | `comparator:models`, `comparator:profiles`, `comparator:persona` | `/asen-profiles`, `/asen-persona`, `/asen-usage` | Equivalent control verbs in a simpler ASEN surface. Evidence: `src/runtime/profiles.ts`, `src/runtime/profile-store.ts`. |
| Diagnostics | `comparator:doctor`, `comparator:status`, telemetry | `/asen-doctor`, `/asen-status`, `/asen-authority-status`, `/asen-usage`, `/asen-stats` | Equivalent, more locally bounded status/health gathering. Evidence: `src/runtime/doctor.ts`, `src/runtime/usage-command.ts`. |
| Integration inventory | No dedicated command observed in the extracted snapshot | `/asen-integrations` | Read-only projection of public command/tool inventory and effective profile routes. Reports `unknown` connection state and never claims connectivity or execution. Evidence: `src/runtime/integration-profile-inspection.ts`, `src/runtime/integrations-panel.ts`, `tests/integrations-panel.test.ts`. |
| Skills registry | `skill-registry:refresh` | `/asen-skill-registry` + startup watch | Equivalent. Evidence: `src/skills/registry-lifecycle.ts`, `src/skills/registry.ts`, tests. |
| Authority and safety | `comparator:review-session-permission`, sensitive path protection, destructive command guards | `asen-authority-status`, host identity/project/worktree boundaries, consent, scoped correction | Equivalent with stricter machine-local identity. Evidence: `extensions/authority.ts`, `src/runtime`, `docs/remote-continuation.md`. |
| Installation lifecycle | repair `comparator:*` install assets through harness ecosystem commands | signed acquire/stage/upgrade/rollback/update preview/selected version launch/browser consent/environment audit | ASEN is materially more transactional in this layer. Evidence: `src/runtime/managed-lifecycle.ts`, `managed-install.ts`, `managed-update-preview.ts`, `managed-selected-launch.ts`, `docs/installation.md`, tests `managed-*.test.ts`. |
| Subagent controls | `comparator:background-subagents` dedicated controls | background delivery entries as part of agent store and diagnostics | Similar delivery flow, consolidated rather than split controls. Evidence: `src/runtime/background-jobs.ts`, extensions agent tools. |
| Command discovery | grouped command palette | `/asen-commands` and public command catalog | Equivalent concept, different user shape. Evidence: `src/runtime/command-catalog.ts`. |
| Memory of tasks (tagging) | command discipline and companion tasks | ASEN durable task docs in `odd/tasks/` plus mirror in persistent-memory companion, updates preserving completed work | Functional parity and stronger persisted documentation. Evidence: `odd/tasks/pi-capability-completion.md`, persistent-memory companion protocol. |

## Flow parity

Comparator Shell flow:

1. human intent is clarified
2. parent session delegates bounded work
3. artifacts and helper evidence are produced and reviewed
4. correction loops allow further iteration
5. review itself does not authorize delivery automatically

ASEN enforces the same concepts:

1. one parent orchestrator retains decisions
2. bounded units require explicit reason to delegate
3. ODD artifacts (and historical legacy records when relevant) are referenced rather than paraphrased
4. evidence gates (tests/audits) are executed
5. an exact, immutable candidate definition is preserved for correction
6. user controls release gates (`release:check`, publish still unrestricted by agent)

## 3. Observable gap register

These are the principal differences that are not merely naming:

1. `asen-customize` was previously cataloged `implemented:false`; it is now implemented as a read-only parameter hub with no new mutable datastore.
2. Generic model-management verb equivalent to `comparator:models` is not exposed as a standalone command; `asen-profiles` covers the primary route.
3. Comparator exposes an explicit `comparator:telemetry` command and startup banner toggle controls.
4. Comparator exposes `comparator-live-research-probe` (test-shaped opt-in verification).
5. ASEN exposes more formal managed-installation transaction and audit categories, including version selection, staged updates, rollback, browser consent, and cleanup uncertainty.
6. ASEN intentionally carries persistent release-debt documentation (normative source proof and an unmet platform matrix) rather than concealing them.

## 4. Bottom-line demonstration

For operational engineering work, **functional parity remains PARTIAL**. Local primitives and bounded checks do not establish current reference parity for review control, independent verification, acceptance or delivery. Public ODD-only registration is one bounded unit, not global FULL.

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
- Comparator extracted source: `/extensions/*.ts`, README features and command descriptions
