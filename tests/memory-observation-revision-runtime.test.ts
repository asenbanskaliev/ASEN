import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteMemoryStore } from "../src/memory/sqlite-store.js";

test("a matching normalized topic revises the existing observation across restart", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-revision-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  let store = new SqliteMemoryStore(path);
  store.registerSession("project-a", "session-a");
  store.registerSession("project-a", "session-b");
  const firstId = store.addObservation({
    projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Old title",
    content: "obsolete architecture choice", topic: " Storage   Plan ", toolName: "old-tool",
  });
  const createdAt = store.get(firstId)?.createdAt;
  store.close();
  store = new SqliteMemoryStore(path);
  const secondId = store.addObservation({
    projectId: "project-a", sessionId: "session-b", kind: "observation", title: "Revised title",
    content: "current architecture choice", topic: "storage plan", toolName: "new-tool",
  });

  assert.equal(secondId, firstId);
  store.close();
  store = new SqliteMemoryStore(path);
  const revised = store.get(firstId);
  assert.equal(revised?.title, "Revised title");
  assert.equal(revised?.content, "current architecture choice");
  assert.equal(revised?.sessionId, "session-b");
  assert.equal(revised?.kind, "observation");
  assert.equal(revised?.toolName, "new-tool");
  assert.equal(revised?.topicKey, "storage-plan");
  assert.equal(revised?.revisionCount, 2);
  assert.equal(revised?.duplicateCount, 1);
  assert.equal(revised?.createdAt, createdAt);
  assert.equal(store.search("project-a", "obsolete").length, 0);
  assert.equal(store.search("project-a", "current")[0]?.id, firstId);
  store.close();
});

test("topic revisions remain isolated by project and scope", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  store.registerSession("project-b", "session-b");
  const projectA = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "A", content: "same topic", topic: "identity" });
  const projectB = store.addObservation({ projectId: "project-b", sessionId: "session-b", kind: "decision", title: "B", content: "same topic", topic: "identity" });
  const personalScope = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Personal", content: "same topic", topic: "identity", scope: "personal" });

  assert.notEqual(projectA, projectB);
  assert.notEqual(projectA, personalScope);
  store.close();
});

test("topic revision selects the latest millisecond timestamp", async t => {
  const dir = await mkdtemp(join(tmpdir(), "asen-memory-revision-order-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "memory.db");
  let store = new SqliteMemoryStore(path);
  store.registerSession("project-a", "session-a");
  const earlier = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Earlier", content: "earlier", topic: "earlier-key" });
  const latest = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Latest", content: "latest", topic: "latest-key" });
  store.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE memory SET topic_key='shared-key',updated_at=?,created_at=? WHERE id=?").run("2026-10-04T00:00:02.100Z", "2026-10-04T00:00:01.000Z", earlier);
  db.prepare("UPDATE memory SET topic_key='shared-key',updated_at=?,created_at=? WHERE id=?").run("2026-10-04T00:00:02.900Z", "2026-10-04T00:00:00.000Z", latest);
  db.close();

  store = new SqliteMemoryStore(path);
  const revisedId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Current", content: "current", topic: "shared-key" });
  assert.equal(revisedId, latest);
  assert.equal(store.get(earlier)?.revisionCount, 1);
  assert.equal(store.get(latest)?.revisionCount, 2);
  store.close();
});

test("topic revision takes priority over an exact duplicate candidate", () => {
  const store = new SqliteMemoryStore(":memory:");
  store.registerSession("project-a", "session-a");
  const topicRecord = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Old title", content: "old body", topic: "issue-42" });
  const duplicateCandidate = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Incoming title", content: "incoming body" });
  const revisedId = store.addObservation({ projectId: "project-a", sessionId: "session-a", kind: "decision", title: "Incoming title", content: "incoming body", topic: "ISSUE 42" });

  assert.equal(revisedId, topicRecord);
  assert.notEqual(revisedId, duplicateCandidate);
  assert.equal(store.get(topicRecord)?.revisionCount, 2);
  assert.equal(store.get(duplicateCandidate)?.revisionCount, 1);
  assert.equal(store.get(duplicateCandidate)?.duplicateCount, 1);
  store.close();
});
