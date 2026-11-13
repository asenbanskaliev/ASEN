---
name: asen-work-unit
description: "Trigger: implementation, refactor, or bug-fix work; commit-split planning; review boundaries; task-to-commit traceability; or evidence and rollback alignment."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for implementation, refactor, or bug-fix work; commit splits or review boundaries; task-to-commit traceability; evidence/rollback alignment. Do not activate for prose-only collaboration or issue-only triage. Delivery Chain owns chain strategy decisions; Work Unit activates within each chain slice for cohesive commit/evidence/review boundaries.

## Hard Rules
- Selecting this skill does not itself require a feature document, todo, branch operation, commit, PR, or delivery. Small work (understood, contained risk, resumable from request and diff) stays inline without artifacts unless requested.
- Define one observable behavior and one independent rollback boundary per unit. Keep implementation, focused tests, runtime evidence, documentation, and task record together when applicable. Split mixed behaviors; never split by file type or code-golf.

Apply the requirements below only when tracking or delivery is applicable and authorized. Without repository authority, do not create branches or commits. Report required delivery evidence as pending, never fabricate completion.

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
| Small inline work | Keep checks; no added workflow |
| Applicable tracking/delivery | Apply branch, accounting and freeze rules |
| Drift, failure, incomplete paths/applicability or missing authority | Stop; never reuse claims |

## Execution Steps
1. Implement scoped behavior with applicable tests/docs. Record exact commands, outcomes and any authorized `n_a` reasons.
2. Apply authorized tracking/delivery rules.
3. Stop on drift, failed verification, malformed evidence, reused provenance, or missing authority; never retry a burned claim.

## Output Contract
Return purpose, scope, behavior, checks, rollback and unresolved facts. For applicable tracking/delivery include authored/generated accounting, task/commit/tree identities, candidate identity, delivery relationship, and unresolved facts. Return no authority, verdict, readiness, publication, or merge claim.

## References
None.
