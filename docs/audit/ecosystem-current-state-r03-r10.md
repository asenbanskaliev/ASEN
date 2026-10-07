# Ecosystem closure audit: current evidence

Initial candidate audited: `46c81fa67ce39aee9186c481d278cbd7e398d448` (`feat/strict-parity-prerequisites`). The follow-up implementation and host checks are recorded below against their exact candidate.

This audit records the code and evidence present before the current batch. `PARTIAL` means a behavior-backed foundation exists but required composition or recovery evidence is still missing.

| Route | Existing mechanism and source of truth | Evidence found | Real gap |
| --- | --- | --- | --- |
| R03 | No ASEN-owned general settings schema or precedence resolver found. Pi's own settings remain Pi-owned. | No ASEN config/settings module or public config surface in the candidate. | Missing. Do not infer general configuration from profiles. |
| R04 | `runtime/profiles.ts` validates profiles, mutates them and resolves session → project → global → default. `runtime/profile-store.ts` atomically writes/reloads profile files. | `runtime-profiles.test.ts`, `profile-store.test.ts`; current extension only lists profiles. | Before this batch, resolved routes did not reach orchestration or Pi. File mutation has no cross-process revision/locking contract; runtime layer discovery and customization command remain incomplete. |
| R05 | `runtime/workspace-attribution.ts` binds actor, session, project and worktree; rejects path escapes and renders bounded rows. | `workspace-attribution.test.ts`; extension output accepts an injected provider. | No built-in durable change journal or actor lifecycle integration. |
| R06 | Workspace change projection and narrow output exist. | `workspace-attribution.test.ts`, `extension-state-commands.test.ts`. | No public workspace mutation UI, persisted conflict handling, or restart/isolation flow. |
| R07 | Presentation helpers exist. | `presentation.test.ts`. | Contract and host-level accessibility snapshots remain incomplete. |
| R08 | Interaction tools and shortcut resolution inventory exist. | Interaction and `shortcuts.test.ts` suites. | Shortcut bindings are not registered as a complete public interaction flow; several advertised bindings remain unavailable. |
| R09 | `runtime/agent-lifecycle.ts` validates monotonic agent-state transitions; extension status is injectable. | `agent-lifecycle.test.ts`, `extension-state-commands.test.ts`. | Lifecycle records are not persisted/recovered by a production provider and are not fully composed with orchestration. |
| R10 | `task-replay.ts` validates exact bounded task events and ordered transitions. `odd-task-tracking.ts` mirrors the complete bound ODD document/TODO and appends replay events to that existing MemoryStore item. `tasks/task.ts` is transient ASEN engineering-task state only. | `task-replay.test.ts`, `odd-task-tracking.test.ts`, SQLite close/reopen and stale-revision coverage. | Append uses read-then-save and does not provide cross-process compare-and-swap, so simultaneous append conflict handling remains open. The internal EngineeringTask is deliberately not a user-task source of truth. |

## Current exact-SHA host evidence

At initial candidate `46c81fa67ce39aee9186c481d278cbd7e398d448`, Phase 0 succeeded (run `37523687482`), CI succeeded on Ubuntu, Windows and macOS (run `37523687820`), and Release Gate succeeded on all three platforms (run `37523687432`). Windows ran `npm run verify:pack` and the Windows package smoke steps successfully. Pi Free Smoke was skipped (run `37523687394`) and is not a pass.

At follow-up candidate `f5ec3874f8cc1adee57f5bc44992dcb46efe6321`, Phase 0 run `37576518470` succeeded; CI run `37576518506` and Release Gate run `37576518628` succeeded on Ubuntu, Windows and macOS. Windows `npm run check`, `npm run verify:pack`, Pi package installation and packed-install smoke all succeeded. Exact-SHA check `authenticated-free-model` was `skipped`; this is not a Pi Free pass.

## R14 and R15 evidence

The history store already has atomic writes, revision conflicts, tombstones and retention. Its policy helpers redact before capture; the current extension does not expose a complete history flow, and the store does not provide cross-process serialization. Usage has local counters and requires both explicit consent and preview acceptance before sending; counters are not yet a durable public feature. These are `PARTIAL`, not `FULL`.

## Work in this batch

- Effective profile choices are carried from persisted/reloaded session, project and global layers into matching orchestration agent requests, then passed to Pi as `--model` and `--thinking` arguments.
- ODD replay events append to the existing ODD tracking MemoryStore item. Reopen/resume, strict input validation and stale-revision tests cover the combined path. Concurrent append conflict handling remains an explicit gap. No memory schema/core or parallel task store was added.
- R03 remains `MISSING`; R04-R06, R09-R10 and R14-R15 remain `PARTIAL` until their remaining integration and host/recovery gaps are closed. R19 is recorded as `PARTIAL`, one of the map's allowed values.
