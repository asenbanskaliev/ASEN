---
name: asen-tdd
description: "Trigger: behavior change, TDD, test-first change. Enforce exact RED, GREEN, triangulation, refactor, completion, and recovery evidence."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate only when genuine ODD facts identify a behavior-changing write and testing is required. Ambiguous or contradictory behavior/testing facts block before cycle authority. Do not activate for documentation, configuration, or other non-behavior work, or from an adjacent phase without a true `behaviorChange` fact.

## Hard Rules
- Use the fixed local Node TAP-derived runner. Execute RED twice and derive failing assertion identities from bounded runner output; an arbitrary nonzero exit or caller-supplied metadata is not RED evidence.
- Preserve exact direct-child lineage and phase diffs: RED is test-only; GREEN is behavior-only; triangulation is test-only; optional refactor is behavior-only. Minimum GREEN must pass unchanged RED tests.
- For multiple planned paths, require per-case runtime V8 evidence showing materially distinct decision paths. Permit N/A only for the exact structurally single-path plan.
- Record performed or explicitly not needed refactor status before completion, with planned behavior and terminal tests preserved.
- Treat baseline-already-passes as the only non-TDD alternative. Prove the exact baseline and its direct behavior-only child with per-case V8 evidence, and never label this alternative TDD.
- Claim a genuine one-use completion for lifecycle promotion. HMAC-bound v2 recovery is verify/archive-only; legacy generic cycles remain audit-only.
- Require exact `lifecycle-completion` evidence at the verification gate. Grant no test, review, mutation, release, or delivery authority, and make no same-binding anti-rollback claim.

## Decision Gates
| Situation | Action |
| --- | --- |
| Facts are ambiguous or contradictory | Block before issuing a cycle |
| Deterministic assertion RED exists | Run the strict cycle |
| Baseline already passes every planned case | Use the verified non-TDD alternative |
| Multiple decision paths exist | Require distinct per-case V8 paths |
| Exactly one structural path exists | Record the bound structural N/A |
| Exact completion is absent or legacy | Keep verification blocked and legacy evidence audit-only |

## Execution Steps
1. Bind the genuine ODD obligation, candidate, planned cases, paths, and triangulation policy.
2. Run and record two matching assertion-derived RED observations.
3. Admit the direct-child minimum GREEN with unchanged tests and only planned behavior changes.
4. Add test-only triangulation with exact per-case V8 observations, or record structural single-path N/A.
5. Perform a behavior-only refactor or explicitly record that refactor is not needed; rerun bound cases.
6. Promote exactly once, persist the exact v2 completion, and admit only its lifecycle-completion gate.
7. On recovery, verify HMAC and exact current binding, then continue only verify/archive.

## Output Contract
Return applicability, method (`strict` or `baseline-already-passes`), candidate lineage, fixed runner result, planned cases, RED/GREEN evidence when strict, V8 triangulation or structural N/A, refactor status, exact completion/recovery state, and blocked or unresolved facts. Do not substitute any authority or report the verified alternative as TDD.

## References
None.
