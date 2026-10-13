# ECO-07 task-agent coordination boundary

## Implemented

- `TaskAgentCoordinator` projects owned Todos and durable agents through an explicit session/project scoped link store.
- Pi command `asen-task-agents` exposes that read-only projection.
- `asen_agent_start` may take an owned Todo ID. Agent enqueue, durable link, Todo running claim, and dispatcher start are ordered so execution cannot begin before association.
- Todo-bound launch is serialized with state changes. A terminal, blocked, missing, or foreign Todo fails closed before dispatch.
- Pi cancellation updates the Todo and cancels its linked agents. Agent terminal results move a running Todo to blocked only after all linked agents finish, leaving independent verification before any user marks it done.
- Process recovery never replays an agent. Unlinked queued work becomes interrupted; linked running Todos become blocked; exact session/project ownership remains required.
- Tests cover immutable link persistence, restart visibility without redispatch, cancellation, abort during the binding window, failed writes, terminal Todo rejection, and the real Pi package's session/restart projection.

## Consistency boundary

The Todo store, agent store, and link journal are separate files, so a crash cannot atomically commit all three. The launch order is deliberately conservative: the agent is persisted first; the link is persisted while the Todo lock is held; the Todo is moved to running; then the exact in-memory dispatcher call starts synchronously before releasing that lock. A crash before linking leaves no execution; a crash after linking is recovered as interrupted/blocked and is never automatically replayed. The link is observational and grants no permission.

Agent completion alone never marks a Todo `done`. When every linked agent is terminal, the Todo becomes `blocked` for independent verification. A user must explicitly resume it before recording completion.

## Remaining exit criteria

The authenticated, provider-backed Pi interruption/restart journey must pass on the exact published candidate across Linux, Windows, and macOS, and its event artifacts must be reviewed. The package verifier proves real-Pi read projection and restart/session isolation without a model; it does not prove the authenticated launch-and-resume journey.
