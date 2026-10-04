import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("new observations validate title and persist generated identity with metadata across restart", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-admission-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  let store = new SqliteMemoryStore(path);
  store.registerSession("project-a", "session-a");
  const id = store.addObservation({
    projectId: "project-a",
    sessionId: "session-a",
    kind: "decision",
    title: "<PRIVATE>secret</PRIVATE> SQLite decision",
    content: "Choose SQLite for local persistence",
    topic: "Storage choice",
    scope: " PERSONAL ",
    toolName: "test",
  });

  assert.match(id, /^[0-9a-f-]{36}$/i);
  store.close();
  store = new SqliteMemoryStore(path);
  const stored = store.get(id);
  assert.ok(stored);
  assert.equal(stored.projectId, "project-a");
  assert.equal(stored.sessionId, "session-a");
  assert.equal(stored.kind, "decision");
  assert.equal(stored.title, "[REDACTED] SQLite decision");
  assert.equal(stored.topic, "Storage choice");
  assert.equal(stored.content, "Choose SQLite for local persistence");
  assert.equal(stored.scope, "personal");
  assert.equal(stored.toolName, "test");
  assert.equal(stored.topicKey, "storage-choice");
  assert.equal(stored.revisionCount, 1);
  assert.equal(stored.duplicateCount, 1);
  assert.ok(stored.createdAt && stored.lastSeenAt && stored.updatedAt);
  assert.equal(store.search("project-a", "persistence")[0]?.id, id);
  store.close();
});

test("new observations reject blank title or content before inserting", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const input = { projectId: "project-a", sessionId: "session-a", kind: "observation" as const, title: "Useful title", content: "Useful content" };

  assert.throws(() => store.addObservation({ ...input, title: "   " }), /title.*required/i);
  assert.throws(() => store.addObservation({ ...input, content: "   " }), /content.*required/i);
  store.close();
});
