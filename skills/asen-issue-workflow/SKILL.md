---
name: asen-issue-workflow
description: "Trigger: create issue, report bug, proposal issue. Create evidence-based repository issues without inventing authority, labels or remote state."
---
## Activation Contract
Use when preparing or publishing an issue to a repository.
## Hard Rules
- Search/read relevant current issues and repository templates before publication when available.
- Separate observed facts, reproduction and hypotheses.
- Never invent labels, assignees, approval or maintainer authority.
- Remote mutation requires exact authorized target/action.
## Decision Gates
| Situation | Action |
| --- | --- |
| Duplicate/canonical issue exists | Link/narrow instead of duplicating |
| Reproduction is uncertain | State uncertainty explicitly |
| Required remote authority is absent | Produce draft only |
## Execution Steps
1. Inspect issue policy/templates and related issues.
2. Capture problem, reproduction/evidence, expected behavior and scope.
3. Remove sensitive/unverified claims.
4. Publish only with authorized target/action, then read back.
## Output Contract
Return issue draft/state, evidence, related issues, remote mutation result and unresolved authority.
## References
None.
