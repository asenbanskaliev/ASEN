import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BackgroundJobJournal } from "../src/runtime/background-job-journal.js";

test("corrupt or oversized background journals fail closed instead of being treated as empty", (t) => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "asen-journal-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const file = path.join(parent, "background-jobs.json");
  writeFileSync(file, "{", { encoding: "utf8", mode: 0o600 });
  const journal = new BackgroundJobJournal(file);

  assert.throws(() => journal.load("session-a", "project-a"), /corrupt/u);

  // The journal is capped at 2 MiB; a sparse file exercises the size guard cheaply.
  truncateSync(file, 2 * 1024 * 1024 + 1);
  assert.throws(() => journal.load("session-a", "project-a"), /byte limit/u);
});
