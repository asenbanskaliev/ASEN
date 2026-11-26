# ASEN TypeScript Test Patterns

Reference examples extracted from the real test suite.
See `tests/` for authoritative source.

---

## Pattern 1: Simple behavior test

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

---

## Pattern 2: Async test with AbortController

```ts
test("cooperative cancellation stops processing", async () => {
  const controller = new AbortController();
  const thing = new MyProcessor({ signal: controller.signal });

  assert.equal(thing.isCancelled(), false);
  controller.abort();
  assert.equal(thing.isCancelled(), true);
});
```

---

## Pattern 3: Filesystem-isolated test (routingFixture pattern)

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

---

## Pattern 4: Fake host (pi mock)

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

---

## Pattern 5: Agent request capture

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
  // wire extension with runner, trigger dispatch
  assert.equal(requests[0]!.model, "expected/model");
});
```

---

## Pattern 6: Catalog / registry invariant

```ts
import { ASEN_COMMAND_CATALOG, implementedCommands } from "../src/runtime/ui/command-catalog.js";

test("catalog has no duplicate names", () => {
  const names = ASEN_COMMAND_CATALOG.map(x => x.name);
  assert.equal(new Set(names).size, names.length);
});

test("all implemented commands are present", () => {
  assert.deepEqual(
    implementedCommands().sort(),
    ["asen", "asen-doctor" /* ... */].sort()
  );
});
```

---

## Running tests

```bash
# Single file
node --import tsx --test tests/activity-stream.test.ts

# Filter by name
node --import tsx --test --test-name-pattern "cancellation" tests/activity-stream.test.ts

# Fast gate (typecheck + 4 unit tests)
npm run check:fast

# Full suite
npm test

# Pre-push gate
npm run check
```
