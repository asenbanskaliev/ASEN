---
name: asen-apply
description: "Trigger: implement approved tasks, apply change. Execute only authorized work units against the exact task, repository and candidate context."
license: MIT
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Use only for implementation after scope and required pre-mutation gates are satisfied.
## Hard Rules
- Implement only assigned tasks and authorized write surfaces.
- Read applicable specification, design and existing code before mutation.
- Use proportional test-first development for organic implementation: add a meaningful behavior test, observe its intended failure, then make the smallest change and run focused checks. Never fabricate RED evidence.
- When a meaningful pre-change behavior test is not possible (for example, documentation-only work), explain the exception and run the applicable checks; this guidance does not waive a required test or admission gate.
- If the strict `asen-tdd` skill is selected, follow its lifecycle contract unchanged.
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
4. Run focused verification and record deviations. Organic selection does not require a second RED run, V8 coverage proof or phase commits solely to satisfy a strict TDD lifecycle; ordinary tests, review, scope and authorization still apply.
5. Freeze the resulting candidate only after mutating steps finish.
## Output Contract
Return completed tasks, files changed, tests/evidence, deviations, issues, resulting candidate and remaining work.
## References
None.
