# T12 — Real-provider end-to-end acceptance and stabilization (2026-11-02)

Status: **IN PROGRESS — no global FULL claim**. Owner scope: `asenbanskaliev/ASEN`, branch `feat/t12-integrated-acceptance-merge`; initial exact baseline `3911e09593eaa180a98437429c60dc742cf46ad1`. Every later evidence receipt must bind to its own actual SHA. This task complements, and must not overwrite, `odd/tasks/pi-capability-completion.md`. No merge into main, release, paid inference, secret publication or fabricated interactive consent.

## Objective and acceptance boundary

Demonstrate real Pi + authenticated Ollama Cloud operation through a reproducible disposable project: read-only exploration, evidence-grounded bounded planning, controlled review/verifier, restart/recovery, and—only after valid Pi interactive user authorization—one scoped writer operation. Keep provider connectivity smoke separate from functional agent acceptance; a green smoke is not FULL.

## Baseline observations (2026-11-02)

- Exact SHA `3911e095`: provider-free acceptance PASS (run 41501668895); Phase 0, Release Gate, F5 exact-SHA, Pi runtime, CodeGraph CLI and automated R4 self-audit PASS. General CI run 41501681198 was `in_progress` when inspected. Pi Free Smoke SKIPPED.
- Prior SHA `90b73848`: authenticated `pi-ollama-cloud@0.13.1` provider invocation returned expected `ASEN_PROVIDER_OK` using a discovered model (run 41500565140 provider job PASS); requested `beam:cloud` was not present in discovered model catalog. The same workflow overall FAIL was from `ENOTEMPTY` in an unrelated profile-fixture cleanup, not from the provider.
- The profile-fixture cleanup regression was addressed in `3911e095` and its focused acceptance passed. None of these receipts prove full production agent behavior, Ollama model identity, interactive writer authorization, independent R4, or strict reference parity.

## Execution units and gates

| Unit | Task / deliverable | Evidence / pass condition | State |
|---|---|---|---|
| F0-A | Reconcile remote HEAD, CI and existing capability ODD | Written exact-SHA baseline and truthful PASS/FAIL/SKIP/BLOCKED | DONE for initial baseline |
| F0-B | Isolate test homes and artifacts, prevent flaky cleanup | Focused suite verifies terminal state before removal; no unrelated tests fail | PARTIAL (prior focused PASS; full CI needs confirmation) |
| F1-A | Pin provider plugin and inspect live model catalog | Exact plugin/version, chosen provider/model identifiers in safe artifact; no secret material | PARTIAL (dynamic model selection; identity reporting needs review) |
| F1-B | Authenticated, single-call provider probe | Real `ASEN_PROVIDER_OK`, bounded wall clock/inference, authenticated secret injected only by Actions | DONE for prior candidate, must be rerun at final SHA |
| F1-C | Negative authentication, provider unavailable, unknown model and quota classification | Controlled error and zero authority escalation, no secret leaks | TODO |
| F2-A | Disposable fixture repository with known coding defects | Fixed expected defects and immutable checksums; read-only agent response grounds file/line evidence | PARTIAL (fixture + deterministic grader implemented, CI pending) |
| F2-B | Actual explorer over fixture via Pi + configured model | Correct defect identification verified programmatically; zero writes to fixture | IN PROGRESS (bounded live model reasoning job queued; does not yet use the ASEN explorer dispatcher) |
| F3-A | Persist structured bounded plan from explorer output | Real model inference drives plan; exact paths/dependencies/tests match fixture; invented files rejected | TODO |
| F3-B | Verify routing across explorer/plan and no implicit fallback | Captured selected model and deterministic validation; explicit missing-model rejection | PARTIAL |
| F4-A | Real writer with interactive one-time approval on disposable repo | Exact task/commit/path grant, one consumption, diff restricted, output verified | BLOCKED_INTERACTIVE (do not simulate grant in CI) |
| F4-B | Writer denial and replay tests | Denied/no grant produces zero writes; stale grant unusable | TODO |
| F5-A | Review and verification of produced patch | Real review plus independent deterministic behavioral tests; reviewer cannot grant delivery | TODO |
| F5-B | One bounded correction after a demonstrated FAIL | Only authorized correction paths; failure history retained | TODO |
| F6-A | Restart interrupted read-only session and recover | Durable state verified; no unauthorized replay or duplicate mutations | TODO |
| F6-B | Provider timeout, quota exhaustion, invalid credentials, concurrent change | Safe failure, deterministic classification, no false PASS, no secret leak | TODO |
| F7-A | R4 automated self-audit, security and cross-platform checks | Reports labeled SELF_AUDIT_ONLY / NOT independent; Ubuntu/Windows/macOS exact SHA | TODO |
| F7-B | Final claim/evidence reconciliation | Individual capabilities FULL/PARTIAL/BLOCKED with artifacts; ECO claims unchanged unless independently justified | TODO |

## Execution strategy — consolidated batches

**Batch A (F0/F1 + fixture/tooling for F2/F3):** inspect existing harness to reuse it; prepare disposable fixture, deterministic grading, provider catalog/output metadata and bounded read-only acceptance script; add isolated regression tests. Run focused tests, typecheck, build, and YAML validation before a single publication. No provider request during preparatory push unless explicitly opt-in and cost-bounded.

**Batch B (F2/F3/F5 read-only):** run one explicitly bounded GitHub Actions real-provider session from the same SHA, save redacted model selection, fixture hash, prompt/input, response, grade and verdict; distinguish NO_PROVIDER / AUTH / MODEL / QUOTA / TIMEOUT / ASSERTION. Avoid blind retries. If provider refuses/free quota expires, mark BLOCKED_PROVIDER rather than FULL.

**Batch C (F4/F6):** execute deterministic negative tests and restart/crash cases in disposable workspaces; execute actual Writer only in a legitimate user-authorized interactive Pi session. Persist blocked proof if consent unavailable.

**Batch D (F7):** collect exact-SHA Linux/macOS/Windows CI, architecture, F5, R4 self-audit, provider evidence, blocked-writer note and ODD log disposition. One final consolidated CI batch after fixes; do not claim independent R4.

## Operational safeguards

- GitHub Actions secrets: only `OLLAMA_API_KEY` from environment; never print, embed in prompts, upload settings or save raw authenticated headers.
- Use `npm ci`, supported Node, pinned plugin and repository lockfile. All temporary state under runner temp, fixtures disposable, fixed task count/time budget, abort on missing model.
- Never infer provider/model success from plugin installation, placeholder model or a mocked runner.
- Never turn a green Release Gate or offline acceptance into global FULL.
- Do not merge, release or edit production workspaces.
- Each executed unit must append: exact SHA; run/job link; observed test count; status; artifact reference; failure diagnosis; remaining risk.

## Running log

- 2026-11-02 initial baseline: `3911e095`, acceptance run `41501668895` PASS; general CI `41501681198` in progress. Plan created; future publications require recheck and fresh evidence.
\n- 2026-11-02 execution A: implemented `scripts/t12-real-agent-fixture.mjs` with three deliberate defects (`pricing`, `authorization`, `parsing`), SHA-256 fixture integrity checks and deterministic grading, plus `tests/t12-real-agent-fixture.test.ts` verifying three correct findings, partial failure and mutation rejection. Final code SHA before this ODD log: `e6325301efa57a7b2e00e7655c21655dc729b80a`; CI run `41503117819` and acceptance `41503112996` were queued/pending. This is fixture/tooling only: no genuine explorer call or plan-model inference yet, no F2/F3 FULL claim.\n\n- 2026-11-02 execution B: implemented `scripts/t12-real-model-smoke.mjs`, wired a second bounded real inference (after connectivity probe) into `.github/workflows/asen-real-agent-acceptance.yml`, and retained one-time opt-in plus explicit Writer block. A malformed duplicate YAML tail introduced while editing was identified and removed; run `41503567955` was queued for corrected workflow SHA `39e96d63`. Live opt-in commit `560c73bf67e1b0250fcf50985fc14ee3e4f57034`; run `41503626125` was pending at log time. **No live analysis PASS yet**, no real ASEN explorer dispatcher, no automated plan or authorized Writer. Earlier failed validation-only workflow runs are not provider failures.\n
## F3 implementation contract prepared (2026-11-02)

The next implementation unit will grade a structured plan derived from the three immutable defects without assuming that a connectivity smoke is an ASEN agent invocation.

Required plan schema: `{tasks:[{id, findingId, paths, dependsOn, change, verification, role}], scope, candidateSha}`. Accept only known finding IDs `pricing`, `authorization`, and `parsing`; require nonempty concrete verification for each; prohibit unknown paths, duplicate task IDs, cycles, unscoped writes and fabricated candidate SHA. Enforce task dependency ordering and stable serialization for the evidence artifact. Any plan model output must be checked against this deterministic contract, not accepted solely because the LLM says it is correct. A plan for work is not an authorization to write.

Execution boundary: implement the validator and its negative tests together in one code publication after the pending provider acceptance run is resolved, to avoid cancelling/restarting the long cross-platform CI unnecessarily. Run one bounded real model planning request only after F2 live fixture grading yields an attributable success on an exact SHA. Keep `F3-A` TODO until code, test and live receipts exist.

Queue checkpoint: live-model run `41503626125` remained `pending` with no jobs returned; current branch head `4e8e67748411cf8de9fddce584b9b9b30222842b`. General CI `41503698348` was queued; Pi runtime and R4 automated self-audit were PASS. Pending is not FAIL and not PASS. No provider calls or extra CI explicitly initiated by this documentation-only checkpoint.
