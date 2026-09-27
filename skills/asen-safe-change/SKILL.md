---
name: asen-safe-change
description: "Trigger: code change, source mutation, safe implementation. Require bounded scope, exact authorization and rollback before privileged mutation."
---
## Activation Contract
Use for every source/code mutation.
## Hard Rules
- Mutation requires exact task, repository, candidate and authorized surfaces.
- Scope and rollback evidence exist before mutation.
- Only the authorized writer may mutate overlapping surfaces.
- Scope expansion stops mutation and returns to planning.
## Decision Gates
| Situation | Action |
| --- | --- |
| Candidate/context mismatch | Refuse mutation |
| Scope or rollback evidence missing | Block mutation |
| Overlapping writer exists | Block or isolate surfaces |
| Change creates new candidate | Rebind subsequent evidence |
## Execution Steps
1. Validate issued context and candidate.
2. Validate bounded write surfaces, scope and rollback.
3. Perform only authorized mutation.
4. Freeze resulting candidate and invalidate stale candidate-bound evidence.
## Output Contract
Return authorization checked, surfaces changed, rollback, resulting candidate and invalidated evidence.
## References
None.
