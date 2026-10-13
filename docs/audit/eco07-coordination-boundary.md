# ECO-07 task-agent coordination boundary

## Implemented

- Read-only coordinator joining the existing session-scoped Todo and agent stores.
- Pi command `asen-task-agents` exposes the projection when both stores are available.
- Exact taskId:role correlation is restricted to known orchestrator roles and verified matching session/project identities.
- Neither completion nor interruption of an agent changes the Todo state.
- Tests cover cross-session visibility, forged role/identity/prefix collisions, and blocked Todo recovery after restart.

## Deliberate limits

Pi-started explorers have opaque `agent-UUID` IDs, so they cannot be reliably correlated to Todos by naming convention. A durable explicit relation needs its own bounded contract, atomic persistence, migration/reconciliation rules, and separate acceptance tests. Do not infer links from matching prompts or times.

The generic PersistentTaskStore is not part of production Pi lifecycle. Never invoke its global recoverAll on session startup; it lacks live-process ownership checks. AgentRuntime already uses PersistentAgentStore with explicit continuation.

## Remaining exit criteria

1. Design and implement explicit task-agent link records with fail-closed recovery and immutable session/project ownership, or document why orchestrated IDs alone suffice.
2. End-to-end Pi crash/restart tests of the new command and link behavior, including multiple live processes.
3. Independent security review and final test execution on Linux, Windows and macOS.

No CI or tests were launched for this unattached commit.
