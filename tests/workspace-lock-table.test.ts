import test from "node:test";
import assert from "node:assert/strict";
import {
  WorkspaceLockTable
} from "../src/runtime/workspace-lock-table.js";

test("WorkspaceLockTable acquires and releases locks correctly", () => {
  const table = new WorkspaceLockTable();

  assert.equal(table.tryLock("src/index.ts", "agent-1"), true);
  assert.equal(table.isLocked("src/index.ts"), true);
  assert.equal(table.getLockOwner("src/index.ts"), "agent-1");

  // Second agent tries to acquire same file -> rejected
  assert.equal(table.tryLock("src/index.ts", "agent-2"), false);

  // Re-entrant: agent-1 acquiring again succeeds (refreshes lock)
  assert.equal(table.tryLock("src/index.ts", "agent-1"), true);

  // Agent-2 cannot release agent-1's lock
  assert.equal(table.releaseLock("src/index.ts", "agent-2"), false);
  assert.equal(table.isLocked("src/index.ts"), true);

  // Agent-1 releases lock
  assert.equal(table.releaseLock("src/index.ts", "agent-1"), true);
  assert.equal(table.isLocked("src/index.ts"), false);

  // Now agent-2 can acquire
  assert.equal(table.tryLock("src/index.ts", "agent-2"), true);
});

test("WorkspaceLockTable normalizes paths so backslashes and case match in Windows", () => {
  const table = new WorkspaceLockTable();

  assert.equal(table.tryLock("SRC\\Components\\Button.tsx", "agent-1"), true);
  assert.equal(table.isLocked("src/components/button.tsx"), true);
  assert.equal(table.getLockOwner("src/components/button.tsx"), "agent-1");

  assert.equal(table.releaseLock("src/components/button.tsx", "agent-1"), true);
  assert.equal(table.isLocked("SRC\\Components\\Button.tsx"), false);
});

test("WorkspaceLockTable expires locks when TTL has passed", () => {
  let currentTime = 1000;
  const table = new WorkspaceLockTable({ clock: () => currentTime });

  assert.equal(table.tryLock("src/config.ts", "agent-1", 500), true);

  // At 1400ms: still valid
  currentTime = 1400;
  assert.equal(table.isLocked("src/config.ts"), true);
  assert.equal(table.tryLock("src/config.ts", "agent-2"), false);

  // At 1501ms: expired, agent-2 can acquire
  currentTime = 1501;
  assert.equal(table.isLocked("src/config.ts"), false);
  assert.equal(table.tryLock("src/config.ts", "agent-2"), true);
  assert.equal(table.getLockOwner("src/config.ts"), "agent-2");
});

test("WorkspaceLockTable releaseAll releases all files held by an agent", () => {
  const table = new WorkspaceLockTable();

  table.tryLock("file1.ts", "agent-1");
  table.tryLock("file2.ts", "agent-1");
  table.tryLock("file3.ts", "agent-2");

  assert.equal(table.activeLockCount(), 3);

  const releasedCount = table.releaseAll("agent-1");
  assert.equal(releasedCount, 2);

  assert.equal(table.isLocked("file1.ts"), false);
  assert.equal(table.isLocked("file2.ts"), false);
  assert.equal(table.isLocked("file3.ts"), true);
});
