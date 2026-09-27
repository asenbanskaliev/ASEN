import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Phase 10 frozen parity registry validates", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-phase10-parity.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /500 canonical IDs/);
});
