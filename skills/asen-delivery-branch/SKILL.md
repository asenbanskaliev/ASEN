---
name: asen-delivery-branch
description: "Trigger: create or prepare branches, commits, pushes, pull requests, labels, or delivery status. Enforce evidence-bound staged delivery."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate for branch creation or preparation, commit preparation, push, pull-request creation or update preparation, PR labels, and delivery status. Exclude ordinary issue drafting, chained or stacked planning, generic documentation, and merge-only requests unless exact delivery state exists.

## Hard Rules
- Require exact `[HOST/]OWNER/REPO`, explicit base branch, current target policy, a genuine open approved issue, supported branch and Conventional Commit names, the repository PR template or explicit waiver, required-check policy, exactly one permitted `type:*` label, and candidate-bound test and diff facts.
- Never infer a default branch or repository, probe ambient credentials, invent issue approval, labels, checks, permissions, or template facts, blanket-check declarations, force-update, blindly retry, or claim merge.
- Require separate one-use `remote_read` authority for policy inspection and each fresh pre-label read. Require separate one-use mutation authority for local branch creation, every commit, push, PR open or update, label mutation, and merge.
- Confirm each stage by exact readback as `confirmed`, `no_write`, or `unknown`; `unknown` blocks every later stage.
- Open a PR with exactly empty initial labels. Mutate labels only for a genuine confirmed PR after the authorized fresh exact pre-read, using its conditional baseline token in one combined mutation and readback. Preserve unrelated labels. A protected `size:exception` requires MAINTAIN or ADMIN and specific rationale.
- Treat required checks as exact-case policy identities with observed states. Workflow names do not prove required checks. Successful checks leave merge pending separate current authority.

## Decision Gates
| Situation | Action |
| --- | --- |
| Policy, evidence, read authority, or action authority is missing | Return draft/stop with the smallest missing fact |
| Preparation lacks mutation authority | Return prepare-only material |
| Local branch or next commit is authorized | Attempt once; continue only after exact confirmed readback |
| Push is authorized | Attempt once; confirm the exact remote head |
| PR open or update is authorized | Attempt once; confirm target, content, head, and empty labels |
| Label mutation is authorized | Apply one conditional combined mutation and readback |
| Checks succeed | Report merge pending; require separate current merge authority |

## Execution Steps
1. Use fresh `remote_read` authority to inspect exact policy and issue state.
2. Validate every candidate fact.
3. Prepare and stop unless the next stage has fresh one-use authority.
4. Execute once; read back exactly and classify.
5. Stop on `no_write` or `unknown`; otherwise reauthorize each later stage.
6. Before labels, obtain fresh `remote_read` and mutation authorities; report checks without merging.

## Output Contract
Return target; policy/base; approved issue; branch/commits; PR/template/type label; local tests versus remote required-check observations; every action's `confirmed`, `no_write`, or `unknown` state; pending actions/authority; unresolved facts. Never convert preparation, successful checks, or prior authority into merge authority.

## References
None.
