import test from "node:test";
import assert from "node:assert/strict";
import {snapshotWorkspaceRoots} from "../src/runtime/workspace-snapshot.js";
test("reports a git root and isolates an unavailable root",()=>{const rows=snapshotWorkspaceRoots([process.cwd(),"/not-a-real-workspace"]);assert.ok(rows[0]!.head);assert.equal(rows[1]!.branch,"unavailable");});

