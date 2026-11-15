# Windows SQLite startup-lock timeout audit

## Reconciliation

- Repository: `asenbanskaliev/ASEN`
- Branch: `feat/strict-parity-prerequisites`
- PR #32: open/draft, no merge.
- Code candidate: `863c2d903b978c44938969d0be33fed5828118d1`
- Parent: `27119ced471ad2abfcd0b08542423fcdbf8386b7`
- Main: `49129b616c5349fbf323b74860136fc1593f9b2a`

## Evidence → reproduction → cause → correction → revalidation

**Evidence.** On exact SHA `27119ced471ad2abfcd0b08542423fcdbf8386b7`, push CI run `37814092433`, attempt 1, failed Windows test 356, `serializes simultaneous opens and commits one migration before either store writes`, in `tests/memory-migrations.test.ts:95`. One worker received `Timed out waiting for private store lock` from `withExclusiveFileLockSync` at `src/io/exclusive-file-lock.ts:97`; the second open succeeded. The suite result was 1,003 passed, 1 failed, 2 skipped.

**Reproduction and control.** On the same SHA, the test passed in PR CI run `37814101679` Windows. Push CI attempt 2 of run `37814092433` also passed. These results demonstrate an intermittent failure; the first failed execution is retained and is not relabeled as a pass.

**Cause.** `SqliteMemoryStore` holds the lock through opening the database and all ordered migrations, but used the synchronous lock's 5-second default. The lock validator permits up to 30 seconds and the async default is 30 seconds. The failed Windows worker reached that default timeout while a valid startup owner was still completing initialization.

**Existing mechanism.** The failure occurred within the existing token-bound exclusive lock. Its atomic claim, fail-closed permission handling, stale-owner checks and token-safe release remain in use. A second lock or coordinator was unnecessary.

**Minimal correction.** `src/memory/sqlite-store.ts` passes a SQLite-only 30-second startup timeout. `tests/memory-migrations.test.ts` extends the existing valid-owner scenario: the holder remains live for more than five seconds; the opener must remain blocked while it owns the lock and must then complete after release. Other lock callers retain their existing timeout behavior.

**Revalidation on exact SHA `863c2d903b978c44938969d0be33fed5828118d1`.**

| Workflow | Run | Result |
| --- | ---: | --- |
| Push CI | 37817879842 | SUCCESS |
| PR CI | 37817887694 | SUCCESS |
| Phase 0 Architecture | 37817887689 | SUCCESS |
| Pi 1.0 runtime evidence | 37817887809 | SUCCESS |
| Release Gate | 37817887842 | SUCCESS on Ubuntu, macOS and Windows |
| Pi Free Smoke | 37817887821 | SKIPPED, not PASS |

On Ubuntu and macOS, each suite ran 1,006 tests: 1,006 passed, 0 failed, 0 skipped. Windows ran 1,006: 1,004 passed, 0 failed, 2 skipped for POSIX private-mode/symlink and recursive `fs.watch` portability. Test 356 passed in push and PR CI Windows. The ecosystem baseline checked 167 objects; claims validation remained 16 PARTIAL. These results apply only to SHA `863c2d9`.

## Scope and limitations

- Changed code paths: `src/memory/sqlite-store.ts`, `tests/memory-migrations.test.ts`.
- No change to token or authority semantics, persistence format, data schema, claim registry, or route status.
- No local tests ran; project validation was in GitHub Actions only.
- External model/provider calls: 0.
- The earlier TDD limitation for the source-adjudication overlay is recorded separately in `docs/audit/ecosystem-source-adjudication.md`. This Memory correction uses the failed Windows CI execution as RED evidence and a deterministic >5-second contention assertion in the regression test.
