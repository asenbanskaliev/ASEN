# ECO-07 R4 — current candidate review

## Current closeout — 2026-10-15

**VERIFIED for the agreed NVIDIA NIM / Ubuntu 24.04 scope.** The exact published candidate `9d3f2e0710fd74b770e94b3aa2a2e43f3fd3e445` ran real Pi `1.1.0` with `deepseek-ai/deepseek-v4.1-flash`. Workflow run `38789463310` succeeded; artifact `11999926486` (`sha256:5b9a17724773607c9f31c5a770dd75c91ab3cdaaa6a58e9089a1a09c8e2fb93b`) contains `result: PASS`.

The reviewed receipt records one task through `planned → running → blocked → running → done`, two distinct Pi process IDs, explicit resume confirmation, both ordered review steps exactly once, rejection of wrong-session/project visibility and mutation, and no approval, publish, or merge authority. NVIDIA credentials were used only in the provider step and their value was not recorded.

All PR CI workflows on that SHA passed, including the Ubuntu/macOS/Windows test and Pi support matrices, Release Gate, Phase 0 Architecture, and Pi 1.1 runtime evidence. Pi Free Smoke was skipped by its workflow condition, not counted as a pass. No Groq test is part of this closeout. The provider-backed recovery receipt is Linux-only; this does not claim NVIDIA model runs on macOS or Windows.

## Historical pre-run assessment

The earlier **PARTIAL / OPEN** assessment below predates the successful exact-candidate NVIDIA run and is retained only as the audit trail.

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

## Provider evidence scope

The approved evidence path uses NVIDIA NIM (`NVIDIA_API_KEY`, `deepseek-ai/deepseek-v4.1-flash`) with Pi 1.1.0. The exact-SHA Ubuntu run and its uploaded artifact have been reviewed and pass the task-recovery acceptance criteria. Provider-backed Windows/macOS recovery is outside the verified scope; the model-free host matrix passed on those operating systems. Do not describe the evidence as cross-platform provider execution.

Provider integration is implemented locally: Pi's NVIDIA provider is native, the ASEN Pi child credential allowlist includes `NVIDIA_API_KEY`, and ECO-07 resolves its default model. The run and reviewed artifact cited above provide the real-provider evidence for this scope.

The first marked branch run on candidate `552ba441a1b3cf936a79fbeca1f7036715a77519` reached Pi 1.1.0 and NVIDIA, created the task, then failed because the evidence harness looked for the legacy `.asen/todos.json` file while the live extension writes project-scoped `.asen/todos/projects/<project-key>/active.json` shards. The harness now resolves the same shard through the Todo store's canonical path helper. This was an ASEN evidence-harness defect, not a provider quota or credential failure; the failure artifact remains available for audit. A marked push affecting the workflow or recovery harness starts the next exact-SHA NVIDIA attempt.

The next NVIDIA run on `101974ddd49a84b75787a012f8f0ba654a5f17e3` recovered the same Todo after process kill, preserved session/project identity, obtained explicit resume confirmation, read and recorded both ordered review steps, and moved the task to done. Its artifact still reports FAIL because the harness looked only in the active Todo list after the store correctly archived the completed task. The verifier now includes completed project archives when checking the final state. The lifecycle evidence is promising but ECO-07 remains PARTIAL until a run emits a passing recovery artifact.

## R4 review on 2026-10-14

Reviewed candidate `fb26e5ae0092cfbebeeec115614db0b401f15871` and the current Pi/Todo ownership path. The durable link is recorded before dispatch; recovery quarantines interrupted work and does not replay it; identity and project checks gate dispatch; successful agents remain blocked until a separate result review. Local tests cover failed link writes, abort during binding, duplicate launch, recovery after restart, and cross-session/project rejection.

Focused R4 verification on the candidate source plus the current regression-test addition passed **152/152 tests**, including `eco07-launch-recovery`, `trusted-task-agent-binder`, `task-store`, and `pi-agent-runtime`; typecheck and `git diff --check` passed. This is local deterministic evidence, not a real Pi/provider run.

**Historical decision on 2026-10-14: PARTIAL / OPEN.** No authenticated recovery run had been launched in that batch. The later exact-candidate NVIDIA evidence above supersedes this assessment for the NVIDIA/Ubuntu scope only.
