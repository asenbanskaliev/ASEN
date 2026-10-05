---
name: asen-issue-workflow
description: "Trigger: create, draft, triage, comment on, approve, report bugs, or request features in issues. Prepare evidence-bound issue actions."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for creating, drafting, triaging, commenting on, or approving issues, including bug reports and feature requests. Do not activate for ordinary pull-request or branch delivery, generic documentation, or collaboration messages unrelated to an issue.

## Hard Rules
- Require the exact `[HOST/]OWNER/REPO`, repository policy, and authoritative YAML Issue Form before preparing a mutation. Preserve every required control and its declared order.
- Search current open and closed issues with complete evidence. Review exact answers, declarations, and first-person affirmations; never invent facts, answers, affirmations, labels, permissions, or authority.
- Privacy-scan the exact title, body, and labels after reviewed redactions. Permit only labels declared by the form, existing in the exact repository inventory, and allowed by policy.
- Require MAINTAIN or ADMIN plus direct exact-action authority for protected labels; TRIAGE is insufficient. Adding `size:exception` also requires a specific rationale.
- Stop at the smallest missing fact. Do not probe credentials, infer a target, select an ambiguous form, blanket-check declarations, or use a permissive fallback.
- Make one create or comment attempt and one exact readback, with no retry. Classify the result as `confirmed`, `no_write`, or `unknown`; `unknown` blocks every later mutation.
- For post-publication labels, require genuine `confirmed` publication, an exact current pre-read, and an immutable baseline conditional token. Apply one combined add/remove mutation and one readback while preserving unrelated labels.

## Decision Gates
| Situation | Action |
| --- | --- |
| Target, policy, form, answers, duplicate evidence, privacy review, label inventory, or authority is missing | Return draft-only with the smallest missing fact |
| A conforming duplicate covers the candidate | Stop and return the canonical duplicate evidence |
| A related issue does not conform to the candidate | Repair or narrow the candidate, then repeat preparation evidence without publishing |
| Complete evidence shows no duplicate | Prepare a new issue using the selected form |
| Publication is not genuinely confirmed | Return `no_write` or `unknown`; perform no later mutation |
| Confirmed publication needs a later comment or label action | Require fresh exact-action authority and all post-publication preconditions |

## Execution Steps
1. Resolve the exact target, policy, authoritative form, permitted actions, and label rules.
2. Gather complete open-and-closed duplicate evidence and record the duplicate decision.
3. Validate exact answers in form order, materialize the candidate, apply only reviewed redactions, and privacy-scan the final material.
4. Validate declared labels against the current inventory, permission, protected-label rules, and size-exception rationale.
5. If authorized, execute one publication or comment attempt and one readback; never retry an uncertain write.
6. For a later label change, pre-read exact state, bind the immutable baseline, mutate once atomically, and read back once.

## Output Contract
Return the exact target, selected form, duplicate decision and evidence, reviewed material, publication or mutation attempt and readback, final `confirmed`, `no_write`, or `unknown` outcome, and unresolved authority or missing facts.

## References
None.
