---
name: asen-defect-workflow
description: "Trigger: defect, bug workflow, root cause, correction. Resolve defects from reproducible evidence and causal invariants rather than symptom-by-symptom patches."
---
## Activation Contract
Use for bug/defect work that needs reproduction, root-cause isolation, correction and proof.
## Hard Rules
- Reproduce current behavior before implementing the reported mechanism.
- Treat the reporter's mechanism as a hypothesis; the observed symptom is evidence.
- Group shared causes into one causal invariant and correction boundary.
- A self-reported fix is not evidence; re-run the original scenario on the new candidate.
- Review evidence never grants delivery authority.
## Decision Gates
| Situation | Action |
| --- | --- |
| Reproduction fails | Stop/narrow with evidence |
| Multiple symptoms share one cause | One root correction |
| Fix adds parallel state/flag/mechanism | Reconsider a simpler root correction |
| Candidate changes after validation | Revalidate |
## Execution Steps
1. Reproduce and capture negative control.
2. Map causal mechanism and affected flows.
3. Define rollback/work unit and behavior-first test.
4. Implement smallest root correction.
5. Freeze candidate and validate original journey independently.
## Output Contract
Return reproduction, causal invariant, affected flows, correction, tests, rollback, candidate and unresolved authority.
## References
None.
