import assert from "node:assert/strict";
import test from "node:test";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

function seed() {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const id = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Original title", content: "original body" });
  return { store, id };
}

test("guarded content update revises the same row, refreshes its hash, and updates FTS", () => {
  const { store, id } = seed();
  const originalLastSeen = store.get(id)?.lastSeenAt;
  const revised = store.updateObservation({ id, expectedProject: "project-a", content: "replacement body" });

  assert.equal(revised.id, id);
  assert.equal(revised.content, "replacement body");
  assert.equal(revised.revisionCount, 2);
  assert.equal(revised.duplicateCount, 1);
  assert.equal(revised.lastSeenAt, originalLastSeen);
  assert.deepEqual(store.search("project-a", "original"), []);
  assert.equal(store.search("project-a", "replacement")[0]?.id, id);
  assert.equal(store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Original title", content: "replacement body" }), id);

  store.close();
});

test("a guarded update rejects missing and mismatched owners without changing the row", () => {
  const { store, id } = seed();
  const before = store.get(id);
  store.save({ id: "generic-summary", projectId: "project-a", sessionId: "session-a", kind: "summary", content: "generic content", createdAt: new Date().toISOString() });

  assert.throws(() => store.updateObservation({ id, expectedProject: "project-b", content: "must not write" }), /ownership mismatch/i);
  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", projectId: "project-b" }), /project is immutable/i);
  assert.throws(() => store.updateObservation({ id: "missing", expectedProject: "project-a", title: "absent" }), /not found/i);
  assert.throws(() => store.updateObservation({ id: "generic-summary", expectedProject: "project-a", content: "must not write" }), /not found/i);
  assert.throws(() => store.updateObservation({ id, expectedProject: " ", content: "must not write" }), /project/i);
  assert.deepEqual(store.get(id), before);
  store.close();
});

test("an unmatched literal replacement without other fields is a true no-op", () => {
  const { store, id } = seed();
  const before = store.get(id);
  const result = store.updateObservation({ id, expectedProject: "project-a", find: "absent", replace: "new" });

  assert.deepEqual(result, before);
  assert.equal(store.get(id)?.revisionCount, 1);
  assert.deepEqual(store.updateObservation({ id, expectedProject: "project-a", find: "", replace: "replacement" }), before);
  store.close();
});

test("a literal replacement updates all matches and the stored normalized hash", () => {
  const { store, id } = seed();
  const revised = store.updateObservation({ id, expectedProject: "project-a", find: "body", replace: "text" });

  assert.equal(revised.content, "original text");
  assert.equal(revised.revisionCount, 2);
  assert.equal(store.get(id)?.content, "original text");
  assert.equal(store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Original title", content: "original text" }), id);
  store.close();
});

test("malformed or empty updates are rejected without incrementing the revision", () => {
  const { store, id } = seed();
  const before = store.get(id);

  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a" }), /update/i);
  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", find: "body" }), /find|replace/i);
  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", content: " ", find: "body", replace: "new" }), /find|replace|content/i);
  assert.deepEqual(store.get(id), before);
  store.close();
});

test("literal find and replacement are each limited by UTF-8 bytes", () => {
  const { store, id } = seed();
  const before = store.get(id);

  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", find: "body", replace: "é".repeat(25_001) }), /byte limit/i);
  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", find: "é".repeat(25_001), replace: "text" }), /byte limit/i);
  assert.deepEqual(store.get(id), before);
  store.close();
});

test("literal replacement rejects output growth beyond the observation byte limit", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const id = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Many matches", content: "o".repeat(1_000) });
  const before = store.get(id);

  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", find: "o", replace: "x".repeat(25_000) }), /byte limit/i);
  assert.deepEqual(store.get(id), before);
  store.close();
});

test("literal content ending with the truncation marker remains replaceable", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const id = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Literal marker", content: "literal ... [truncated]" });

  const revised = store.updateObservation({ id, expectedProject: "project-a", find: "truncated", replace: "ordinary" });
  assert.equal(revised.content, "literal ... [ordinary]");
  assert.equal(revised.revisionCount, 2);
  store.close();
});

test("guarded metadata updates normalize kind, scope, and topic key", () => {
  const { store, id } = seed();
  const revised = store.updateObservation({ id, expectedProject: "project-a", kind: "summary", scope: " PERSONAL ", topicKey: "Architecture decision" });

  assert.equal(revised.kind, "summary");
  assert.equal(revised.scope, "personal");
  assert.equal(revised.topicKey, "architecture-decision");
  assert.equal(revised.revisionCount, 2);
  const cleared = store.updateObservation({ id, expectedProject: "project-a", scope: "unknown", topicKey: "  " });
  assert.equal(cleared.scope, "project");
  assert.equal(cleared.topicKey, undefined);
  assert.equal(cleared.revisionCount, 3);
  store.close();
});

test("an unchanged project assertion is allowed while project mutation is rejected", () => {
  const { store, id } = seed();
  const sameProject = store.updateObservation({ id, expectedProject: "project-a", projectId: "project-a" });
  assert.equal(sameProject.projectId, "project-a");
  assert.equal(sameProject.revisionCount, 2);
  assert.throws(() => store.updateObservation({ id, expectedProject: "project-a", projectId: "project-b", title: "must roll back" }), /project is immutable/i);
  assert.equal(store.get(id)?.title, "Original title");
  assert.equal(store.get(id)?.revisionCount, 2);
  store.close();
});
