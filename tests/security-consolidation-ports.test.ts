import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The main npm test planner selects .test.ts, not .test.mjs. These wrappers
 * make the standalone security/parity negative suites execute in all CI shards.
 */
for (const filename of ["upstream-reference-policy.test.mjs", "shell-asen-parity.test.mjs"]) {
  test("CI executes security/parity negatives in " + filename, () => {
    const file = fileURLToPath(new URL("./" + filename, import.meta.url));
    // Node marks the outer test worker with NODE_TEST_CONTEXT. A nested
    // runner inherits that marker and may emit NO TAP while exiting 0, so
    // remove only the runner-internal marker and demand observed TAP cases.
    const env: NodeJS.ProcessEnv = { ...process.env, ASEN_PARITY_NO_PROVIDER: "1" };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", file], {
      encoding: "utf8", timeout: 45_000, maxBuffer: 2_000_000, env
    });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0,
      filename + " failed:\n" + String(result.stdout).slice(-6000) + "\n" + String(result.stderr).slice(-2000));
    assert.match(result.stdout, /# pass [1-9]\d*/u, "standalone suite must execute real cases");
    assert.match(result.stdout, /# fail 0/u);
  });
}
