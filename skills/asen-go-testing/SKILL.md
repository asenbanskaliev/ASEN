---
name: asen-go-testing
description: "Trigger: Go tests, go test, table tests, golden files, Go TUI tests. Apply deterministic behavior-focused Go testing patterns."
---
## Activation Contract
Use when writing/reviewing Go tests or diagnosing Go test coverage and interactive/golden behavior.
## Hard Rules
- Prefer table-driven cases for repeated behavior.
- Test public behavior/state transitions, not implementation trivia.
- Use temporary directories for filesystem tests.
- Keep slow/external integration tests explicitly separable.
- Golden updates are deterministic and must pass again without update mode.
## Decision Gates
| Situation | Action |
| --- | --- |
| Pure/parser behavior | Table-driven unit test |
| Filesystem behavior | Temporary isolated directory |
| Interactive state transition | Direct model/state test first |
| Full interaction/external command | Integration test with explicit boundary |
## Execution Steps
1. Identify smallest behavior boundary.
2. Select appropriate Go test pattern.
3. Add success/failure/edge cases.
4. Run narrow test then relevant broader suite.
5. Inspect any golden change and rerun normally.
## Output Contract
Return tests changed, scenarios, commands/results, golden changes and skipped integration scope.
## References
None.
