# Windows process-test scheduling

## Outcome

The npm test entry point now discovers every `tests/**/*.test.ts` file itself. On Windows it runs the ordinary files first, then runs these process-heavy files in one separate batch with `--test-concurrency=1`:

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

The independent pre-correction 4R check also reported the retained-source baseline 23/23, `npm run build`, and `npm run verify:pack` passing. Those results are prior evidence, not results from this bounded self-check. The clean-install summary reported one high-severity audit advisory; its exact `npm audit` identity was not established here, so the discrepancy remains open and no dependency or lockfile change is included.

Independent focused GREEN ran once: 8/8 runner-contract tests passed, with zero failures, cancellations or skips. The entire six-file batch then ran once with `--test-concurrency=1`: 50/50 passed, with zero failures, cancellations or skips, in 157,537.6142 ms. The exact-denial marker control passed, and the independent production timeout contract retained its explicit 50 ms deadline. These are focused Windows results on `5a41c34` plus the sealed classification follow-up, not full-suite closure. Historical marker-RED reconstructability remains a disclosed evidence limitation.

The full 1020-test suite and six audits remain pending against the new frozen parent commit. The full `npm run check` is delegated once to the independent verifier because it is expensive and is the test of whether scheduling resolves the observed full-load failure. No full gate is inferred from the focused results.

## Limits and rollback

- The isolated result is Windows evidence only; it does not prove timing behavior on every Windows host or Node release.
- Non-Windows behavior retains one default-concurrency run, but a fresh all-platform full suite is still required.
- Spawn errors, terminating signals, and the first nonzero child exit remain failures; the runner does not suppress or retry tests.
- Missing tests, duplicate plan inputs, or a missing Windows process-heavy file fail closed.

Rollback is one boundary: restore the package test command and remove `scripts/run-tests.mjs`, `scripts/test-plan.mjs`, `tests/test-runner.test.ts`, this audit, and the rejection-handler/tool-denial fixture corrections. No production file needs rollback.
