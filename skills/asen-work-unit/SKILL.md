---
name: asen-work-unit
description: "Trigger: implementation, refactor, or bug-fix work; commit-split planning; review boundaries; task-to-commit traceability; or evidence and rollback alignment."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for implementation, refactor, or bug-fix work; planning commit splits or review boundaries; task-to-commit traceability; and evidence/rollback alignment. Do not activate for prose-only collaboration or issue-only triage. Delivery Chain owns chain strategy decisions; Work Unit activates within each chain slice to enforce cohesive commit/evidence/review boundaries.

## Hard Rules
- Define one observable behavior and one independent rollback boundary per unit. Keep implementation, focused tests, runtime evidence, documentation, and task record together. Split mixed behaviors; never split by file type or code-golf.
- Require an explicit feature branch and stop on the explicit default branch. Keep exact authored additions plus deletions at or below 400; otherwise hand the candidate to Delivery Chain.
- Include the task document in exact expected changed paths. Partition every changed path exactly once across behavior, focused-test, documentation, task, and generated paths. Bind generated artifacts to path-bound lowercase SHA evidence; never let generated output hide or reduce authored lines.
- Mark focused tests, runtime harness evidence, and documentation as `required`, or record an exact boundary-approved `n_a` reason. Bind the previous reviewed boundary and delivery relationship exactly.
- After all source mutation, create one Conventional Commit snapshot with one consistent lowercase Git object width. Require current tree to equal frozen commit tree and record the exact commit identity in the task document.
- Treat first evidence-recording and candidate-binding attempts as one-shot; burn provenance after malformed or failed attempts.
- Bind native review only to the exact commit or repository-bound PR slice, never a task checkbox, TODO, branch, or accumulated feature branch. Preserve exact repository, task, boundary, revision, tree, previous-boundary, and dependency facts.
- Treat planning and recording as evidence only; grant no review verdict, readiness, publication, merge, or repository authority.

## Decision Gates
| Situation | Action |
| --- | --- |
| On the explicit default branch | Stop for a feature branch |
| Behavior or rollback is independent | Split |
| Authored total exceeds 400 | Hand to Delivery Chain |
| Paths or applicability are incomplete | Stop and repair |
| Source mutation remains | Implement and verify before freezing |
| Commit, tree, task, or candidate drifts | Stop without reusing provenance or claiming completion |

## Execution Steps
1. Record purpose, behavior, rollback, paths, applicability, lineage, and delivery.
2. Implement with tests, runtime evidence, docs, task, and generated accounting.
3. Verify; record exact commands, outcomes, or authorized `n_a` reasons.
4. Freeze mutation, create the Conventional Commit snapshot, verify lowercase width and tree equality, then record task/commit identity.
5. Bind one exact commit or repository-bound PR-slice candidate with repository/lineage facts.
6. Stop on drift, failed verification, malformed evidence, reused provenance, or missing authority; never retry a burned claim.

## Output Contract
Return purpose, scope, behavior, authored additions and deletions, generated accounting, focused/runtime/docs evidence, rollback, task/commit/tree identities, candidate identity, delivery relationship, and unresolved facts. Return no authority, verdict, readiness, publication, or merge claim.

## References
None.
