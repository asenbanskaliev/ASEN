import assert from "node:assert/strict";
import test from "node:test";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("saving an observation redacts private blocks before persistence and indexing", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.save({
    id: "observation-a",
    projectId: "project-a",
    sessionId: "session-a",
    kind: "observation",
    content: "Visible <PRIVATE>secret phrase\ninside</PRIVATE> still <private>second secret</private> visible",
    createdAt: "now",
  });

  assert.equal(store.get("observation-a")?.content, "Visible [REDACTED] still [REDACTED] visible");
  assert.deepEqual(store.search("project-a", "secret"), []);
  assert.equal(store.search("project-a", "REDACTED").length, 1);
  store.close();
});

test("saving an observation rejects content that is empty after trimming", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");

  assert.throws(() => store.save({
    id: "observation-empty",
    projectId: "project-a",
    sessionId: "session-a",
    kind: "observation",
    content: "   ",
    createdAt: "now",
  }), /content.*empty/i);
  assert.equal(store.get("observation-empty"), undefined);
  store.close();
});
