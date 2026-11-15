import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SessionOrchestrator
} from "../src/runtime/lifecycle/session-orchestrator.js";

test("SessionOrchestrator coordinates all engine subsystems through a unified facade", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "asen-orchestrator-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const orchestrator = new SessionOrchestrator({
    workspaceRoot: root,
    asenDir: join(root, ".asen")
  });

  await orchestrator.init();

  // Test commands
  orchestrator.commands.register({
    name: "ping",
    description: "Ping command",
    category: "diagnostics",
    handler: async () => 0
  });
  assert.equal(orchestrator.commands.has("ping"), true);

  // Test permissions
  orchestrator.permissions.remember(root, "npm test");
  assert.equal(orchestrator.permissions.isAllowed(root, "npm test"), true);

  // Test locks
  assert.equal(orchestrator.locks.tryLock("src/app.ts", "agent-1"), true);
  assert.equal(orchestrator.locks.isLocked("src/app.ts"), true);

  // Test notices
  orchestrator.notices.push({ id: "1", level: "info", message: "Engine live", timestamp: Date.now() });
  assert.equal(orchestrator.notices.size(), 1);

  // Test dispose cleans up locks and resources
  await orchestrator.dispose();
  assert.equal(orchestrator.locks.isLocked("src/app.ts"), false);
  assert.equal(orchestrator.notices.size(), 0);
});
