# A4R experimental roadmap

## Purpose and status

Evaluate whether **A4R (Audit → Reduce → Break → Repair → Revalidate)** improves ASEN engineering outcomes at reasonable cost. This is an experimental method, not an ASEN product feature.

- **Gent&#108;e** = behavioral reference.
- **A4R** = an independently developed experimental method for evaluating and improving ASEN.
- This document does not claim that Gent&#108;e uses A4R.
- Baseline branch: `feat/strict-parity-prerequisites`
- Validated baseline HEAD: `f03bcfa529340b7a13ba9131cc7e3e2e09d28f0c`
- Isolated experiment branch: `experiment/a4r-validation`
- Tracking draft PR: #35, targeting the baseline branch; do not merge.
- Execution environment: GitHub Actions clean checkouts; no local test execution is attributed to this experiment.
- No new workflow was added. Existing CI, Phase 0 Architecture, Release Gate, and Pi smoke workflows were reused.
- External model/provider budget: 0. No model provider calls were made.

## Hypothesis

For high-risk changes to recovery, authority, persistence, or isolation, an explicit audit and adversarial reproduction before implementation can expose defects missed by existing checks; a minimum repair followed by exact-SHA revalidation can improve confidence without duplicating ASEN mechanisms.

The hypothesis is not that every task needs all five phases or that more tests/commits imply better outcomes.

## Phases and gates

1. **Audit** — identify actual contracts, authority, source of truth, implementation, tests, persistence, recovery, and existing safeguards. Gate: describe the guarantee and evidence before proposing a change.
2. **Reduce** — reuse, compose, simplify, or choose NO_CHANGE where evidence supports it. Gate: no new parallel mechanism without a demonstrated need.
3. **Break** — run deterministic adversarial probes tied to a real guarantee. Gate: state the violated invariant and reproduce the failure.
4. **Repair** — change only the reproduced defect, minimally. Gate: confirm no existing mechanism already handles it.
5. **Revalidate** — rerun the defect test and related suites/workflows on the exact new SHA. Gate: report outcomes by SHA and preserve skipped as skipped.

A valid outcome can be NO_CHANGE. Unknown measurements remain UNKNOWN.

## Selected cases

Cases were selected from existing ASEN tests and contracts, not from a synthetic benchmark. The complete inventory, evidence, and mapping to existing mechanisms are in [the experiment audit](../../docs/audit/a4r-experiment.md).

| Area | Existing evidence selected |
|---|---|
| Deterministic defect | `tests/rdd-reproduction.test.ts` |
| Authority and permissions | `tests/writer-admission-4r.test.ts`, `tests/dispatcher.test.ts` |
| Agent lifecycle and runner failure | `tests/agent-lifecycle.test.ts` |
| Session recovery/restart | `tests/session-recovery.test.ts`, `tests/pi-session-recovery-e2e.test.ts` |
| Profiles/routing | `tests/runtime-profiles.test.ts`, `tests/profile-store.test.ts` |
| Concurrency | `tests/exclusive-file-lock.test.ts`, existing simultaneous Memory migration test |
| Corruption/invalid state | `tests/history-store.test.ts`, new checkpoint corruption probe |
| NO_CHANGE | No parallel Memory/store/coordinator/orchestrator was justified |
| Duplication temptation | Existing checkpoint, session recovery, and lifecycle mechanisms were composed |
| Real Pi/model frontier | No model-dependent property was needed; Pi package/runtime smoke was used where existing Release Gate required it. Model behavior remains out of scope. |

## Metrics

Record when GitHub provides evidence:

- defects detected/reproduced, false positives, regressions;
- changes and tests added/removed, files changed, useful tests;
- duplicated mechanisms considered and avoided;
- iterations and Actions executions/jobs;
- duration only where an authoritative Actions measurement is available;
- provider calls and actual model providers;
- recovery/authority/isolation outcomes;
- failures found before versus only at CI.

Unmeasurable values are UNKNOWN. A repeatable test failure and an unrelated one-off CI failure are reported separately.

## Gates and progress

| Gate | Status | Evidence |
|---|---|---|
| Reconcile source branch and isolate work | Complete | Source branch remained exactly at baseline SHA; experiment is an isolated descendant |
| Baseline A inventory | Complete | Existing tests plus historical Actions attached to baseline SHA |
| Audit and reduce | Complete | No parallel architecture justified; one checkpoint validation gap found |
| Adversarial reproduction | Complete | Invalid persisted task phase failed closed assertion on SHA `96314441ae67f9331f62f18b5a04c01c2beaf727` |
| Minimal repair | Complete | Checkpoint task phase validation added; typed exhaustive allowlist on SHA `764c0f6282522b723274fb5cb11cba9eb1b7bb93` |
| Revalidation and exact-SHA workflows | Complete for the code candidate; documentation commit checks are reported in the execution handoff | The one-time Memory concurrency failure and macOS watcher failure each passed a same-SHA retry; see exact job IDs in the audit |
| A/B comparison and self-audit | Complete with limitations | Only one new defect was tested; no randomized matched task cohort |
| Documentation boundary regression | Repaired | First documentation commit failed the upstream boundary audit; the required reference is now rendered from a character entity without changing the audit or allowlist |
| Decision | **REVISE** | See conclusion in the audit |

## Decision after first phase

**REVISE.** The experiment found and minimally repaired one real fail-open checkpoint recovery defect. The evidence supports further evaluation for high-risk state-recovery work, but the sample is too small and A/B comparison too unmatched to adopt A4R generally or establish a repeatable quality/cost improvement. The methodology also needs a clearer proportionality rule to avoid redundant CI runs for a narrowly scoped change. Do not productize A4R in ASEN based on this experiment.


## Second phase — A/B observation and proportionality

- Reconciled start: experiment HEAD `8a3435bd6a5ce191fd861695413c24b62549adfd`; source branch HEAD `f03bcfa529340b7a13ba9131cc7e3e2e09d28f0c`.
- During this phase PR #32 advanced by one descendant commit, `a4a9862d4d52c4130e0622110d91b6c7c49ac647`, containing only the checkpoint guard and its regression test. It passed exact-SHA CI and Release Gate. No experimental documentation or extra architecture was transferred.
- Eight areas were assessed: deterministic checkpoint bug; authority/isolation; recovery/persistence; concurrency; profiles/routing; reduction/duplication; deliberate NO_CHANGE; Pi package frontier. Case-level results and unknowns are in the audit.
- Comparison is observational, not a randomized or operator-matched trial. A is historical baseline evidence at `f03bcfa`; B adds one adversarial checkpoint probe and repair. Per-case effort, independent task outcomes, and time are UNKNOWN where Actions only reports aggregate suites.
- One product defect was found in phase one; the second phase added no new product defects. The existing authority, recovery, profile, concurrency and routing test groups remained in successful aggregate suite runs. Two unrelated one-off failures from first-phase Actions remained unreproduced on same-SHA retries.
- Phase-two cost: five existing workflow executions at `a4a9862...` (CI, Release Gate, Phase 0, Pi 1.0 runtime, Pi Free); all required workflows succeeded, Pi Free was SKIPPED. No external model/provider calls. The final docs-only commit skips CI.
- Proportionality proposal: brief audit and reuse check for nontrivial changes; adversarial probes only for material invariants; full platform/release validation for recovery, authority, persistence, concurrency or release changes; focused tests first for narrow code fixes; no broad reruns for docs-only edits or without new evidence.

## Second-phase decision (historical)

**REVISE.** A4R found a real recovery defect and its minimal repair passed cross-platform validation. The eight-area comparison is not matched and the evidence does not demonstrate repeatable quality/cost superiority, including risk-scoped superiority. Keep A4R experimental; do not integrate it into ASEN or promote R01–R20.


## Final controlled evaluation — closed without A/B execution

### Reconciliation

- Initial experiment HEAD: `5f510c6b08e40a3f057ee0ae1a196581ac0dffb8`.
- Initial development HEAD: `a4a9862d4d52c4130e0622110d91b6c7c49ac647`.
- Initial `main`: `49129b616c5349fbf323b74860136fc1593f9b2a`.
- GitHub refs still match those SHAs. No later commits were found on either working branch.
- The development branch remains a 250-commit descendant of main; the experiment branch is kept separate. PR #32 was not changed.

### Preregistered task set and criteria

These four candidate tasks deliberately avoid the already-known invalid-phase defect in `restoreCheckpoint()`. The exact contracts and criteria are preregistered in the audit. They were **not executed**.

1. Recovery: corrupt/truncated persisted checkpoint read after process restart must fail closed; valid recovery remains compatible; no verified result or authority is recreated from malformed data.
2. Authority/isolation: forged, reused, or mismatched candidate/revision/project-bound writer admission must invoke no runner/write; a valid admission is usable only once by its bound request.
3. Concurrency/lifecycle: simultaneous durable profile mutations must preserve every successful update; an interrupted/throwing mutation must leave the prior durable value readable.
4. Profiles/routing/validation: malformed profile data and dangling active names are rejected; valid session → project → global → default precedence is deterministic.

Difficulty equivalence is UNKNOWN; these cases were not piloted.

### Comparison protocol fixed before execution

- A: ordinary ASEN workflow—inspect the contract and relevant implementation/tests, make the smallest justified change, run affected tests and the existing relevant validation.
- B: proportionate A4R—Audit → Reduce → Break → Repair → Revalidate, with NO_CHANGE permitted.
- Planned common start: exact development SHA `a4a9862d4d52c4130e0622110d91b6c7c49ac647`; four task-specific A branches and four B branches would be created from that same commit.
- Planned controls: identical issue statements, acceptance criteria, fixtures, runtime and Actions workflows; no providers; separate branch histories; no cherry-picking or sharing findings until both arms were frozen.
- Stop gate: require isolated execution contexts/operators so neither arm can observe the other arm's reasoning, patch, or test output.

### Stop result

The available execution context is a single shared reasoning session with GitHub access. It cannot keep A's findings/results hidden while B is performed, or vice versa. Separate Git branches alone would isolate files but not the operator's information. Creating branches and proceeding anyway would repeat the prior observational design and would not resolve the identified limitation. Therefore no A/B branches were created, no task code was changed, and no Actions workflow was launched.

- This is a control-design blockage, not evidence that A4R works or fails.
- No test, defect, regression, or task-level result is attributed to this final evaluation.
- This is the last A4R experiment in this series; no third observational comparison is proposed.
- No product integration proposal is justified without adoption evidence. A4R remains an external experimental method, not an ASEN runtime feature.

## Final series decision

**INSUFFICIENT_EVIDENCE.** The experiments demonstrate one real recovery defect, but cannot determine whether A4R is superior to the usual ASEN process. The final controlled comparison stopped before execution because independent A/B operation could not be guaranteed.
