import assert from "node:assert/strict";
import cp from "node:child_process";
import {syncBuiltinESMExports} from "node:module";
import {basename} from "node:path";

const native = cp.execFileSync;
const keys = ["OPENROUTER_API_KEY", "LLM7_API_KEY", "GROQ_API_KEY", "GITHUB_TOKEN"];
const previous = new Map(keys.map(key => [key, process.env[key]]));
for (const key of keys) process.env[key] = `ASEN-SYNTHETIC-${key}`;

let inspected = 0;
cp.execFileSync = function(command, args, options) {
  if (args?.some(arg => basename(String(arg)) === "verify-pi-package.mjs")) {
    inspected++;
    assert.ok(options?.env, "verifier must receive an explicit environment");
    assert.equal(options.env.PI_OFFLINE, "1");
    assert.equal(options.env.PI_SKIP_VERSION_CHECK, "1");
    assert.equal(options.env.PI_TELEMETRY, "0");
    assert.equal(Object.hasOwn(options.env, "PI_PACKAGE_DIR"), false);
    for (const key of keys) {
      assert.equal(options.env[key], undefined, `${key} must not reach the verifier`);
    }
  }
  return native(command, args, options);
};
syncBuiltinESMExports();

try {
  await import("./verify-pack.mjs");
  assert.equal(inspected, 1, "packed verification must exercise the environment boundary");
  console.log("PACK_ENV_BOUNDARY_PASS");
} finally {
  cp.execFileSync = native;
  syncBuiltinESMExports();
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
