---
name: asen-work-unit
description: "Trigger: implementation unit, commit split, review boundary. Keep behavior, tests, evidence and rollback aligned in one cohesive work unit."
---
## Activation Contract
Use when planning or implementing code/behavior changes and when splitting reviewable delivery.
## Hard Rules
- One unit represents one observable behavior/correction and rollback boundary.
- Keep implementation and focused verification together.
- Never split only by file type when that breaks behavioral coherence.
- Freeze candidate after all source-mutating steps for the unit.
## Decision Gates
| Situation | Action |
| --- | --- |
| Independent behavior or rollback appears | Split the unit |
| Unit cannot be verified independently | Refine its boundary |
| Scope grows unexpectedly | Stop and re-plan |
## Execution Steps
1. Define behavior and rollback boundary.
2. Identify implementation and verification belonging to it.
3. Execute as one cohesive unit.
4. Freeze candidate and bind evidence.
## Output Contract
Return unit purpose, scope, verification, rollback, candidate and any required split.
## References
None.
