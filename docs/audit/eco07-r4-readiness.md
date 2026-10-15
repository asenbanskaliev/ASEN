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
- `tests/eco07-launch-recovery.test.ts`, `tests/trusted-task-agent-binder.test.ts`, and `tests/pi-agent-runtime.test.ts`: failed persistence, link and completion visibility after restart without redispatch, terminal Todo rejection, abort during binding, dependency enforcement, duplicate launch rejection, and a Pi project change while the Todo launch lock is held with zero runner calls.
- `tests/pi-agent-runtime.test.ts`: Pi tool launch, result-to-Todo reconciliation, and cancellation propagation.
- `scripts/verify-pi-package.mjs`: packaged real-Pi RPC verifies linked task/agent projection after process restart and session isolation without invoking a model.

The targeted suites and typecheck must be recorded against the published candidate. The real Pi RPC package check proves the Pi host projection and restart read; it does not prove authenticated agent execution or provider-backed recovery.

## Remaining closure gate

Run `.github/workflows/eco07-groq-e2e.yml` against the exact published SHA on Linux, Windows, and macOS. It supports a manual NVIDIA NIM run (`NVIDIA_API_KEY`, `deepseek-ai/deepseek-v4.1-flash`, included in the Pi 1.1.0 model catalog) and a separate Groq run (`GROQ_API_KEY`, `openai/gpt-oss-120b`). On `feat/strict-parity-prerequisites`, a push that changes this workflow and has `[ECO07-NVIDIA]` in its commit subject starts one NVIDIA run on Ubuntu at that exact pushed SHA; routine pushes do not start it. Only the selected credential enters its provider step. A successful NVIDIA run is evidence for Pi recovery through NVIDIA NIM; it does not establish Groq compatibility or close a Groq-specific criterion. Review the uploaded event artifact for the same linked Todo, interruption, blocked recovery, explicit resume, no duplicate work, verified terminal outcome, and session/project isolation. If provider quota, credentials, or workflow access prevents this, retain ECO-07 as PARTIAL and report the exact blocker.

Provider integration is implemented locally: Pi's NVIDIA provider is native, the ASEN Pi child credential allowlist includes `NVIDIA_API_KEY`, and ECO-07 resolves its default model. This is not yet real-provider evidence. The dispatch must run against the exact published SHA and its event artifact must pass review before the NVIDIA-backed recovery slice can be called verified.

The first marked branch run on candidate `552ba441a1b3cf936a79fbeca1f7036715a77519` reached Pi 1.1.0 and NVIDIA, created the task, then failed because the evidence harness looked for the legacy `.asen/todos.json` file while the live extension writes project-scoped `.asen/todos/projects/<project-key>/active.json` shards. The harness now resolves the same shard through the Todo store's canonical path helper. This was an ASEN evidence-harness defect, not a provider quota or credential failure; the failure artifact remains available for audit. A marked push affecting the workflow or recovery harness starts the next exact-SHA NVIDIA attempt.

## R4 review on 2026-10-14

Reviewed candidate `fb26e5ae0092cfbebeeec115614db0b401f15871` and the current Pi/Todo ownership path. The durable link is recorded before dispatch; recovery quarantines interrupted work and does not replay it; identity and project checks gate dispatch; successful agents remain blocked until a separate result review. Local tests cover failed link writes, abort during binding, duplicate launch, recovery after restart, and cross-session/project rejection.

Focused R4 verification on the candidate source plus the current regression-test addition passed **152/152 tests**, including `eco07-launch-recovery`, `trusted-task-agent-binder`, `task-store`, and `pi-agent-runtime`; typecheck and `git diff --check` passed. This is local deterministic evidence, not a real Pi/provider run.

**Decision remains PARTIAL / OPEN.** No authenticated recovery run was launched in this batch. Previous hosted recovery attempts in the closure record either failed to resume the task or stopped before creating one. The required successful same-task restart, preserved owner identity, explicit resume, exactly-once steps, verified terminal result, and final artifact review have not been demonstrated together on one exact candidate. Do not mark ECO-07 complete or infer it from the 24-cell model-free host matrix.
