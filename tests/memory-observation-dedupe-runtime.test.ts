import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("an exact observation duplicate collapses within the default window", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.registerSession("project-a", "session-b");
  const firstId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Storage choice", content: "Use SQLite locally" });
  const secondId = store.addObservation({ projectId: "project-a", sessionId: "session-b", kind: "decision", title: "Storage choice", content: "use   sqlite locally" });

  assert.equal(secondId, firstId);
  const item = store.get(firstId);
  assert.equal(item?.content, "Use SQLite locally");
  assert.equal(item?.sessionId, "session-a");
  assert.equal(item?.revisionCount, 1);
  assert.equal(item?.duplicateCount, 2);
  store.close();
});

test("duplicate collapse requires exact project, scope, kind, and title", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.registerSession("project-b", "session-b");
  const firstId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "One", content: "same normalized body" });
  const differentTitle = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Two", content: "same normalized body" });
  const differentKind = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "summary", title: "One", content: "same normalized body" });
  const differentScope = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "One", content: "same normalized body", scope: "personal" });
  const differentProject = store.addObservation({ projectId: "project-b", sessionId: "session-b", kind: "decision", title: "One", content: "same normalized body" });

  assert.equal(new Set([firstId, differentTitle, differentKind, differentScope, differentProject]).size, 5);
  store.close();
});

test("an exact duplicate outside the default window creates a new observation", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-dedupe-window-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  let store = new SqliteMemoryStore(path);
  store.registerSession("project-a", "session-a");
  const firstId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Old choice", content: "historical marker" });
  store.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE memory SET created_at=? WHERE id=?").run(new Date(Date.now() - 16 * 60_000).toISOString(), firstId);
  db.close();
  store = new SqliteMemoryStore(path);
  const secondId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Old choice", content: "historical marker" });

  assert.notEqual(secondId, firstId);
  store.close();
});

test("soft-deleted observations are not reused by duplicate collapse", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const firstId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Choice", content: "deleted duplicate" });
  store.deleteObservation(firstId, "project-a");
  const secondId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Choice", content: "deleted duplicate" });

  assert.notEqual(secondId, firstId);
  assert.equal(store.get(secondId)?.duplicateCount, 1);
  store.close();
});

test("sub-minute dedupe windows use the one-minute minimum", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-dedupe-minute-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  let store = new SqliteMemoryStore(path, 30_000);
  store.registerSession("project-a", "session-a");
  const firstId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Choice", content: "short window marker" });
  store.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE memory SET created_at=? WHERE id=?").run(new Date(Date.now() - 45_000).toISOString(), firstId);
  db.close();
  store = new SqliteMemoryStore(path, 30_000);
  const secondId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Choice", content: "short window marker" });

  assert.equal(secondId, firstId);
  assert.equal(store.get(firstId)?.duplicateCount, 2);
  store.close();
});
