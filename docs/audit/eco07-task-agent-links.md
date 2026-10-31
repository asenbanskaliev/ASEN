# ECO-07 explicit link journal

`TaskAgentLinkStore` is a private, versioned, append-only correlation journal. Agent IDs have immutable task/session/project ownership. Conflicting reuse, malformed data, and cross-session/project reads fail closed. The link does not authorize execution.

The production Pi launch path uses `TrustedTaskAgentBinder.launch`. It verifies the already-persisted Todo and queued agent, writes the link while the Todo store lock is held, records the Todo as running, and only then invokes the dispatch closure for that exact agent request. The binding path is not exposed as a Pi tool.

If link persistence fails, the queued agent is canceled before dispatch. If Pi aborts during binding, the agent is canceled and a newly claimed Todo becomes blocked. A crash never triggers automatic replay. When all linked agents finish, the Todo becomes blocked for independent verification and is never automatically marked done.

The authenticated exact-candidate interruption/restart experiment passed with NVIDIA NIM and Pi 1.1.0 on Ubuntu 24.04: run `38789463310`, artifact `11999926486`, candidate `9d3f2e0710fd74b770e94b3aa2a2e43f3fd3e445`. The reviewed receipt proves same-task recovery, explicit resume, ordered exactly-once steps, and session/project isolation. The separate model-free Pi support matrix passed on Linux, macOS, and Windows; provider-backed recovery is not claimed for macOS/Windows.
