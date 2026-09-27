---
name: asen-tasks
description: "Trigger: implementation tasks, break down work, plan work units. Convert approved behavior and design into dependency-ordered, verifiable implementation units."
---
## Activation Contract
Use before multi-step implementation or whenever work must be divided into bounded units.
## Hard Rules
- Every task is specific, actionable, verifiable and small enough for one bounded work unit.
- Order tasks by dependency.
- Keep tests with the behavior they prove.
- Forecast review size; split independent behavior or rollback boundaries before coding.
## Decision Gates
| Situation | Action |
| --- | --- |
| Task spans independent behaviors | Split it |
| Task cannot name verification | Refine it |
| Forecast exceeds review boundary | Slice by cohesive work unit |
## Execution Steps
1. Read specification and design.
2. Enumerate file-level implementation obligations.
3. Group them into dependency-ordered work units.
4. Attach verification and rollback boundary to each unit.
## Output Contract
Return ordered tasks, dependencies, work-unit boundaries, verification obligations and workload risks.
## References
None.
