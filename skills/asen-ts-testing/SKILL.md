---
name: asen-ts-testing
description: "Trigger: writing or reviewing TypeScript tests in ASEN, node:test, assert, check:fast, check:full, test isolation, fixtures. Apply ASEN-specific Node test runner patterns."
license: MIT
metadata:
  author: ASEN
  version: "1.0.0"
---

## Activation Contract

Use when writing, reviewing, or diagnosing TypeScript tests in ASEN.
Covers unit tests, behavior tests, integration tests, and audit scripts.

## Stack

| Layer | Tool |
|---|---|
| Runner | `node:test` (native Node.js test runner) |
| Assertions | `node:assert/strict` |
| Transpiler | `tsx` via `--import tsx` |
| Orchestrator | `scripts/run-tests.mjs` (sharded, watchdog timeouts) |
| Typecheck | `tsc --noEmit` |

**No Jest. No Vitest. No Mocha.**

## Hard Rules

- Always `import test from "node:test"` and `import assert from "node:assert/strict"`.
- Never use `expect()`, `describe()`, `it()` or any Jest-style API.
- Isolate stateful tests with their own temp home: `mkdtemp(join(tmpdir(), "asen-<prefix>-"))`.
- Always clean up temp directories with `t.after(async () => rm(home, { recursive: true, force: true }))`.
- Never share mutable state between top-level `test()` calls.
- Audit scripts (`audit:*`) are **not** test files — they live in `scripts/` and run separately.

## Test Suites

| Command | What it runs | When to use |
|---|---|---|
| `npm run check:fast` | typecheck + 4 fast unit tests | Before every commit |
| `npm test` | all tests via sharded runner | Full validation |
| `npm run check` | typecheck + tests + all audits | Pre-push / CI gate |
| `node --import tsx --test tests/foo.test.ts` | single file | While writing a test |

## Decision Gates

| Situation | Pattern |
|---|---|
| Pure behavior / data transform | Flat `test()` calls, `assert.deepEqual` |
| Event-driven / async behavior | `async t =>` with `await`, `AbortController` |
| State that depends on filesystem | `routingFixture` / `sessionProfileFixture` pattern |
| Fake host/plugin surface | `host()` factory returning pi mock + context |
| Agent dispatch behavior | `captureRunner` / `requestQueue` helpers |
| Catalog or registry invariants | Direct import + `assert.deepEqual(array.sort(), expected.sort())` |
| Audit policy (boundary, parity) | Script in `scripts/`, not a test file |

## Canonical Patterns

### Pattern 1: Simple behavior test

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { myFunction } from "../src/module.js";

test("does X given Y", () => {
  const result = myFunction("input");
  assert.equal(result, "expected");
});

test("throws on invalid input", () => {
  assert.throws(() => myFunction(""), /must not be empty/);
});
```

### Pattern 2: Async test with AbortController

```ts
test("cooperative cancellation stops processing", async () => {
  const controller = new AbortController();
  const thing = new MyProcessor({ signal: controller.signal });

  assert.equal(thing.isCancelled(), false);
  controller.abort();
  assert.equal(thing.isCancelled(), true);
});
```

### Pattern 3: Filesystem-isolated test (routingFixture pattern)

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

async function routingFixture(t: TestContext, prefix: string) {
  const home = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => rm(home, { recursive: true, force: true }));
  return { home };
}

test("persists state across sessions", async t => {
  const { home } = await routingFixture(t, "asen-my-feature-");
  // use `home` as isolated root — never process.env.HOME
});
```

### Pattern 4: Fake host (pi mock)

```ts
function host() {
  const events = new Map<string, Function[]>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const messages: string[] = [];

  const pi = {
    on(name: string, handler: Function) {
      events.set(name, [...(events.get(name) ?? []), handler]);
    },
    registerCommand(name: string, command: any) { commands.set(name, command); },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    getCommands() { return []; },
    getAllTools() { return []; },
  };

  const context = (session = "session-a", cwd = process.cwd()) => ({
    mode: "rpc",
    hasUI: true,
    cwd,
    sessionManager: { getSessionId: () => session },
    ui: {
      notify: (msg: string) => messages.push(msg),
      confirm: async () => true,
    },
  });

  return { pi, events, commands, tools, messages, context };
}

test("registers the expected tool on init", () => {
  const { pi, tools } = host();
  createMyExtension()(pi as any);
  assert.ok(tools.has("my_tool_name"));
});
```

### Pattern 5: Agent request capture

```ts
import type { AgentRunner } from "../src/agents/dispatcher.js";

function captureRunner(output = "ok") {
  const requests: AgentRequest[] = [];
  const runner: AgentRunner = {
    run: async request => {
      requests.push(request);
      return { id: request.id, ok: true, output };
    },
  };
  return { requests, runner };
}

test("dispatches with frozen session model", async () => {
  const { requests, runner } = captureRunner();
  // ... wire extension with runner ...
  assert.equal(requests[0]!.model, "expected/model");
});
```

### Pattern 6: Catalog/registry invariant

```ts
import { ASEN_COMMAND_CATALOG, implementedCommands } from "../src/runtime/ui/command-catalog.js";

test("catalog has no duplicate names", () => {
  const names = ASEN_COMMAND_CATALOG.map(x => x.name);
  assert.equal(new Set(names).size, names.length);
});

test("all implemented commands are present", () => {
  assert.deepEqual(
    implementedCommands().sort(),
    ["asen", "asen-doctor", /* ... */].sort()
  );
});
```

## Test File Location

```
tests/
├── activity-stream.test.ts        # Behavior: formatter state
├── command-catalog.test.ts        # Catalog invariants
├── pi-agent-runtime.test.ts       # Full agent runtime (large, slow)
├── <feature>.test.ts              # One file per feature boundary
scripts/
├── audit-upstream-boundary.mjs    # Policy audit (not a test)
├── audit-parity.mjs               # Parity audit
```

One test file per feature boundary. No barrel test files.

## Running a Single Test

```bash
# Single file
node --import tsx --test tests/activity-stream.test.ts

# Single test by name pattern
node --import tsx --test --test-name-pattern "cancellation" tests/activity-stream.test.ts

# Typecheck only
npx tsc --noEmit
```

## Output Contract

When adding tests, return:
1. Test file changed
2. Scenarios covered (success / failure / edge)
3. Run command and result
4. Any fixtures created and why
