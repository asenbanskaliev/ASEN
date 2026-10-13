# ECO-07 explicit link journal

`TaskAgentLinkStore` is a private, versioned, append-only correlation journal. Agent IDs have immutable task/session/project ownership. Conflicting reuse, malformed data, and cross-session/project reads fail closed. The link does not authorize execution.

The production Pi launch path uses `TrustedTaskAgentBinder.launch`. It verifies the already-persisted Todo and queued agent, writes the link while the Todo store lock is held, records the Todo as running, and only then invokes the dispatch closure for that exact agent request. The binding path is not exposed as a Pi tool.

If link persistence fails, the queued agent is canceled before dispatch. If Pi aborts during binding, the agent is canceled and a newly claimed Todo becomes blocked. A crash never triggers automatic replay. When all linked agents finish, the Todo becomes blocked for independent verification and is never automatically marked done.

The remaining ECO-07 gate is the authenticated, exact-candidate Pi interruption/restart experiment and review of its Linux, Windows, and macOS artifacts. Unit and packaged Pi RPC tests do not replace that experiment.
