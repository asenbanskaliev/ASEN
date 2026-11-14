import test from "node:test";
import assert from "node:assert/strict";
import type {HistoryEntry} from "../src/runtime/history.js";
import {projectHistory, selectHistoryEntry, normalizeHistoryQuery} from "../src/runtime/history-selector.js";
function entry(id: string, projectId: string, sessionId: string): HistoryEntry {
 return { id, text: `${id}:scope`, projectId, sessionId, createdAt: "2026-10-06T00:00:00Z", redacted: false };}

test("history selection defects to project scope, not session scope, and excludes another project", () => {
 const entries = [
  entry("same-a", "project-a", "session-a"),
  entry("same-b", "project-a", "session-b"), // same project, different session: both selectable by contract
  entry("foreign", "project-b", "session-a")
 ];
 const projection = projectHistory(entries, "project-a", normalizeHistoryQuery(""), 5);
 assert.equal(projection.state, "data");
 if (projection.state !== "data") return;
 assert.deepEqual(projection.rows.map(row => row.id), ["same-b", "same-a"]);
 assert.ok(!projection.rows.some(row => row.id === "foreign"));
 const selected = selectHistoryEntry(entries, "project-a", normalizeHistoryQuery(""), 5, "same-a");
 assert.deepEqual(selected, { state: "selected", id: "same-a", deletionAuthorized: false });
 assert.throws(() => selectHistoryEntry(entries, "project-b", "", 5, "same-a"), /selection/);
});