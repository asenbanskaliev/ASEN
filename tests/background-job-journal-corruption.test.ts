import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BackgroundJobJournal } from "../src/runtime/background-job-journal.js";

test("corrupt or oversized background journals fail closed instead of being treated as empty", () => {
  const parent = path.join(os.tmpdir(), `asen-journal-${process.pid}-${Date.now()}`);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const file = path.join(parent, "background-jobs.json");
  writeFileSync(file, "{", { encoding: "utf8", mode: 0o600 });
  const journal = new BackgroundJobJournal(file);
  assert.throws(() => journal.load("session-a", "project-a"), /corrupt/u);
});