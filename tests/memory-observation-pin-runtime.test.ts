import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("pin and unpin persist only the pin state for a live observation", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.save({ id: "observation-a", projectId: "project-a", sessionId: "session-a", kind: "decision", content: "SQLite choice", createdAt: "now" });

  store.setPinned("observation-a", true);
  assert.equal(store.get("observation-a")?.pinned, true);
  store.setPinned("observation-a", false);
  assert.equal(store.get("observation-a")?.pinned ?? false, false);
  assert.equal(store.get("observation-a")?.content, "SQLite choice");
  store.close();
});

test("pin and unpin reject missing and soft-deleted observations", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-pin-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  const initial = new SqliteMemoryStore(path);
  initial.registerSession("project-a", "session-a");
  initial.save({ id: "deleted", projectId: "project-a", sessionId: "session-a", kind: "decision", content: "removed", createdAt: "now" });
  initial.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE memory SET deleted_at = ? WHERE id = ?").run("2026-10-04T00:00:00Z", "deleted");
  db.close();
  const store = new SqliteMemoryStore(path);
  assert.throws(() => store.setPinned("missing", true), /observation not found/i);
  assert.throws(() => store.setPinned("deleted", true), /observation not found/i);
  store.close();
});
