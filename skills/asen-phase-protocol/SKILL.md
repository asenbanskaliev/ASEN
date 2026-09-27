---
name: asen-phase-protocol
description: "Trigger: delegated engineering phase, phase executor, lifecycle phase. Enforce executor-only delegation, authoritative handoff state, exact skill loading and structured phase results."
---
## Activation Contract
Use for every delegated lifecycle phase.
## Hard Rules
- A phase agent is an executor, not an orchestrator: do not redelegate unless its phase contract explicitly authorizes it.
- Load exact SKILL.md paths injected by the orchestrator before task-specific work.
- Consume the authoritative task/candidate/artifact handoff; do not re-derive a different state from ambient context.
- Missing required handoff data is a blocker, never permission to guess.
- Persist required phase evidence before returning success.
## Decision Gates
| Situation | Action |
| --- | --- |
| Exact skill paths were injected | Load those paths; ignore redundant fallback hints |
| Required artifact/evidence is unresolved | Return blocked |
| Candidate/handoff state conflicts with ambient state | Trust issued handoff and report conflict |
| Phase wants to redelegate | Refuse unless phase contract explicitly allows it |
## Execution Steps
1. Validate issued task/repository/candidate handoff.
2. Load injected exact skill paths.
3. Retrieve only declared required artifacts/evidence.
4. Execute the phase without delegation.
5. Persist candidate-bound phase evidence.
6. Return structured status.
## Output Contract
Return status (success/partial/blocked), executive summary, artifacts/evidence, next recommended phase, risks and skill resolution (paths-injected/fallback/none).
## References
None.
