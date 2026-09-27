---
name: asen-verify
description: "Trigger: verify candidate, compliance check, quality gate. Prove candidate behavior against requirements with real execution evidence."
---
## Activation Contract
Use as the candidate-bound quality gate after implementation or on an explicit verification request.
## Hard Rules
- Verification is read-only.
- Execute relevant tests/builds; static inspection alone does not prove behavior.
- Every required scenario maps to real passing evidence or remains non-compliant.
- Evidence must match exact repository, candidate and revision.
- Do not fix findings during verification.
- When TDD evidence is required, validate reported test files/cases against the current candidate and rerun the claimed GREEN tests.
- Classify relevant tests by layer when that distinction affects confidence; unavailable higher layers are reported, not fabricated.
## Decision Gates
| Situation | Action |
| --- | --- |
| Required scenario has no executing proof | Block verification |
| Relevant test is skipped | Report unresolved coverage |
| Candidate changes | Invalidate affected verification |
| Any required evidence fails | Fail closed |
## Execution Steps
1. Check task/spec completeness.
2. Inspect structural compliance.
3. If TDD applies, audit safety-net/RED/GREEN/triangulation evidence against real test files and current execution.
4. Execute tests/build/type checks appropriate to the change.
5. Build scenario-to-evidence compliance matrix and note test layer/coverage where available.
6. Record findings and verdict without mutation.
## Output Contract
Return completeness, commands/results, TDD compliance when applicable, scenario compliance, test-layer/coverage evidence when available, structural findings, unresolved risks and candidate-bound verdict.
## References
None.
