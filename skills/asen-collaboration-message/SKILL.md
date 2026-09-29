---
name: asen-collaboration-message
description: "Trigger: review comment, issue reply, repository message, async collaboration. Write concise, actionable human collaboration messages."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for human repository and asynchronous collaboration messages, including review comments and issue replies. This Skill must not activate for UI copy, documentation, or source comments unless the message itself is requested.

## Hard Rules
- Use the target-context language unless an explicit user language or tone override applies: English to English, Spanish to Spanish, and mixed context to the target-message language.
- Keep public Spanish neutral and professional unless the context requests otherwise.
- Be warm, direct, evidence-based, with no blame.
- Use 1–3 short paragraphs by default.
- Put the highest-value actionable point first and allow no preference pile-on.
- Explain the technical impact and reason with concrete evidence.
- When action is required, give exactly one clear next action.
- Prohibit the em dash in produced messages.
- Never claim approval, verification, intent, or authority not held.

## Decision Gates
| Situation | Action |
| --- | --- |
| Required correction | State the defect, evidence, impact, and one required action |
| Suggestion | Label it non-blocking and avoid preference pile-on |
| Approval | State only approval actually held and its evidenced scope |
| Bounded question | Ask one answerable question when evidence is incomplete |

## Execution Steps
1. Determine the target-message language, requested tone, and message type.
2. Select the highest-value point; discard unrelated minor preferences.
3. Lead with the conclusion or request, then evidence and technical impact.
4. Add exactly one clear next action only when action is required.
5. Remove blame, unsupported certainty, authority claims, and em dashes.

## Output Contract
Return one concise collaboration message, normally 1–3 short paragraphs, with concrete evidence, technical reason, and exactly one next action when required.

## References
None.
