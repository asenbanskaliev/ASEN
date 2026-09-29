---
name: asen-proposal
description: "Trigger: proposal, define change, establish scope. Convert an explored change into bounded intent, scope, risks, rollback and measurable success criteria."
---
## Activation Contract
Use before non-trivial implementation when intent and boundaries must be made explicit.
## Hard Rules
- State in-scope and out-of-scope behavior.
- Every proposal has rollback and measurable success criteria.
- Reference observed repository areas rather than generic architecture.
- A proposal grants no write authority.
## Decision Gates
| Situation | Action |
| --- | --- |
| Scope remains ambiguous | Return to exploration |
| Independent rollback boundaries exist | Split proposals/work units |
| Risk cannot be bounded | Escalate planning before mutation |
## Execution Steps
1. State intent and user-visible/technical outcome.
2. Bound scope and exclusions.
3. Name affected areas, dependencies and risks.
4. Define rollback and success criteria.
## Output Contract
Return intent, scope, exclusions, approach, affected areas, risks, rollback, dependencies and success criteria.
## References
None.
