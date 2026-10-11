# PR32 Windows agent persistence

## Goal and authorization
Fix the Windows durable agent-completion failure on PR #32, then assess current project phase and remaining FULL parity prerequisites. Source changes are authorized. Human-activated YOLO standing permission now permits ordinary scoped commits and non-force publication; no merge, destructive operations, scope expansion, or provider-consent substitution is authorized. Publication to an ambiguous destination still requires clarification. Do not change existing worktrees or their local edits.

## Baseline and problem
- Base: `66259d0323564c86315e80b9e66d6ef7ff5cd285`, fetched `origin/feat/strict-parity-prerequisites`.
- Working branch: `fix/pr32-windows-agent-persistence`, in the dedicated single-writer worktree `ASEN-pr32-windows-agent-persistence`.
- CI run `38123589034`, Windows job `114423188462`; Release Gate run `38123589068`, Windows job `114423188620`.
- Both fail `production Pi extension runs and restores session-scoped agent status using durable storage`, `tests/pi-agent-runtime.test.ts:32:10`.
- The agent fails on `EPERM` renaming a temporary registry file onto `.asen/agents.json`; completion is not persisted. Both runtime suites: 98 passed, 1 failed, 1 skipped. Locking/concurrency remains an unproven hypothesis.

## Scope and constraints
Source map confirms agent-store mutations already hold an exclusive lock and the shared atomic writer performs a single rename after write/sync/close. Exact source edit surfaces: `src/io/atomic-write.ts` and `tests/atomic-write.test.ts` only. Install lockfile-backed dependencies in this worktree without changing manifests. Preserve atomicity, last valid state, concurrent update protection, cancellation semantics, and existing runtime assertions. No delete-before-rename workaround, broad error suppression, increased test timeouts as a substitute, unrelated CI changes, or weakened tests. Use applicable deterministic test-first RED/GREEN evidence. Run one CPU-intensive suite at a time. FULL assessment is read-only and must follow the fix verification, distinguishing implementation from runtime/platform/package/reference evidence.

## Tasks
- [x] W1 — Map persistence mechanism and implement the smallest tested Windows-safe fix. Worker completed; parent inspected source diff and focused evidence. Work-unit commit recorded below after creation.
- [ ] W2 — Independently verify focused regression, runtime behavior, typecheck and applicable broader/package checks; run native review under the enabled user-owned switch. **In progress: independent full/package verification being delegated.**
- [ ] W3 — Assess authoritative project phase and remaining FULL gaps; recommend ordered next work without implementing new scope.

## Acceptance and evidence
W1: deterministic regression fails before the fix and passes afterward; error-specific bounded behavior does not lose or corrupt durable state. Existing runtime assertions remain meaningful.
W2: record exact commands, counts, and every failure/skipped/unavailable check. Local Windows evidence does not claim remote CI is green without a published candidate and actual runs. Native review consent/outcome is separate from permission to deliver.
W3: cite repository task/status/evidence sources for current phase and each remaining FULL prerequisite; never infer FULL from green tests alone.

## Environment and progress
- Node `v24.14.0`, npm `11.9.0`; target worktree dependencies not present at initial inspection.
- Review mode: on, inherited from global configuration.
- Existing local changes preserved in the original audit worktree and prior feature worktree.
- W1 work-unit commit: being created under human-activated YOLO standing permission; identity recorded immediately afterward.
- Worker evidence: `npm ci` installed 123 packages, zero vulnerabilities. RED atomic suite: 12 pass, 3 fail before source changes. GREEN atomic suite: 15 pass, zero fail. Focused atomic/store/Pi runtime suite: 33 pass, zero fail. `npm run typecheck` and `git diff --check` passed.
- Retry policy: Windows commit-stage EPERM only; initial rename plus five retries delayed 10/20/40/80/160 ms (310 ms total). Retain old destination and the same temporary file between attempts; permanent failure remains bounded and cleans only owned temporary data. Other error codes/stages and non-Windows EPERM fail immediately.
- Scoped diff: 2 source/test files, 177 additions and 2 deletions. Remote CI, independent full/package verification, and native review remain pending.
- Mirror: initial file and Engram observation 15171 read back; synchronize updated task document after each transition.
- Source evidence: `src/io/atomic-write.ts:86-92` attempts one rename; agent-store lock spans mutation. A transient Windows lock remains a hypothesis, not a proven process identity.
- Authorized self-checks: install `npm ci`; RED `node --import tsx --test tests/atomic-write.test.ts`; GREEN `node --import tsx --test --test-concurrency=1 tests/atomic-write.test.ts tests/agent-store.test.ts tests/pi-agent-runtime.test.ts`; `npm run typecheck`.

## Next step
Record W1 commit, receive independent verification, run native review through exact provider continuations, then assess project phase and FULL gaps read-only. Do not merge or change upstream parity claims based only on local tests.
