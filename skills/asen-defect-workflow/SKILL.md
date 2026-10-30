---
name: asen-defect-workflow
description: "Trigger: defect, bug workflow, root cause, correction. Resolve defects from reproducible evidence and causal invariants rather than symptom-by-symptom patches."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate only for genuine defect intent or explicit bug work requiring reproduction, root-cause isolation, correction and proof. Do not activate merely because a normal implementation includes tests or because a reviewer supplied descriptive findings.
## Hard Rules
- Reproduce current behavior before implementing the reported mechanism.
- Treat the reporter's mechanism as a hypothesis; the observed symptom is evidence.
- Group shared causes into one causal invariant and correction boundary.
- A self-reported fix is not evidence; re-run the original scenario on the new candidate.
- Review evidence never grants delivery authority.
- Defect intent must survive routing into mutation intake; correction requires the exact one-use writer admission and candidate.
- Recovery evidence never substitutes for revalidation of the corrected candidate. Preserve defect intent in signed recovery; reject omission or downgrade. Keep organic correction independent of artificial SDD selection.
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
Return reproduction, causal invariant, affected flows, correction, tests, rollback, exact candidate and unresolved authority. Distinguish deterministic tests and fixture execution from live Pi behavior. Keep status PARTIAL until required model-backed probes are observed; loading this Skill alone proves no behavioral equivalence.
## References
None.
