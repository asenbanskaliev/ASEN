# ASEN closeout execution plan — 2026-10-16

## Candidate and evidence boundary

- Audited PR: [#32](https://github.com/asenbanskaliev/ASEN/pull/32), branch `feat/strict-parity-prerequisites`, initial HEAD `b1d61fd7de41499d17f05481f1fd81d3bd9d910e`.
- At this HEAD, PR CI, Release Gate, Phase 0 Architecture, and Pi 1.1 runtime evidence are green; Pi Free Smoke is **SKIPPED**, not a passing provider test.
- The strict claims registry contains **16 PARTIAL / 0 FULL**, ECO-01 through ECO-16. These are formal evidence claims, not an estimate of missing implementation.
- ECO-07 has a reviewed real Pi 1.1.0 NVIDIA recovery receipt scoped to Ubuntu 24.04: candidate `9d3f2e0710fd74b770e94b3aa2a2e43f3fd3e445`, workflow `38789463310`, artifact `11999926486`. That narrower PASS does not turn the current registry row FULL or demonstrate provider-backed runs on Windows/macOS.
- ECO-06 has durable primary/read-only routing, bounded worker admission, one-use phase grants, independent acceptance, and read-only interrupted-write inspection. It **does not yet have** a reviewed live Pi interrupted *writer* recovery and fresh-authority receipt.

## Ordered execution work units

### U1 — Close the ECO-06 real interrupted-writer evidence gap (critical)

1. Reuse `asen_todo_inspect_interrupted_write`, the controlled writer lifecycle, and the existing task-agent links. Do not build a parallel recovery state machine.
2. Build an isolated scratch-repository Pi 1.1.0 harness with an actual NVIDIA-backed worker whose authorized single-surface edit is observable *before* the Pi child process is terminated. Distinguish natural exit, process kill, and write/rename durability boundaries in the receipt.
3. Before interruption capture the exact candidate commit, session/project identity, Todo and agent identities, expected scope, tool trace, content hash and successful partial-edit observation. Never capture credential values.
4. Restart the Pi host with the same logical session/project. Inspect the persisted blocked Todo, interrupted agent, and actual Git diff **read-only**, including out-of-scope and candidate-drift failures.
5. Prove zero automatic redispatch/replay, no restored phase grant, and rejection of wrong session/project. With the dirty diff still present, reject an automatic fresh-plan eligibility decision.
6. Resolve the partial edit explicitly in the scratch repository. Create a **new** exact-candidate plan and request new bounded one-use write authority before a second worker. Prove that the second write executes at most once and remains blocked for independent acceptance.
7. Emit a machine-readable exact-SHA evidence bundle with PASS/FAIL, process IDs, ordered events, artifact digest and redacted provider diagnostics. Report failures and provider limits as failures/blockers, not passes.

**Acceptance:** reviewed real-provider artifact proving the whole interrupted-write/inspection/re-authorize flow, controlled scope, no duplication, and exact-SHA green mandatory checks. Unit and model-free Pi-host tests are necessary regression coverage but insufficient for this gate.

### U2 — Stabilize the candidate and protect user experience (high)

1. Run the complete pipeline from natural-language request through ODD facts, persisted plan, primary/read-only/worker selection, conditional confirmation, agent lifecycle and independent result review.
2. Keep read-only continuation friction-free. Prompt only for material clarification, scoped write admission and independent acceptance; never let an optimization bypass a security boundary.
3. Exercise cross-session/project switches, concurrent launch, cancellation, restart, partial-write inspection, shutdown draining, Windows nested directories and candidate drift with focused regression tests.
4. Perform R1 functional, R2 security, R3 integration and R4 simplification reviews. Prefer a small number of coherent commits, with local typecheck/build/focused tests before push.

**Acceptance:** deterministic tests, packed Pi installation, full CI matrix, no unreviewed authorization expansion, and a measured rather than asserted reduction in redundant prompts.

### U3 — Reconcile 16 strict ecosystem claims without false promotion (critical)

1. For each ECO-01…ECO-16 row, enumerate the current implementation proof, missing source-backed obligations, normative source identity, exact revision, native review, independent provenance, and final evidence receipt.
2. Start with ECO-01/02 and ECO-05 while reusing verified ECO-07 evidence **only within its documented scope**. The historical model-free host matrix, provider receipt, and upstream-source proof are separate evidence types.
3. Obtain the retained frozen source/baseline repository or a valid source-bound equivalent before strict normative-source admission. Do not refreeze or silently substitute a newer upstream commit.
4. Follow the existing FULL-5 R16/R18/R20 U3 gate: stable exact candidate, admissible evidence-only overlay, independent/native review, authenticated human approval where required, and registered receipts. Reject post-candidate source or test changes as an overlay.
5. Never edit the registry to `FULL` as a substitute for evidence. Keep all row labels truthful until the validator and reviewers admit the exact candidate.

**Acceptance:** each individually promoted claim passes its source, execution, provenance, independent review and exact-candidate gates; outstanding rows remain PARTIAL with named blockers.

### U4 — Release readiness and PR #32 handoff (after U1–U3)

Verify fresh install, supported Pi versions/OS matrix, packaged tool exports, user documentation, safe defaults, no exposed credentials, R4 findings, completed or explicitly deferred scope, and exact-HEAD CI. Submit the PR for independent review only when the gate report is complete. Do **not** merge without explicit user authorization.

## Publication/CI policy

- Group related code, test and document changes into locally verified batches. Run CI only when a candidate is worth evaluating; do not manually duplicate green jobs for the same SHA.
- The NVIDIA workflow is path-filtered; merely editing this plan must **not** trigger provider quota usage. A real test requires a code/harness change on its selected paths or an explicitly dispatched workflow with the exact HEAD.
- Preserve provider credentials inside the existing Actions secret mechanism; report only presence/absence, never values.
- Link each result to its commit SHA, workflow run, job and artifact. A green generic CI does not prove a real interrupted-write run.

## Independent R4 decision at planning stage

R1: Implemented features and acceptance gaps are separated. R2: no auto-resume, auto-approval or restored authority permitted. R3: reuse Pi, existing Todo/agent store and binder; do not create duplicate orchestration. R4: avoid repeat confirmations for read-only paths and unnecessary provider runs. This plan **does not** certify U1, U3 or a release; execution remains blocked on their enumerated evidence.
