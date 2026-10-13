# ECO-07 implementation checkpoint

Read-only TaskAgentCoordinator is wired into the Pi extension through the asen-task-agents command. Both stores are required; no new storage schema, dispatch authority, replay, or automatic task completion was introduced.

Current task-agent correlation recognizes only IDs emitted by orchestrator planning with the taskId:role convention. Pi explorer IDs are random and **not** yet durably linked to Todo IDs. Do not interpret missing links as evidence that no agents exist.

Next acceptance gates: durable explicit correlation with no authority transfer; process crash/restart tests through the Pi extension; cross-process concurrent session tests; audit of PID reuse and receipt-key handling. No CI requested or triggered by these unattached commits.
