# Windows process-test scheduling

## Outcome

B0 is DONE at exact work-unit commit `2b3a83938fd4a54923c7da351a5f93ba2602d035`. The npm test entry point discovers every `tests/**/*.test.ts` file itself. On Windows it runs the ordinary files first, then runs these process-heavy files in one separate batch with `--test-concurrency=1`:

- `tests/ask-user-rpc.test.ts`
- `tests/execution-revision.test.ts`
- `tests/pi-native-skill-load.test.ts`
- `tests/pi-process-runner.test.ts`
- `tests/pi-session-recovery-e2e.test.ts`
- `tests/spawn-contained.test.ts`

The batches are awaited sequentially, so they cannot overlap. On other platforms all discovered files remain in one Node test run with default concurrency. Caller-supplied Node test options precede file arguments in every run.

## Why this is bounded

A fresh Windows/Node 24 full suite reported four failures and one cancellation in process/RPC scenarios. All five scenarios then passed in isolated sequential reproduction at their unchanged deadlines. That supports a scheduling correction but does not identify or claim removal of a production bottleneck.

The runner-contract RED was independently observed with `node --import tsx --test tests/test-runner.test.ts`: 8 tests total, 7 passed, 1 failed, with no cancellations or skips and exit code 1. The assertion at `tests/test-runner.test.ts:38` showed that the four-file plan misclassified `pi-native-skill-load` and `pi-session-recovery-e2e` into the remaining parallel batch instead of the serial process-heavy batch.

This change does not alter process containment, runtime defaults, CI workflows, or production timeout behavior. The execution-timeout fixture now attaches its expected rejection before polling the descendant marker, preventing the expected late rejection from being observed first as unhandled.

The read-only tool-denial case is a security-classification test, not a one-second startup microbenchmark. On Windows, the runner starts its timer before PowerShell and `Add-Type` prepare Job Object containment, so the fixture uses a finite 10-second runner budget there while retaining 1 second elsewhere. A separate finite Node test deadline bounds the whole case; it does not fall back to the 120-second production default.

The side-effect marker is embedded as an exact JSON string in the fixture source. A positive control, bounded to 4 seconds within the unchanged outer test deadline, runs the same fixture without tool enforcement, requires the delayed marker to appear, and removes it. The enforced run must then return the exact denied-tool result, wait beyond the same 1.5-second delay, and require the marker to remain absent. The unchanged `Pi child times out` test continues to verify the explicit 50 ms timeout contract independently.

## Reproduce and review

Review in this order:

1. `scripts/test-plan.mjs` — deterministic discovery and platform plan.
2. `scripts/run-tests.mjs` — sequential execution and failure propagation.
3. `tests/test-runner.test.ts` — complete selection, ordering, import safety, options, and failure cases.
4. `tests/execution-revision.test.ts` — earliest rejection handler.
5. `tests/pi-process-runner.test.ts` — bounded tool-denial classification and unchanged timeout contract.
6. `package.json` — npm entry point only.

Run the bounded checks:

```text
node --import tsx --test --test-name-pattern="read-only Pi runner fails closed when a model attempts a tool" tests/pi-process-runner.test.ts
node --import tsx --test --test-name-pattern="Pi child times out" tests/pi-process-runner.test.ts
npm run typecheck
git diff --check
```

### Exact checkpoint

The two-commit slice `c5964f0` → `5a41c34` → `2b3a839` changes 10 paths (+308/-27), with exact tree `e5f5d3899b3fa55452f9c1b4b7dcb464bf679926` and diff identity `842c34d98f2879b2fdbb0cf8490ef12b5848aee4`.

A single full `npm run check` selected 1,020 tests. The core selected 970: 967 passed, 3 platform skips, 0 failed or cancelled in 1,167,285.3485 ms. The serial six-file family passed 50/50 with no skips, failures, or cancellations in 156,842.0789 ms. Combined: 1,017 passed, 3 skips, 0 failures, 0 cancellations. The skips were POSIX private-mode/symlink behavior, Windows symlink `EPERM`, and nonportable recursive `fs.watch` delivery.

Typecheck, six audits, prepack/typecheck, and `verify:pack` passed; the package contained 225 files, exposed 28 exports, and passed isolated-install verification. `npm audit --json` reported 0 advisories. The earlier install report of one high advisory remains unexplained rather than fixed. Exact-candidate R1/R2/R3/R4 passed. Full log SHA-256: `7f6bf2396dcdb7407e4c4d63a49806b070bb950afb2fe0bd4b5ba3d9247e0f24`.

Classification evidence is reconstructable from RED 8 total / 7 passed / 1 failed to GREEN 8/8 and serial 50/50. The original marker RED remains unavailable and disclosed. Parent facade invocation for exact candidate `2b3a839` returned pre-native `operation_timeout` / `not_started`; the independent functional verifier performed no native call. Native authority creation did not start, so no lineage, acknowledgement, approval, or native PASS exists. Review `review-c947795ac6dafe15` remains a separate historically stopped, manually unapproved transaction.

### Historical failed candidate

At `5a41c34`, the full check stopped after the 970-test core reported one failure; the 50-test serial family and six audits did not run. That failed result remains historical and is not rewritten as a pass. Its later focused 8/8 and 50/50 admission evidence preceded the exact `2b3a839` full gate.

## Limits and rollback

- The isolated result is Windows evidence only; it does not prove timing behavior on every Windows host or Node release.
- Non-Windows behavior retains one default-concurrency run, but a fresh all-platform full suite is still required.
- Spawn errors, terminating signals, and the first nonzero child exit remain failures; the runner does not suppress or retry tests.
- Missing tests, duplicate plan inputs, or a missing Windows process-heavy file fail closed.

Rollback is one boundary: restore the package test command and remove `scripts/run-tests.mjs`, `scripts/test-plan.mjs`, `tests/test-runner.test.ts`, this audit, and the rejection-handler/tool-denial fixture corrections. No production file needs rollback.
