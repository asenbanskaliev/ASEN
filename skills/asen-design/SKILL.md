---
name: asen-design
description: "Trigger: technical design, architecture decision, implementation approach. Design a change from real code, explicit contracts, threats and test strategy."
---
## Activation Contract
Use after scope/specification when implementation structure requires architectural decisions.
## Hard Rules
- Read affected code before designing.
- Every non-obvious decision records alternatives and rationale.
- Use existing project patterns unless the change intentionally replaces them.
- Include security/recovery threats when applicable.
- Open blocking questions stop design completion.
## Decision Gates
| Situation | Action |
| --- | --- |
| Existing pattern satisfies contract | Reuse it |
| Design changes a public contract | Make migration/rollout explicit |
| Security, authority or persistence boundary changes | Add threat analysis and fail-closed tests |
## Execution Steps
1. Map relevant code and interfaces.
2. Choose architecture and document tradeoffs.
3. Define data/control flow and concrete file changes.
4. Define testing, migration, rollback and threat strategy.
## Output Contract
Return approach, decisions, flows, file changes, interfaces, tests, threats, rollout and open questions.
## References
None.
