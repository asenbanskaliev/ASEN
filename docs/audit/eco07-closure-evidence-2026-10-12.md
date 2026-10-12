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
