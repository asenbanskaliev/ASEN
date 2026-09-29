---
name: asen-status
description: "Trigger: continue change, phase status, next phase, lifecycle readiness. Resolve lifecycle state and next safe phase from authoritative artifacts and blockers."
---
## Activation Contract
Use before continuing, applying, verifying or archiving structured work when phase readiness is not already issued.
## Hard Rules
- Status is read-only and grants no mutation authority.
- Route from structured state and blockers, not conversational inference.
- Never substitute missing required artifacts with a different or stale copy.
- Notes are informational; blockers prevent dependent transitions.
## Decision Gates
| Situation | Action |
| --- | --- |
| Multiple active changes are ambiguous | Require exact selection |
| Required dependency is missing | Route to the producing phase |
| Genuine blocker exists | Stop dependent work and report it |
| Final candidate changed | Route back to required validation |
## Execution Steps
1. Resolve exact task/change and repository.
2. Read authoritative artifact/evidence state.
3. Compute dependency readiness and blockers.
4. Return one bounded next-phase token plus reasons.
## Output Contract
Return task/change, artifact/evidence states, dependencies, blockers, notes and one next recommended phase.
## References
None.
