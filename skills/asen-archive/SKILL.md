---
name: asen-archive
description: "Trigger: archive completed change, close engineering cycle. Preserve verified final-state contracts and immutable audit history after successful verification."
---
## Activation Contract
Use only after the exact final candidate has passed required verification and closure gates.
## Hard Rules
- Never archive a candidate with blocking findings.
- Final-state behavior is synchronized before historical material is archived.
- Archived evidence is immutable audit history.
- Destructive synchronization requires explicit authorization.
## Decision Gates
| Situation | Action |
| --- | --- |
| Verification is not valid for final candidate | Block archive |
| Final-state sync is destructive | Require explicit approval |
| Archive contents are incomplete | Block closure |
## Execution Steps
1. Validate final candidate and verification authority.
2. Synchronize final-state behavioral contracts.
3. Preserve proposal/spec/design/tasks/verification evidence as history.
4. Verify active state no longer points at unfinished work.
## Output Contract
Return final candidate, synchronized contracts, archived artifacts, verification evidence and unresolved closure items.
## References
None.
