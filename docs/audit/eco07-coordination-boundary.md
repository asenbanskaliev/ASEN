# ECO-07 integration boundary (no automatic CI requested)

The existing Pi extension owns SessionTodoStore and AgentRuntime. AgentRuntime owns PersistentAgentStore and Dispatcher. The independent PersistentTaskStore is not a production authority and must not be auto-recovered while other processes may still own work.

The new TaskAgentCoordinator is a read-only projection of session-scoped tasks and delegated agents. It does not dispatch, continue, grant access, or mark tasks done. It links agents only when their IDs follow the orchestrator's taskId:role convention. This convention is not yet a durable parent relationship for all Pi-created agent IDs.

Remaining before production completion: explicit durable task-to-agent binding without changing existing store schemas; integration into Pi with guarded identity checks; process crash and concurrent session acceptance tests; independent security audit. Do not claim ECO-07 complete until these pass.
