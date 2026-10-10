---
name: asen-odd
description: "Trigger: route work, unknown scope, high risk, multi-file work. Select the smallest safe engineering route from observed scope, uncertainty and risk."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for non-trivial, risky, multi-step or routing-sensitive work. Do not add routing ceremony to a simple known request. Derive scope, uncertainty, risk, review workload and test applicability from genuine original ODD facts.
## Hard Rules
- Establish task, repository, scope and constraints from evidence.
- Use the smallest safe route; narrative confidence never implies VERIFIED.
- Keep write authority single-threaded unless surfaces are proven isolated.
- Candidate-changing work invalidates stale evidence.
- ODD routing and SDD workflow selection are separate: substantial work does not imply SDD; SDD requires explicit genuine selection.
- Read-only ODD routes create no artifact or write authority. For substantial authorized work, use the existing task document and configured MemoryContext to preserve its full-memory-mirror, exact TODO state and next resume step. Read-only routes invoke no tracking persistence. Without configured memory, report the missing mirror; never claim persistence.
- A writer needs a genuine one-use admission; Skill selection alone is never write authority.
## Decision Gates
| Situation | Action |
| --- | --- |
| Simple bounded request | Direct route |
| High/unknown risk | Plan before mutation |
| Multiple non-trivial writes or broad exploration | Orchestrate isolated work |
| Explicit verification | Read-only verify route |
## Execution Steps
1. Assess scope and risk.
2. Select route and required isolation.
3. Select required skills and evidence.
4. Record the route decision before privileged mutation.
5. Mirror full task-document bytes with TODO and resume state through the bounded tracking bridge. Reject changed document bytes or candidate identity before resuming. Live Pi integration and MEM/ECO recovery remain separate evidence gates.
## Output Contract
Return route, risk, reasons, tracking and isolation state, selected skill obligations, test evidence or explicit exception, unresolved decisions and route evidence. Delegation selects agents; workflow selection chooses a mode. Neither descriptive structure grants write, review, delivery, merge or release authority.
## References
None.
