# Gentle → ASEN behavioral skill parity

Baseline: Gentle AI and Gentle Shell `main`, audited 2026-09-27. This matrix maps behavior, not source text. Gentle repository-specific policy is not copied.

| Behavior family | Gentle skill(s) observed | ASEN behavioral surface | Core enforcement | Status |
|---|---|---|---|---|
| Safe non-trivial change | gentle-ai harness | `asen-safe-change` | Flow, ODD, Evidence, Review, Verify | PARTIAL |
| Test-first change | gentle-ai harness, work-unit-commits | `asen-tdd` | TddCycle + Evidence | PARTIAL |
| Adaptive routing / ODD | gentle-ai harness | `asen-odd` | ODD router | PARTIAL |
| Independent review | rdd-defect-workflow | `asen-review` | ReviewReport + candidate binding | PARTIAL |
| Adversarial dual review | judgment-day | — | no equivalent bounded dual-judge workflow proven | MISSING |
| Work-unit boundaries | work-unit-commits | `asen-work-unit` | candidate/evidence boundaries | PARTIAL |
| PR review-size routing | chained-pr, branch-pr | — | no ASEN-native 400-line/chain policy | MISSING |
| Systemic root-cause triage | systemic-issue-triage, issue-root-resolution | — | no dedicated behavioral contract | MISSING |
| Issue creation/governance | issue-creation, branch-pr | — | repository policy only | MISSING |
| Skill creation | skill-creator | — | Pi native skill format is platform authority | MISSING |
| Skill improvement | skill-improver | — | no ASEN behavioral workflow | MISSING |
| Skill registry/discovery | skill-registry | — | Pi owns loading; ASEN lacks behavior registry audit | PARTIAL |
| Cognitive documentation | cognitive-doc-design | — | no dedicated behavioral skill | MISSING |
| Comment writing | comment-writer | — | no dedicated behavioral skill | MISSING |
| Delegation | hermes-ephemeral-delegation, gentle-ai harness | `asen-odd` | Dispatcher/Orchestrator | PARTIAL |
| Benchmark/collaboration | gentle-ai-bench, collab-perfect | — | no direct behavioral equivalent required yet | REVIEW |

## Interpretation

- PARITY requires both an agent-facing Pi-native behavior contract and executable ASEN evidence/gates where the behavior is a system guarantee.
- PARTIAL means code or a broad skill exists, but the complete behavior is not yet represented and proven end-to-end.
- MISSING means no ASEN-native behavioral skill currently represents the observed behavior.
- REVIEW means equivalence must be justified before importing the concept; feature-count parity is not the goal.

## Rule

Functional parity records PAR-001..PAR-500 do not by themselves establish behavioral parity. Behavioral parity must be audited independently against this matrix.
