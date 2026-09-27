---
name: asen-explore
description: "Trigger: explore, investigate, understand codebase, compare approaches. Perform read-only evidence-based exploration before committing to a change."
---
## Activation Contract
Use when scope, mechanism, affected areas or viable approaches require investigation.
## Hard Rules
- Exploration is read-only.
- Read actual entry points, implementation and tests; never infer architecture from filenames alone.
- Separate observed facts from hypotheses.
- Do not authorize implementation.
## Decision Gates
| Situation | Action |
| --- | --- |
| One bounded known edit | Exploration may be skipped |
| Four or more files need understanding | Use isolated exploration |
| Evidence contradicts the request hypothesis | Report the contradiction and follow evidence |
## Execution Steps
1. Resolve the exact question and repository scope.
2. Map current behavior, affected code, tests, dependencies and constraints.
3. Compare viable approaches when more than one exists.
4. Identify risks, unknowns and the smallest next decision.
## Output Contract
Return current state, affected areas, approaches, evidence, risks, unknowns and readiness for proposal.
## References
None.
