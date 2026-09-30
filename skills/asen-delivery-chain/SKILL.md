---
name: asen-delivery-chain
description: "Trigger: chained or stacked PRs, review slices, reviewer-load control, or candidates that exceed or risk the complete 400-line or roughly 60-minute review budget."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate when a candidate or review slice exceeds or risks 400 complete changed lines, review time reaches or risks about 60 minutes, generated artifacts push complete scope over budget, or the user requests chained or stacked PRs, review slices, or reviewer-load control. Exclude ordinary focused under-budget branch or PR delivery and commit-only planning.

## Hard Rules
- Make one honest slicing pass. Slice by cohesive deliverable behavior and rollback boundary; keep tests and docs with their behavior. Never slice by file type or delete, compress, or restyle evidence to fit.
- Budget each slice at exactly 400 complete additions plus deletions and roughly 60 review minutes. Path-bound generated artifacts retain SHA and classification evidence and count in complete budgets and the complete snapshot; never use them to hide authored lines.
- Require an exact explicit integration branch; never infer a default. Preserve one selected strategy throughout.
- Validate the exact ordered commit partition, bases, dependencies, clean expected-versus-observed diff paths, and complete verification, docs, rollback, start, end, follow-up, and out-of-scope evidence. Reject cycles, forward dependencies, and polluted child diffs. Mark the current slice with 📍 in every dependency diagram.
- Planning grants no publication, merge, or readiness authority. Keep delivery actions pending separate exact authority.

## Decision Gates
| Situation | Action |
| --- | --- |
| Focused, under both budgets, and no chain request | Select `single` |
| Every slice is independently landable | Select `stacked-main`; target every slice to the explicit integration branch |
| Slices require dependent integration | Select `feature-chain`; use a draft/no-merge tracker, target child 1 to it, then each later child to its immediate parent |
| No honest cohesive fit exists after one pass | Select `exception-required`; recommend replan or `size:exception`, never grant authority |
| Any complete slice remains over budget or has a polluted diff | Stop and replan; do not publish or merge |

## Execution Steps
1. Measure authored additions, deletions, review time, and cohesive rollback boundaries.
2. Derive and validate one strategy against the explicit integration branch and chain request.
3. Account every generated artifact by path, SHA, classification evidence, and complete totals.
4. Produce ordered slices, exact bases, dependencies, and a 📍 diagram for each slice.
5. Verify each slice's commit partition, clean diff, tests, docs, rollback, state transition, and fact sets.
6. Stop for replan or exception recommendation on any overage, pollution, missing fact, cycle, or forward dependency.

## Output Contract
Return strategy; ordered slices; bases, dependencies, and diagrams; authored, generated, and complete budgets; verification, docs, and rollback; tracker or exception status; pending publication and merge authority; and unresolved facts.

## References
None.
