# ECO-07 — independent evidence review (2026-10-12)

## Scope
Repository `asenbanskaliev/ASEN`, branch `feat/strict-parity-prerequisites`, PR #32. This review distinguishes automated persistence tests from a real Pi interruption/restart experiment.

## Confirmed evidence
- Commit `0bcec29aa31286eb0ace40755029f92580e6ce2f`: CI, Release Gate, Pi 1.1 runtime evidence, and Phase 0 Architecture all completed successfully. Pi Free Smoke was skipped.
- `tests/odd-task-tracking.test.ts` tests persistence by closing a SQLite store, reopening it, resuming the same task and checking replay order and terminal states.
- Tests cover rejected stale revisions, session/project/task mismatch, candidate mismatch, changed/missing task document, invalid transitions and competing writers.
- The implementation binds resumed state to the task document, candidate, project and session; it does not restore approval, merge or release authority.
- Independent review found two negative-path tests used literal backslash-n rather than actual control characters; corrected in `a55a22ceb3e26da643d463585bc17f93965cfa0a`. The revised commit needs its own CI confirmation.

## Evidence gap (BLOCKING for full real-world closure)
- No observed end-to-end Pi agent run interrupted mid-task, process restarted, and then resumed with the same persisted task and no duplicated work. The existing SQLite restart tests are meaningful but not that experiment.
- No verified end-to-end execution evidence from a local writable checkout in this audit environment. Direct Git clone could not resolve github.com; GitHub API access was used for source and CI inspection.
- Pi Free Smoke skipped is not a pass.

## Required final experiment
1. Use a writable checkout at the verified remote HEAD and an isolated test repository/task; record commit and environment.
2. Start a substantial ODD task through the actual Pi integration; persist task identity, candidate, session, TODOs and ordered events.
3. Interrupt the Pi process after a committed running event; restart using the persisted SQLite data and the same authorized session.
4. Verify exact document and candidate binding, recovered next step and event sequence, no duplicated execution, and no implicit approval/merge/release authority.
5. Try a mismatched session/candidate and verify rejection without changing stored data.
6. Preserve command transcript, test outputs and relevant artifact hashes, then obtain PASS for the final HEAD.
7. Mark ECO-07 complete only if all these checks pass; otherwise leave BLOCKED with the observed failure.

## Decision
**PARTIAL / NOT YET CLOSED.** Automated replay/persistence evidence is strong; real Pi interruption/resumption evidence is still missing. Do not merge PR #32 or promote ECO-07 to full parity based solely on these automated tests.

## Q1 quota-control limitations (local preparation)

**Attempt conservation, not a hard request/token budget.** The prepared workflow selects one OS per dispatch and validates the candidate and installed runtime before exposing credentials. Its recovery journey sends two explicit `prompt` RPC commands. Those commands do not bound provider requests within tool loops, retries, or token usage.

- Exact local Pi 1.1.0 exposes `before_provider_request` payload transformation, but catches handler exceptions and continues; throwing from that hook is not a reliable request veto. No built-in CLI request/turn ceiling or enforced metadata-based token budget is established.
- The harness latches a detected quota failure, prevents later RPC sends and performs bounded process cleanup. This happens **after observing a failure**; it cannot prevent quota already spent by the failing request. Transcript writes are serialized, sanitized for exact configured-secret occurrences, synced and drained before success evidence.
- Do not dispatch authenticated evidence under the current no-provider authorization. A later authorized attempt must use the exact published candidate: Ubuntu once, inspect complete artifacts, then macOS and Windows individually only after success. Do not blindly retry or fall back to another provider.
- If a hard pre-spend ceiling is required, keep Q2 blocked and separately design a provider-supported or gateway-enforced request/spend budget. Documenting this limitation is not acceptance of that risk, authenticated evidence, native approval, or ECO-07 FULL status.

## PR #32 bounded Ubuntu opt-in correction

The recovery workflow retains its manual single-OS dispatch and adds one automatic route only: a `pull_request` `labeled` event for PR #32 into `main`. The job runs only for the same repository and exact `feat/strict-parity-prerequisites` head branch, the exact `eco07:run-ubuntu` label, and the first run attempt. That route is Ubuntu 24.04 only; pushes, synchronization events, forks, other labels, other PRs, and reruns do not enter the provider job.

The PR checkout and `ASEN_EXPECTED_SHA` use the trusted pull-request head SHA. `ASEN_GITHUB_SHA` remains the original event merge SHA, while `ASEN_EVENT_HEAD_SHA` separately carries the explicit PR head metadata. The credential-free preflight rejects missing or mismatched route metadata, malformed SHA values, merge-SHA checkout substitution, a wrong repository/base/head branch, and non-Ubuntu PR execution. Manual dispatch still requires its input SHA to equal the dispatch event SHA and the dispatch branch to equal `feat/strict-parity-prerequisites`.

This opt-in conserves attempts but does not create a hard provider-request or token ceiling. It does not record an actual provider PASS, artifact admission, native approval, or ECO-07 FULL status. Repository policy requires an approved linked task, but the default branch has no required GitHub Issue Form; issue publication therefore remains pending rather than assigning a fabricated issue or approval.

## Authenticated Groq test preparation (2026-10-12)
- Repository secret `GROQ_API_KEY` was confirmed by the repository owner. The local workspace does not receive or print that secret; local `pi auth check --provider groq --json --no-refresh` reports `credentials_not_configured`.
- Added a PR #32-only Pi 1.1 workflow using Groq's supported `openai/gpt-oss-120b` model on Linux, macOS, and Windows. Each job starts an actual Pi process with ASEN's Todo tools, waits for a persisted `running` task, kills that process, reopens the same Pi session, verifies `blocked` recovery, exercises the explicit resume confirmation, records two ordered test steps once each, and requires the task to reach `done`.
- The workflow checks wrong-session and wrong-project reads and writes, records a sanitized Pi event log plus ordered review summaries and exact candidate SHA, and uploads its result even on failure. Its first exact-candidate run is still required; adding the workflow is preparation, not a test pass.
- The checkout does not persist GitHub credentials, and the Pi subprocess receives an allowlisted environment containing Groq and required OS/session variables only; Actions runtime tokens are not inherited by the model process.
- First exact-hosted trial `38263992582` proved actual Pi start, task persistence, forced process exit, blocked restart recovery, and wrong-identity rejection on Ubuntu, but failed the final continuation assertion: history remained `planned → running → blocked`. It is recorded as **FAIL**, not recovery evidence. The harness now waits for Pi's `agent_settled` after persisting the initial running state, confirms the process accepted the kill, and stores task/tool traces on failures. The follow-up exact-head run is required to show `running → done` and is not yet a pass.
- Follow-up run `38264786687` again demonstrated a real running task, process interruption, and blocked recovery, but the model read both pending files before resuming and then errored; history remained blocked and no review step was recorded. The harness now permits only Todo list/update calls until the exact resume confirmation, records the summary criteria inside the durable initial plan, and rejects pre-resume reads. This second run is also **FAIL**, not a recovery pass.
- The Pi review source is now exposed through a test-only ASEN tool that checks the durable Todo is running in the restarted process; the built-in unrestricted `read` tool is removed from this journey. This lets the model inspect the real files only after the resume confirmation and records exact read order for independent verification.
- Authenticated recovery jobs run one operating system at a time, and each newer PR candidate cancels stale Groq recovery runs to avoid competing model calls and evidence for superseded commits.
- Local script syntax, workflow YAML validation, TypeScript checks, and the focused Todo/ODD reducer suites pass. A full local run completed 126/168 tests; 42 failed under this sandbox, including Node subprocess fixtures rejected with `EPERM`. `audit:upstream-boundary` is also blocked because its Node child process cannot run `git ls-files`. These are not treated as passes; hosted exact-SHA CI remains required.
- On commit `e2c3aa163f911e95e6202fe8b60af997a98c795c`, CI's Windows test job failed `legacy v1 recovery is cross-process inspect-only only after genuine completion` with `Execution evidence command timed out` (366/367 tests passed). The bounded Windows test-helper timeout has been increased from 20 to 60 seconds; the exact-candidate CI rerun is pending.
- ECO-07 remains open until the authenticated workflow and required CI pass on the published candidate and the uploaded artifact is reviewed. ECO-06 remains open: EP-002 prompt orchestration/status/doctor, EP-003 primary-session sensitive-path/shell safety, and discovery-gated EP-004–008 public review lifecycle contracts and evidence remain incomplete.

## Exact-candidate Groq recovery result (2026-10-12)
- Published candidate `7cc35b946d0b23efd062e1ee3cfa492f138f5223`, workflow run `38266288561`, Ubuntu job `114869173683`: **FAIL**. The real Pi process created one task and persisted `planned → running`; the process was forcibly terminated, the same session restarted, and ASEN recovered the same task as `blocked`. Wrong-session and wrong-project access and mutation checks completed without changing task state.
- In the resumed Pi turn, the model called `asen_todo_list` and then returned a Pi message with `stopReason: error`. It never issued the resume update or opened/recorded either pending step. The durable history remained `planned → running → blocked`; no task was marked done. The failed-run harness did not preserve Pi's sanitized provider `errorMessage`, so this result cannot establish whether Groq rejected the continuation or returned another provider error.
- The next candidate adds redacted Pi provider error details to failure evidence and extends the real Pi package-install deadline after the Windows 2025 Pi host-matrix install exceeded 180 seconds on candidate `7cc35b9` (CI run `38266288571`, job `114869173822`). These are diagnostics and test-runtime corrections; neither changes the recovery verdict above.
- ECO-07 remains **PARTIAL / OPEN** until a later exact-candidate hosted Pi run records explicit resume consent, both ordered steps exactly once, the same task's `running → done` history, and required CI passes for that candidate. No merge or approval authority is granted by recovery.
- Candidate `a2ef8c7187e39883427874688998e1268f0948a0`, Ubuntu job `114876508981`, **did not execute Pi**: the workflow script failed to parse at module load. The GitHub API publication had truncated the large script blob. The source has been restored from the verified local commit and its syntax rechecked; the corrected next candidate must repeat the real experiment and all required CI.
- Candidate `435164f8f5aa772db8144b13a8c2acc429edb53e`, Ubuntu job `114877599602`, launched real Pi successfully and completed the forced kill, same-session restart, blocked recovery, and wrong-identity rejection. The resumed model turn ended normally without any tool call; history remained `planned → running → blocked`, with no reads or recorded steps. The trace contained 297 streaming update events and no provider error. This is **FAIL** for recovery, even though interruption and persistence worked.
- The next candidate makes the continuation request explicitly tool-directed, fails immediately if the resumed Pi turn settles while the task is still blocked, and preserves a bounded, credential-redacted final assistant reply for diagnosis. ECO-07 remains open pending a real `running → done` recovery and all mandatory exact-SHA checks.

## OpenRouter recovery trial on the current candidate (2026-10-12)
- Candidate `4006143384f88c53e592d9176122106ce8b6d723`, workflow run `38281243472`: **BLOCKED / NO RECOVERY VERDICT**. Linux, macOS, and Windows installed Pi 1.1.0 and passed exact-candidate setup, but OpenRouter rejected the first model request with HTTP 429 (`free-models-per-day`, remaining quota 0). No Todo was created, so no process interruption or recovery step was tested. These jobs are not recovery passes and do not show a defect in the Todo reducer.
- A local harness change now detects this provider limit and stops retrying immediately with the sanitized cause. Its focused test and ECO-07 replay/Todo suites pass; the full packed-install journey could not be repeated in this sandbox because its child Node launch was rejected with `EPERM`. No CI was launched for this local change.
- ECO-07 remains **PARTIAL / OPEN** until a quota-available exact-candidate Pi run completes `planned → running → blocked → running → done`, confirms the resume prompt, records both ordered steps once, and the required exact-candidate checks and artifact review are complete.
