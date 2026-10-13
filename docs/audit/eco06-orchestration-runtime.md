# ECO-06 — orchestration runtime audit

## Decision

**PARTIAL / OPEN.** ASEN can turn verified ODD facts into a persisted executable Todo DAG, dispatch dependency-ready read-only Pi roles, recover interrupted work without replay, and require review of a durable agent result before accepting a linked plan task. It cannot yet execute the planned writer, primary-session, or clarification roles through the complete controlled lifecycle.

## Implemented and exercised

- `/asen-plan` accepts exact user-provided ODD facts and instruction text, runs the existing ODD route and skill selection, materializes role-specific tasks and dependencies, and persists the whole plan atomically in the active session/project Todo store.
- Changing the Pi session or project while planning or dispatch confirmation is pending rejects the operation. Read-only dispatch revalidates identity after confirmation and repeatedly inside the Todo launch lock, including immediately before the trusted binder starts the agent.
- `asen_plan_dispatch_next` selects one dependency-ready task by saved priority, confirms the exact role/instruction, verifies the current skill registry selection, and dispatches only `explorer`, `reviewer`, or `verifier` roles.
- `TrustedTaskAgentBinder` persists Todo ownership and the agent link before the Pi runner starts. Agent terminal outcomes reconcile to `blocked`; they never complete a Todo.
- `asen_todo_accept_result` requires a blocked planned task, an immutable task-agent link, matching session/project/role, a durable successful terminal agent record, a bounded full result view, independent user evidence, and explicit Pi UI confirmation. Direct `done` is rejected for a linked plan task. Acceptance is persisted as ordered `running` then `done` events, so a crash between them recovers to review rather than completing silently.
- Interrupted linked read-only work requires explicit continuation; failed linked read-only work permits one explicitly confirmed retry. Both bind the child attempt before dispatch. Writes and cancelled tasks are not retried.

## Evidence

- `tests/extension-state-commands.test.ts`: exact-fact planning, atomic persisted DAG, dependency gating, and session-change rejection while waiting for Todo persistence.
- `tests/pi-agent-runtime.test.ts`: production Pi planning/dispatch, role and skill matching, identity change rejection, link-before-run, result reconciliation, cancellation, continuation, bounded retry, and full verifier-result acceptance after restarting the Pi runtime. It also rejects an unrelated agent ID, declined confirmation, and direct completion of linked work.
- `tests/pi-todo-tools.test.ts`: explicit acceptance confirmation, restart recovery, and rejection of results too large for complete UI review.
- `tests/pi-host-preflight.test.ts`: public tool inventory and Pi host compatibility.
- Local checks on the working tree: `npm run typecheck`; the four suites above; `git diff --check`.

These local checks are not CI evidence for a published SHA. Hosted CI and Release Gate results must be read from the exact commit.

## Remaining work

- `primary`, `worker`, and `clarifier` plan roles cannot yet be dispatched by the Pi plan tool. The writer path must bind a current candidate, exact authorized surfaces, lifecycle phase grant, skill evidence, and one-use writer admission, then persist auditable outputs and recover without replay.
- Natural-language `/asen-plan` input currently produces conservative triage and missing-fact questions; it does not infer ODD facts, inspect project capabilities, or obtain model/provider availability.
- Acceptance is an explicit human review of the persisted result and recorded acceptance instruction; ASEN does not execute arbitrary acceptance commands inferred from agent output.
- Concurrency is bounded by the agent dispatcher, but plan scheduling remains one confirmed task per Pi tool call. There is no automatic multi-task scheduler or provider quota policy.

No permission is inferred from a plan, model response, skill selection, or successful agent completion.
