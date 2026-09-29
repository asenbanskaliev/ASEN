---
name: asen-doc-design
description: "Trigger: technical docs, architecture docs, review guides, onboarding, contributor docs. Design human-facing documentation for fast action."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for human-facing technical, architecture, review, onboarding, and contributor documentation. Identify the audience and reader task before drafting. This Skill must not activate for private scratch notes, source comments, or ordinary code changes.

## Hard Rules
- Put the answer, decision, or outcome first; provide a quick path before detail.
- Apply progressive disclosure, chunking, and signposting so readers recognize where to act instead of reconstructing context.
- State the explicit review order and out-of-scope boundary.
- Provide an actionable checklist or reusable template when readers must perform or verify steps.
- Use tables only when they reduce comparison effort or ambiguity.
- Do not bury decisions in background, force recall, invent claims, or leave scope and verification implicit.

## Decision Gates
| Situation | Action |
| --- | --- |
| Reader must act now | Lead with outcome, quick path, and next action |
| Steps require execution or verification | Add an actionable checklist or reusable template |
| Review has several surfaces | State review order and out-of-scope boundary |
| Items need comparison | Use a table only when it reduces comparison or ambiguity |

## Execution Steps
1. Name the audience, reader task, desired outcome, and scope boundary.
2. Draft the outcome first, then the quick path, ordered details, and optional depth.
3. Chunk related information and signpost each section by reader need.
4. Add the review path and any checklist or template required for action.
5. Validate commands, claims, links, and reader-task usability against repository evidence.

## Output Contract
Return the document plus its audience, outcome/action, review path, scope boundary, validation, and unresolved risks.

## References
None.
