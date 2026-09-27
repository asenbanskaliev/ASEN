---
name: asen-tdd
description: "Trigger: behavior change, TDD, test-first change. Prove deterministic behavior with an honest RED, minimum GREEN and behavior-preserving refactor."
---
## Activation Contract
Use for behavior changes where a meaningful deterministic failing test can be demonstrated.
## Hard Rules
- State the behavior before writing the test.
- Execute and record RED; never fabricate a failure.
- Implement only enough for GREEN before refactoring.
- If meaningful RED is impossible, record why and use proportionate verification instead.
## Decision Gates
| Situation | Action |
| --- | --- |
| Test passes before change | Reassess test or existing behavior |
| RED is non-deterministic | Do not claim TDD evidence |
| GREEN introduces unrelated behavior | Split the work unit |
## Execution Steps
1. Define expected behavior and focused test.
2. Run and record RED.
3. Implement minimum authorized change and record GREEN.
4. Refactor while GREEN remains true.
5. Run proportionate regression checks.
## Output Contract
Return behavior, RED/GREEN evidence, refactor result, regressions and any TDD limitation.
## References
None.
