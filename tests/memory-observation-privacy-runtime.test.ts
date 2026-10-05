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

test("observation content truncates at the byte limit without splitting UTF-8", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const prefix = "a".repeat(49_999);
  const id = store.addObservation({
    projectId: "project-a",
    sessionId: "session-a",
    kind: "observation",
    title: "Unicode boundary",
    content: `${prefix}😀tail`,
  });

  assert.equal(store.get(id)?.content, `${prefix}... [truncated]`);
  assert.equal(store.search("project-a", "tail").length, 0);
  assert.equal(store.search("project-a", "truncated").length, 1);
  store.close();
});

test("observation content at exactly the byte limit is not truncated", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const content = "b".repeat(50_000);
  const id = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "observation", title: "At byte limit", content });

  assert.equal(store.get(id)?.content, content);
  store.close();
});

test("generic memory saves do not apply the observation byte limit", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const content = `${"c".repeat(50_000)} tail`;
  store.save({ id: "summary-large", projectId: "project-a", sessionId: "session-a", kind: "summary", content, createdAt: "now" });

  assert.equal(Buffer.byteLength(store.get("summary-large")?.content ?? ""), Buffer.byteLength(content));
  assert.equal(store.get("summary-large")?.content.endsWith(" tail"), true);
  store.close();
});
