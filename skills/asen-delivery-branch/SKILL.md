---
name: asen-delivery-branch
description: "Trigger: create branch, prepare pull request, PR delivery. Prepare reviewable repository delivery while respecting current repository policy and verified remote state."
---
## Activation Contract
Use when preparing a branch or pull request after implementation evidence exists.
## Hard Rules
- Read current repository contribution/workflow policy; do not infer it.
- Delivery authority is separate from implementation/review authority.
- PR claims must match actual candidate, tests, diff and remote state.
- Never claim labels/checks/permissions not verified.
## Decision Gates
| Situation | Action |
| --- | --- |
| Required repository gate unknown | Read policy/workflows first |
| PR claim lacks evidence | Rewrite as pending/unknown |
| Candidate differs from verified candidate | Reverify before delivery |
## Execution Steps
1. Inspect repository policy and current remote state.
2. Confirm candidate, branch naming and commit/work-unit story.
3. Build truthful PR body from evidence.
4. Verify remote checks and metadata after publication.
## Output Contract
Return branch/PR state, linked evidence, tests, diff facts, pending repository actions and unresolved authority.
## References
None.
