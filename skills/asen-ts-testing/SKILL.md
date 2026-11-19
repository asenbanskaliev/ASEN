---
name: asen-ts-testing
description: "Trigger: writing or reviewing TypeScript tests, node:test, assert, check:fast, test isolation, fixtures, agent test patterns in ASEN."
license: MIT
metadata:
  author: ASEN
  version: "1.1.0"
---

## Activation Contract

Use when writing, reviewing, or diagnosing TypeScript tests in ASEN.
Do not activate for audit scripts (`scripts/audit-*.mjs`) — those are policy scripts, not tests.

Stack: `node:test` (native) · `node:assert/strict` · `tsx` via `--import tsx` · orchestrated by `scripts/run-tests.mjs`.
No Jest, Vitest, Mocha, or `expect()`.

| Command | Scope | When |
|---|---|---|
| `npm run check:fast` | typecheck + 4 unit tests | Before every commit |
| `npm test` | all tests, sharded | Full validation |
| `npm run check` | typecheck + tests + all audits | Pre-push / CI gate |
| `node --import tsx --test tests/foo.test.ts` | single file | While writing |

## Hard Rules

- Always `import test from "node:test"` and `import assert from "node:assert/strict"`.
- Never use `expect()`, `describe()`, `it()`, or any Jest-style API.
- Isolate stateful tests with their own temp home via `mkdtemp(join(tmpdir(), "asen-<prefix>-"))`.
- Always register cleanup with `t.after(async () => rm(home, { recursive: true, force: true }))`.
- Never share mutable state between top-level `test()` calls.
- Never use `process.env.HOME` or hardcoded paths inside tests.

## Decision Gates

| Situation | Pattern |
|---|---|
| Pure behavior / data transform | Flat `test()` + `assert.deepEqual` |
| Async or event-driven behavior | `async t =>` + `AbortController` |
| State that depends on filesystem | `routingFixture` / `sessionProfileFixture` |
| Fake host / plugin surface | `host()` factory returning pi mock + context |
| Agent dispatch behavior | `captureRunner` / `requestQueue` helpers |
| Catalog or registry invariant | Direct import + `assert.deepEqual(arr.sort(), expected.sort())` |
| External policy (boundary, parity) | Script in `scripts/`, not a test file |

## Execution Steps

1. Identify the smallest behavior boundary to cover.
2. Select the appropriate pattern from the Decision Gates table.
3. Write success, failure, and edge cases as separate `test()` calls.
4. Run the single file with `node --import tsx --test tests/<file>.test.ts`.
5. Run `npm run check:fast` before committing.
6. Place the test file in `tests/` named `<feature>.test.ts`; one file per feature boundary.

## Output Contract

Return:
- Test file changed and its path.
- Scenarios covered (success / failure / edge).
- Run command and result.
- Fixtures created and why (if any).

## References

- `references/patterns.md` — canonical code examples for all six test patterns.
- `tests/pi-agent-runtime.test.ts` — authoritative example of host mock, captureRunner, sessionProfileFixture.
- `tests/activity-stream.test.ts` — authoritative example of behavior and AbortController tests.
- `scripts/run-tests.mjs` — test orchestrator; shard config and watchdog timeouts.
