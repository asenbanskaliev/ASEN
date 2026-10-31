import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";

test("authority integrity manifest matches current pinned source files", () => {
 const result = execFileSync(process.execPath, ["scripts/authority-pin.mjs", "check"], { encoding: "utf8" });
 assert.match(result, /Authority pin verified/);
});
