---
name: asen-odd
description: "Trigger: route work, unknown scope, high risk, multi-file work. Select the smallest safe engineering route from observed scope, uncertainty and risk."
---
## Activation Contract
Use when scope, uncertainty, risk or task size requires a routing decision before execution.
## Hard Rules
- Establish task, repository, scope and constraints from evidence.
- Use the smallest safe route; narrative confidence never implies VERIFIED.
- Keep write authority single-threaded unless surfaces are proven isolated.
- Candidate-changing work invalidates stale evidence.\n- ODD routing and SDD workflow selection are separate: substantial work does not imply SDD; SDD requires explicit genuine selection.\n- Read-only ODD routes create no artifact or write authority. Substantial routes carry full-memory-mirror, TODO and resume obligations until their owning runtime evidence exists.\n- A writer needs a genuine one-use admission; Skill selection alone is never write authority.
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
## Output Contract
Return route, risk, reasons, isolation, selected skill obligations and route evidence.
## References
None.
