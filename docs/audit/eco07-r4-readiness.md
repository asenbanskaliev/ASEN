# ECO-07 R4 — current candidate review

## Decision

**PARTIAL / OPEN.** The durable Todo-to-agent path is now wired into Pi agent launch, but full closure still requires the exact-candidate authenticated Pi interruption/restart workflow and its artifact review. A fixture-backed run is not a substitute for that provider-backed process test.

## Current behavior

- `asen_agent_start` accepts an optional owned `todoId`. It persists the agent as queued, then calls `TrustedTaskAgentBinder.launch` before dispatch.
- The binder checks that the Todo is still `planned` or `running` and that the persisted agent belongs to the exact session and canonical project. It writes the immutable link while the Todo store lock is held.
- The same locked operation records the Todo as `running` before the synchronous dispatcher start. A canceled, blocked, done, foreign, or missing Todo cannot be linked and dispatched.
- The active Pi session/project identity is revalidated after acquiring the Todo lock, after durable link binding, and immediately before dispatch. A switch during that window prevents the runner call and leaves an auditable blocked or unstarted task for review.
- If Pi aborts after enqueue but before dispatch, no runner call occurs. If the launch claim had already moved the Todo to running, it is moved to blocked; the queued agent is canceled.
- Todo cancellation through the Pi tool cancels all linked agents owned by that session/project and waits for their durable terminal state.
- Once every linked agent is terminal, `TaskAgentTodoReconciler` moves an active Todo to `blocked` with an independent-verification reason. Agent success never marks a Todo `done`.
- Startup recovery never replays prior agent execution. An unlinked queued agent is interrupted; a linked running Todo is blocked; the durable relation remains read-only and does not grant execution authority.

## Code and test evidence

- `src/agents/pi-agent-tools.ts`: validates the current session/project and routes Todo-bound launches through the trusted binder.
- `src/agents/agent-runtime.ts`: registers cancellation against the dispatcher before execution and cancels persisted queued work when binding or launch fails.
- `src/runtime/todo-store.ts`: serializes binding/launch against Todo updates, revalidates identity at the locked launch boundary, and records the running claim before dispatch.
- `src/runtime/trusted-task-agent-binder.ts` and `src/runtime/task-agent-link-store.ts`: validate ownership and persist immutable, private links.
- `src/runtime/task-agent-reconciler.ts`: waits for all linked attempts to terminate and blocks for independent review; never completes the Todo.
- `tests/eco07-launch-recovery.test.ts` and `tests/trusted-task-agent-binder.test.ts`: failed persistence, link and completion visibility after restart without redispatch, terminal Todo rejection, abort during binding, dependency enforcement, duplicate launch rejection, and identity change before runner invocation.
- `tests/pi-agent-runtime.test.ts`: Pi tool launch, result-to-Todo reconciliation, and cancellation propagation.
- `scripts/verify-pi-package.mjs`: packaged real-Pi RPC verifies linked task/agent projection after process restart and session isolation without invoking a model.

The targeted suites and typecheck must be recorded against the published candidate. The real Pi RPC package check proves the Pi host projection and restart read; it does not prove authenticated agent execution or provider-backed recovery.

## Remaining closure gate

Run `.github/workflows/eco07-groq-recovery.yml` against the exact published SHA on Linux, Windows, and macOS. Review the uploaded event artifact for the same linked Todo, interruption, blocked recovery, explicit resume, no duplicate work, verified terminal outcome, and session/project isolation. If provider quota or workflow access prevents this, retain ECO-07 as PARTIAL and report the exact blocker.
