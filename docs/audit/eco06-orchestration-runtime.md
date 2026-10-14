# ECO-06 — orchestration runtime audit

## Decision

**PARTIAL / OPEN.** ASEN can turn verified ODD facts into a persisted executable Todo DAG, dispatch dependency-ready read-only Pi roles including clarification-only work, and run a bounded `worker` through a candidate-bound, explicitly authorized Pi lifecycle. The worker is persisted as a descriptive record before dispatch; write authority remains in memory and is never restored after restart. A linked task remains blocked for independent human review after the agent returns. Full ECO-06 remains open because `primary` dispatch, structured lifecycle grants, and restart recovery/re-authorization of an interrupted writer are not implemented.

## Implemented and exercised

- The model-facing `asen_plan_request` bridge accepts ordinary-language requests through the Pi coordinator, which is instructed to derive ODD facts from read-only project inspection; it creates task identity internally, then reuses the existing ODD route, skill selection, DAG materialization and atomic session/project Todo persistence. The lower-level `/asen-plan` materializer still accepts validated ODD facts for internal use.
- Changing the Pi session or project while planning or dispatch confirmation is pending rejects the operation. Read-only dispatch revalidates identity after confirmation and repeatedly inside the Todo launch lock, including immediately before the trusted binder starts the agent.
- `asen_plan_dispatch_next` selects one dependency-ready task by saved priority, confirms the exact role/instruction, verifies any current skill registry selection, and dispatches `clarifier`, `explorer`, `reviewer`, `verifier`, or a controlled `worker`.
- A `clarifier` is durably queued with its exact role provenance and no candidate, write surfaces, phase grant, writer admission, or delegated skill phase. Identity/revision drift, decline, and oversized instructions launch nothing and leave the Todo planned. Under the existing Todo launch lock, the complete confirmed snapshot is matched before enqueue, so concurrent dispatch admits one durable agent and instruction, plan, or dependency drift admits none. Its link remains persisted before runner start, and successful output leaves the Todo blocked for explicit acceptance.
- A planned worker retains the exact original ODD authorization facts, candidate revision, and ordered write surfaces. Before asking permission, dispatch recomputes ODD routing, checks the candidate is current, verifies the selected skills and surfaces, and requires an organic bounded lifecycle. After the visible Pi confirmation, it rechecks project/session identity, the persisted Todo revision and plan, and Git HEAD. It then creates one-use writer admission and binds the Todo/agent link before running the worker.
- Only organic bounded worker changes are supported by this path. The Pi confirmation displays the candidate and exact write surfaces and instructs the worker to stop without committing or merging. The runner receives a one-use bound receiver; it does not receive the admission token itself.
- `PersistentAgentStore.enqueueControlledWorker` persists only the worker's descriptive task record. Candidate, write surfaces, skill context, and writer admission are omitted from the durable agent record, so restarting cannot replay the write. An interrupted worker requires a fresh plan and explicit authorization.
- Worker success is reconciled to `blocked`, not `done`. `asen_todo_accept_result` displays the saved terminal result and requires independent confirmation that the actual diff stayed within the approved surfaces and met the acceptance criteria.
- `TrustedTaskAgentBinder` persists Todo ownership and the agent link before the Pi runner starts. Agent terminal outcomes reconcile to `blocked`; they never complete a Todo.
- `asen_todo_accept_result` requires a blocked planned task, an immutable task-agent link, matching session/project/role, a durable successful terminal agent record, a bounded full result view, independent user evidence, and explicit Pi UI confirmation. Direct `done` is rejected for a linked plan task. Acceptance is persisted as ordered `running` then `done` events, so a crash between them recovers to review rather than completing silently.
- Interrupted linked read-only work requires explicit continuation; failed linked read-only work permits one explicitly confirmed retry. Both bind the child attempt before dispatch. Writes and cancelled tasks are not retried.

## Evidence

- `tests/extension-state-commands.test.ts`: exact-fact planning, atomic persisted DAG, dependency gating, and session-change rejection while waiting for Todo persistence.
- `tests/pi-agent-runtime.test.ts`: production Pi planning/dispatch, role and skill matching, identity change rejection, link-before-run, result reconciliation, cancellation, continuation, bounded retry, and full verifier-result acceptance after restarting the Pi runtime. The ECO-06 writer integration test proves decline leaves the task planned, an approved run uses the persisted candidate and exact scope, the durable agent record excludes authority, success remains blocked for review, and explicit acceptance completes the task.
- `tests/agent-store.test.ts`: generic persistence rejects worker and authority-bearing requests; the Pi runtime integration inspects the controlled worker record to confirm authority was stripped.
- Correction verification history remains explicit: an earlier combined runtime run passed 34/35 after a three-second Todo-reconciliation timeout, and a later independent focused run passed 10/11 after the concurrency case timed out. The concurrency failure was a test-harness polling deadline, not a reproduced production duplicate. The regression now coordinates runner entry and terminal publication directly, then asserts the exact winner, safe blocked loser, single durable agent/link/invocation, completed agent, and blocked Todo. During the bounded correction verification, the first combined runtime run again passed 34/35 when a separate retry reconciliation remained running past its deadline; the required second run passed 35/35.
- `tests/pi-todo-tools.test.ts`: explicit acceptance confirmation, restart recovery, and rejection of results too large for complete UI review.
- `tests/pi-host-preflight.test.ts`: public tool inventory and Pi host compatibility.
- Local checks on the working tree: `npm run check` (typecheck, full test suite, parity/skill/memory/ecosystem/upstream-boundary audits; 1,393 passed and 12 skipped), plus a focused 85-test runtime/persistence suite and a final rerun of the ECO-06 worker integration test after its duplicate-dispatch assertion was added. `git diff --check` is clean.
- The ecosystem audit reports normative source proof as not admitted because its retained baseline repository is unavailable. The check passes without making a global parity claim; ECO-06 remains PARTIAL.

These local checks are not CI evidence for a published SHA. Hosted CI and Release Gate results must be read from the exact commit.

## Remaining work

- The `primary` plan role still has no Pi dispatch path. The controlled writer currently supports only the organic bounded lifecycle; structured workflows and lifecycle phase grants are not wired into the persisted Todo DAG. Clarifier interruption may be exposed for review after restart, but clarification has no automatic continuation path.
- The agent record intentionally does not preserve write authority. A process restart cannot resume a partially executed writer automatically; the task must be inspected, replanned against the current candidate, and explicitly reauthorized. ECO-06 still needs a dedicated interrupted-during-operation test to establish safe recovery behavior for partially applied file changes.
- Plain text passed directly to the lower-level `/asen-plan` command still produces conservative missing-fact triage. The chat bridge relies on the configured Pi model to follow coordinator guidance and infer facts; this deterministic local change does not prove behavior with a live provider.
- Acceptance is an explicit human review of the persisted result and recorded acceptance instruction; ASEN does not execute arbitrary acceptance commands inferred from agent output.
- Concurrency is bounded by the agent dispatcher, but plan scheduling remains one confirmed task per Pi tool call. There is no automatic multi-task scheduler or provider quota policy.

No permission is inferred from a plan, model response, skill selection, or successful agent completion.

## R4 review on 2026-10-14

The current controlled-write path was rechecked against the exact `fb26e5ae0092cfbebeeec115614db0b401f15871` source. One-use write admission is bound to the current candidate, repository, role, and exact surfaces; the persisted agent record excludes the authority token and write scope; completion remains blocked for independent review. Primary-session dispatch still has no execution dispatcher. Clarification-only dispatch is now implemented as a durable read-only role with exact provenance and explicit result acceptance.

Expanded `tests/plan-dispatcher-role-boundaries.test.ts`: approved clarification proves exact durable read-only provenance and link-before-run ordering; concurrent dispatch proves one durable admission; post-confirmation instruction, plan, and dependency drift is rejected before enqueue; decline and identity/revision drift remain planned; `primary` still returns blocked before confirmation or launch. The historical focused R4 set passed **152/152 tests** across the plan, dispatcher, Pi agent, Todo persistence, recovery, evidence-bundle, and matrix contracts.

**Decision remains PARTIAL / OPEN.** Remaining work includes usable primary execution, structured lifecycle grants, and a real interrupted-write scenario showing recovery requires a fresh candidate and explicit reauthorization. Existing tests demonstrate that write authority is not restored from disk; they do not establish safe recovery from partially applied file changes on a real Pi host. No automatic multi-task scheduler or provider quota policy is claimed.

## Authorization snapshot race correction (2026-10-14)

Independent review found a gap between the worker's post-confirmation snapshot check and `TrustedTaskAgentBinder.launch`: a concurrent Todo transition could occur before the binder acquired the launch lock. The old worker path accepted an already-running Todo and could therefore dispatch work authorized against a stale snapshot.

The controlled worker now receives enqueue and dispatch callbacks only through `launchExact`. The binder compares the complete persisted Todo and requires `planned` while holding the same lock that records the running claim, binds ownership, and dispatches. The agent record is not durably enqueued until that exact comparison succeeds. The worker path has no direct-dispatch fallback. `tests/trusted-task-agent-binder.test.ts` reproduces the stale-state race and requires zero enqueue, zero link and zero runner calls; `tests/pi-agent-runtime.test.ts` continues to cover the approved writer path.

This closes the local stale-snapshot admission gap only. ECO-06 remains **PARTIAL / OPEN**: primary-session dispatch, structured lifecycle grants, real interrupted-write recovery and native review remain separate gates.
