---
name: asen-tdd
description: "Trigger: behavior change, TDD, test-first change. Prove deterministic behavior with an honest RED, minimum GREEN and behavior-preserving refactor."
---
## Activation Contract
Use for behavior changes where a meaningful deterministic failing test can be demonstrated.
## Hard Rules
- State the behavior before writing the test.
- Run a focused pre-change safety net when modifying existing behavior; unresolved baseline failures are reported before proceeding.
- Execute and record RED; never fabricate a failure.
- Implement only enough for GREEN.
- Triangulate behavior with a materially different case when logic has more than one meaningful path; a trivially green path is not proof.
- Refactor only after GREEN/triangulation and rerun tests after behavior-preserving changes.
- If meaningful RED is impossible, record why and use proportionate verification instead.
## Decision Gates
| Situation | Action |
| --- | --- |
| Test passes before change | Reassess test or existing behavior |
| RED is non-deterministic | Do not claim TDD evidence |
| GREEN introduces unrelated behavior | Split the work unit |
| Logic has multiple meaningful paths but only one case | Triangulate before refactor |
## Execution Steps
1. Run focused safety-net tests for existing behavior when applicable.
2. Define expected behavior and focused test.
3. Run and record RED.
4. Implement minimum authorized change and record GREEN.
5. Triangulate with distinct inputs/paths until required scenarios are covered, or record why the behavior is structurally single-case.
6. Refactor in small steps while GREEN remains true.
7. Run proportionate regression checks.
## Output Contract
Return behavior, safety-net result, RED/GREEN evidence, triangulation evidence or justified N/A, refactor result, regressions and any TDD limitation.
## References
None.
