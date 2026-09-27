---
name: asen-collaboration-message
description: "Trigger: review comment, issue reply, collaboration message. Write concise evidence-based engineering collaboration messages with a clear next action."
---
## Activation Contract
Use for repository collaboration comments where technical findings or requested changes must be communicated.
## Hard Rules
- State observed behavior/evidence before interpretation.
- Be specific about location, impact and requested next action.
- Do not attribute blame or intent.
- Do not claim approval, authority or verification not actually held.
## Decision Gates
| Situation | Action |
| --- | --- |
| Blocking defect | Name evidence and required correction |
| Non-blocking improvement | Label it as suggestion |
| Evidence is incomplete | Ask a bounded question |
## Execution Steps
1. Identify evidence and impact.
2. State the smallest clear request or conclusion.
3. Include exact reproduction/reference when useful.
4. Remove blame, ambiguity and unsupported certainty.
## Output Contract
Return the collaboration message plus any evidence/reference needed to support it.
## References
None.
