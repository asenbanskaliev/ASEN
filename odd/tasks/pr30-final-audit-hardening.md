# PR 30 final audit hardening

## Objective

Bring PR #30 to an auditable final state by correcting only reproducible defects, preserving exact-candidate evidence, and documenting limitations without overstating guarantees.

## Problem and rationale

The current PR head has substantial behavioral evidence, but a read-only audit found concrete process-safety gaps and contract mismatches. Work must remain tied to the exact PR candidate. The two-line `.gitignore` entry for `.atl/` is confirmed local-runtime hygiene: multiple fresh exact-commit worktrees independently reproduced it when the Pi runtime/subagent workspace was activated. Tracking that entry prevents local Pi state from dirtying exact-candidate verification worktrees. GitHub documents that renaming an open pull request's head branch closes the pull request, so the historical branch name must remain an explicitly recorded external limitation rather than being changed destructively.

## Scope

- Harden evidence-command timeout cleanup so descendants cannot outlive the evidence run.
- Remove the Pi policy-directory leak on rejected provider extensions.
- Audit, reproduce, and only then correct any remaining TDD triangulation, authenticated-audit retry, or documentation overclaim.
- Keep independent-review claims bounded to demonstrated identity/process/trust properties.
- Keep `CAP-SKL-001` at `specified` unless exact-candidate evidence supports a later change.
- Preserve all 27 Pi-native ASEN Skills and avoid parallel skill systems.

## Constraints

- Work only from a clean isolated worktree at PR #30's exact remote head.
- Never commit on `main`, force-push, merge PR #30, or overwrite remote advancement.
- Use strict RED → GREEN → REFACTOR evidence for each reproduced defect.
- Before every commit and push, verify branch/head/status and compare the remote PR head.
- Run repository-defined tests, typecheck, registry audits, boundary audit, and package gate before publishing.
- Verify GitHub Actions only for the exact published SHA.
- Preserve the reproduced `.gitignore` runtime-hygiene entry exactly as `# Local Pi runtime state` followed by `.atl/`; do not extend it with unrelated ignores.

## Delivery strategy

`ask-on-risk`; expected authored change is below 400 lines for each process-safety work unit. Route broad mapping and multi-file implementation through delegated agents. The current isolated worktree is detached at the PR head; commits will be pushed only after verifying that the remote PR branch still points to the expected parent SHA.

## Tasks

- [x] **PR30-01 — Terminate covered evidence process trees**
  - Reproduced a timed-out detached Windows descendant holding the isolated checkout open.
  - RED: `npx tsx --test tests/execution-revision.test.ts` failed `execution timeout terminates spawned descendants` because premature cleanup raised `EBUSY` instead of the timeout result.
  - GREEN: the same command passed all 7 tests after Windows `taskkill /T /F` completion was awaited; on POSIX the process group is signaled and direct-child close is awaited before cleanup.
  - REFACTOR: retained the minimal helper split; `npx tsx --test --test-name-pattern="execution timeout terminates spawned descendants" tests/execution-revision.test.ts` passed 1/1.
  - Bounded guarantee: POSIX group disappearance is not independently proven. Resistant descendants or descendants that create a new session/process group require stronger OS isolation; this implementation does not claim complete OS isolation.
  - `npm run typecheck` passed.
- [x] **PR30-02 — Clean policy directories on every exit**
  - Reproduced the rejected-provider temporary-directory leak.
  - RED: `npx tsx --test tests/pi-process-runner.test.ts` failed `Pi rejects an untrusted provider extension without leaking a policy directory`, observing one new `asen-policy-*` directory.
  - GREEN: validating the provider extension before policy-directory creation closed that leak without broadening the allowlist.
  - Settlement RED: the required suite repeatedly failed the Windows descendant-cancellation test; the strengthened test then failed because cancellation returned while the policy directory still existed.
  - Settlement GREEN: the required suite passed after stop results were held through Windows `taskkill /T /F` completion or POSIX group signaling plus direct-child close, followed by policy cleanup.
  - Error-precedence RED: an already-aborted request with a missing executable returned `pi process error` instead of the requested cancellation result.
  - Error-precedence GREEN: child `error` events now defer to an existing stop result, preventing premature cleanup or result replacement.
  - Structural settlement correction: no honest public-event reproduction was available for an `error` from a child with an established PID before `close`. The shared settlement promise now accepts `error` only for spawn failure without a PID; an established child must emit `close` before cleanup.
  - REFACTOR: one stop-result path preserves cancellation, timeout, overflow, stdin, and preflight failure identities while preventing `close` or `error` from substituting a generic result.
  - `npm run typecheck` passed.
- [x] **PR30-03 — Reconcile contract claims with enforcement**
  - Audit TDD triangulation, SDD/ODD gates, independent-review levels, and authenticated retry behavior.
  - Correct only reproduced defects; otherwise record explicit limitations.
  - Confirmed `CAP-SKL-001` remains `specified` and all 27 Pi-native Skills remain present.
  - Claim-mismatch defect evidence: the audit described a distinct reviewer identity although evidence demonstrates only a distinct reviewer/task label in a separate subprocess and worktree; it also grouped SDD selection, runtime TDD, and ODD routing more strongly than their enforcement evidence supports.
  - Documentation-only correction: no runtime RED applies. The reconciled claims now preserve the Skill contracts while recording that authenticated principal, model independence, trust-root independence, OS isolation, same-user resistance, conditional multi-path TRIANGULATE enforcement, optional SDD applicability selection, and non-bypassable automatic ODD routing remain unproven.
  - Registry correction: `CAP-TST-001` remains exactly `specified` and now includes conditional triangulation for logic with materially different paths; `skills/asen-tdd/SKILL.md` was not changed.
  - Verification passed: Phase 10 parity reported 500 canonical IDs and clean reverse audit; behavior Skill audit reported 27 PASS; tracked upstream-boundary audit passed at 232 paths.
  - Initial lifecycle retry normalization RED: `npx tsx --test tests/pi-artifact-runner.test.ts` failed 1/7 because retryable provider status 429 was reduced to `Pi artifact requires a completed successful assistant message`.
  - Provenance correction RED: the same command failed 1/7 because `OpenRouter HTTP 401: model mentioned 429` forged `PI_ARTIFACT_RETRYABLE_STATUS=429` under the unbounded number search.
  - Provenance correction GREEN: the focused suite passed 7/7 after status parsing was anchored to either `<allowlisted-status>:` at the start or a bounded `[provider ]HTTP <allowlisted-status>:` prefix. All 429/502/503/504 cases pass in both tested forms.
  - TRIANGULATE/REFACTOR: HTTP 401 mentioning 429, arbitrary text containing 503, and content containing a forged internal marker remain generic and non-retryable; emitted internal markers contain only the allowlisted status.
  - The authenticated lifecycle script converts only the final wrapped internal marker into a standalone `ASEN_LIFECYCLE_RETRYABLE_STATUS=<allowlisted-status>` line and throws a generic failure without provider detail. The workflow anchors that controlled line while preserving the existing skill-probe pattern, retry count of three, and non-retry behavior for unrelated failures.
  - Correction verification passed: focused artifact runner 7/7, TypeScript typecheck, and tracked upstream-boundary audit at 232 paths.
- [x] **PR30-04 — Full local verification**
  - Windows authority-test harness RED: at exact base `eb9a778` and the current candidate, `npx tsx --test tests/pi-authority.test.ts` failed with `EPERM` while creating the directory symlink on a non-elevated host. GREEN: the test now creates a Windows directory junction and a directory symlink elsewhere; the focused command passed 2/2 while retaining the `src/escape/x` authority rejection assertion.
  - Windows recovery-test harness RED: under full-suite contention the child `spawnSync` reached the 25-second outer timeout with `status === null`; the same focused test had passed in about 22.8 seconds. A first 45-second margin still timed out in `npm test`, with the new diagnostics reporting `error=...ETIMEDOUT`, `signal=SIGTERM`, `status=null`, and empty stdout/stderr. GREEN/TRIANGULATE: only the outer harness timeout is now 90 seconds; inner behavioral timeouts are unchanged. Subsequent full suites passed 201/201 with this test taking up to 77.8 seconds under contention.
  - Final clean-install verification passed in order: `npm ci` (150 packages, 0 vulnerabilities), `npm run typecheck`, `npm test` (201/201), `npm run audit:parity` (500 IDs, 350 actionable P0 contracts, 6/6, reverse audit clean), `npm run audit:skills` (27/27), `npm run audit:upstream-boundary` (232 tracked paths), `npm run check` (all chained gates), and `npm run verify:pack` (61 packaged files).
  - Adversarial structural readback confirmed exact-revision and dirty/concurrent mutation rejection, exit-code-based PASS/expected-failure semantics, bounded process termination without an OS-isolation claim, safe retry-marker output, limited reviewer independence, `CAP-SKL-001: specified`, 27 native Skills, and full tracked-path/text boundary coverage with explicit binary-content limits.
- [ ] **PR30-05 — Review, publish, and verify exact SHA**
  - Create reviewable work-unit commits only after branch/head/status checks.
  - Run native review/risk assessment as configured.
  - Re-fetch and reconcile any remote advancement without force.
  - Push only to the PR branch.
  - Verify Phase 0 Architecture, CI, Release Gate, Pi Free Smoke, and ASEN Authenticated Pi Audit for the exact pushed SHA.
  - Remote RED at exact SHA `b8ec552a63af5265397fb71eb7070626f66507ce`: Ubuntu CI job `109410973806` failed `Pi cancellation settles its process tree and policy cleanup before returning` because `process.kill(pid, 0)` succeeded for descendant PID 4201 after SIGKILL. On POSIX this probe also succeeds for a terminated zombie awaiting reaping by the container init process, so it did not prove that the descendant was genuinely running. The same failure made the Pi Free lifecycle isolated full tests exit non-zero; Windows and local tests passed.
  - Bounded correction: retain the Windows probe and, on POSIX only, use a one-second `ps -o stat=` observation. A `Z` state or the standard empty exit-1 absent-process result is treated as terminated; live states still fail, while empty successful output, stderr-bearing exit 1, timeouts, spawn failures, and other observation errors remain failures. This changes only test observation, not production termination behavior.
  - Exact-SHA confirmation at `bdff17239a9e735b20b4932dbf7800958fc64037`: CI run `36572500046` and Pi Free Smoke run `36572500113` passed on Ubuntu. Phase 0 Architecture run `36572500452` and Release Gate run `36572500099` also passed. ASEN Authenticated Pi Audit run `36572500151` recognized and retried three external OpenRouter 429 responses, then failed after exhausting its bounded retries.

## Acceptance criteria

- Timed-out evidence commands await Windows `taskkill /T /F`; on POSIX they signal the ordinary process group and await direct-child close before isolated-checkout cleanup, without claiming proof that the whole group disappeared.
- Pi policy temporary directories are removed on all validated early-return and process-settlement paths.
- No test or caller-supplied flag can turn a non-zero execution into passing evidence.
- Documentation and registry claims distinguish different process identity, subprocess isolation, model independence, trust-root independence, and OS isolation.
- The tracked textual boundary remains full-tree and is not weakened.
- All repository-defined local gates pass from the clean isolated candidate.
- Exact-SHA GitHub workflow results are recorded without mixing candidates.

## Progress and evidence

- 2026-09-29: Verified local, remote, and PR head at `eb9a77897e06f8ccda150baadbf7d131fcb8fe4b`; `origin/main` at `0b9c4e299fea3c361967b3ca42809c9f25412a3e`.
- 2026-09-29: Created detached worktree `../ASEN-pr30-audit` at the exact PR head. The original checkout and multiple fresh exact-commit worktrees independently gained the same two-line `.gitignore` addition when the Pi runtime/subagent workspace was activated, establishing local-runtime provenance rather than an unknown user edit. Tracking `.atl/` prevents Pi state from dirtying exact-candidate verification worktrees.
- 2026-09-29: Current exact-head ASEN Authenticated Pi Audit failure is an external provider-exhaustion result: the existing skill-probe HTTP 429 pattern was recognized and retried all three permitted times, then exhausted. It is not evidence of the lifecycle retry-normalization defect corrected here. Other named workflows passed for the same SHA.
- 2026-09-29: GitHub documentation confirms renaming the head branch of an open PR closes that PR; no branch rename will be attempted.
- Route: delegated mapping completed; PR30-01 and PR30-02 require a single bounded multi-file writer with strict TDD.
- Delegated implementation: PR30-01 awaits Windows taskkill completion; on POSIX it signals the group and awaits only direct-child close before isolated-worktree cleanup. Whole-group disappearance is not proven, and resistant or new-session/new-group descendants remain an explicit OS-isolation limitation.
- Delegated implementation: PR30-02 rejects an untrusted provider extension before creating `asen-policy-*`; stop paths preserve their intended result through the platform-bounded termination step and policy cleanup. Spawn failure without a PID may settle on `error`, while an established PID requires actual `close`.
- Required verification passed: execution revision 7/7, Pi process runner 36/36, TypeScript typecheck, full local tests 203/203, parity 6/6, 27/27 Skills, tracked boundary over 233 paths, and package verification over 61 files.
- Remote exact-SHA follow-up at `b8ec552a63af5265397fb71eb7070626f66507ce`: Ubuntu CI job `109410973806` exposed a test-observation defect where POSIX `kill(pid, 0)` classified zombie descendant PID 4201 as alive after SIGKILL. The bounded harness correction distinguishes `Z` from genuinely live `ps` states and preserves observation errors as failures.
- Exact correction SHA `bdff17239a9e735b20b4932dbf7800958fc64037`: Phase 0 Architecture `36572500452`, CI `36572500046`, Release Gate `36572500099`, and Pi Free Smoke `36572500113` passed. ASEN Authenticated Pi Audit `36572500151` exercised all three bounded attempts and each received an external OpenRouter 429 for `qwen/qwen3.8-27b:free`; the retry path worked, but authenticated evidence remains externally blocked.

## Next step

Do not merge. Preserve the exact published history for review; authenticated provider evidence can be rerun when upstream free-model capacity is available.
