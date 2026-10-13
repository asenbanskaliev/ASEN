# ECO-07 explicit link journal

TaskAgentLinkStore is a separate, private, versioned, append-only correlation journal. It does not control execution, modify Todos or grant permission. Agent IDs have immutable owner bindings; conflicting reuse fails closed. A link may be created only by a future trusted coordination path after verifying that both the Todo and agent belong to the same active session/project.

Do not expose bind directly to Pi or infer links from agent prompts. The current read-only Pi command remains unchanged until a trusted creation and reconciliation flow is implemented.

Pending: secure end-to-end binding after durable agent enqueue, crash-gap reconciliation, independent verification of ownership, multi-process tests, integration into TaskAgentCoordinator, and full tests. Commits are unattached to the PR branch to honor the request not to trigger CI.
