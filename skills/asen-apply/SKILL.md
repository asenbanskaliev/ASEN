---
name: asen-apply
description: "Trigger: implement approved tasks, apply change. Execute only authorized work units against the exact task, repository and candidate context."
---
## Activation Contract
Use only for implementation after scope and required pre-mutation gates are satisfied.
## Hard Rules
- Implement only assigned tasks and authorized write surfaces.
- Read applicable specification, design and existing code before mutation.
- Follow TDD when selected; never fabricate RED evidence.
- Unexpected scope expansion stops the unit and returns to planning.
- Source mutation creates a new candidate that requires fresh candidate-bound evidence.
## Decision Gates
| Situation | Action |
| --- | --- |
| Authorization/context mismatch | Refuse mutation |
| Design is incomplete or contradicted | Stop and report |
| New independent behavior appears | Create a new work unit |
## Execution Steps
1. Validate exact task/repository/candidate authorization.
2. Load required Pi-native skill paths.
3. Execute the bounded work unit.
4. Run focused verification and record deviations.
5. Freeze the resulting candidate only after mutating steps finish.
## Output Contract
Return completed tasks, files changed, tests/evidence, deviations, issues, resulting candidate and remaining work.
## References
None.
