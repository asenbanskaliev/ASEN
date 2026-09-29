---
name: asen-review
description: "Trigger: independent review, high-risk review, candidate review. Perform read-only candidate-bound review before verification or release when required."
---
## Activation Contract
Use for high/unknown risk or whenever independent review is explicitly required.
## Hard Rules
- Freeze exact repository and candidate revision.
- Reviewer is read-only and independent from the writer when independence is required.
- Findings bind to the exact candidate.
- Corrective mutation creates a new candidate and invalidates prior review authority.
## Decision Gates
| Situation | Action |
| --- | --- |
| Candidate identity is missing | Block review authority |
| Critical/high finding survives | Block verification |
| Candidate changes after review | Re-review affected scope |
## Execution Steps
1. Resolve exact candidate and scope.
2. Review behavior, tests, rollback and unresolved risk.
3. Record findings as candidate-bound evidence.
4. Return verdict without mutation.
## Output Contract
Return candidate, reviewed scope, findings, evidence, unresolved risk and review verdict.
## References
None.
