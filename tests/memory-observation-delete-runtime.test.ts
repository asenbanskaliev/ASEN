import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("guarded soft deletion hides an observation and rejects wrong owners without side effects", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.save({ id: "observation-a", projectId: "project-a", sessionId: "session-a", kind: "decision", content: "private marker", createdAt: "now" });

  assert.throws(() => store.deleteObservation("observation-a", "project-b"), /ownership mismatch/i);
  assert.equal(store.search("project-a", "private").length, 1);
  store.deleteObservation("observation-a", "project-a");
  assert.equal(store.search("project-a", "private").length, 0);
  assert.throws(() => store.setPinned("observation-a", true), /observation not found/i);
  assert.throws(() => store.deleteObservation("missing", "project-a"), /observation not found/i);
  store.close();
});

test("guarded hard deletion records a tombstone before removing the observation", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-delete-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  const store = new SqliteMemoryStore(path);
  store.registerSession("project-a", "session-a");
  store.save({ id: "observation-a", projectId: "project-a", sessionId: "session-a", kind: "decision", content: "hard marker", createdAt: "now" });
  store.deleteObservation("observation-a", "project-a", true);
  assert.equal(store.get("observation-a"), undefined);
  store.close();

  const db = new DatabaseSync(path);
  try {
    const tombstone = db.prepare("SELECT id,project_id FROM memory_tombstones").get() as { id: string; project_id: string };
    assert.equal(tombstone.id, "observation-a");
    assert.equal(tombstone.project_id, "project-a");
    assert.equal(db.prepare("SELECT id FROM memory WHERE id=?").get("observation-a"), undefined);
  } finally { db.close(); }
});
