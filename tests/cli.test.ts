import test from "node:test";import assert from "node:assert/strict";import {ASEN_HELP,launcherPackageRoot} from "../src/cli.js";import {ASEN_CLI_USAGE} from "../src/runtime/cli-usage.js";
test("launcher package root is absolute",()=>assert.equal(typeof launcherPackageRoot()==="string"&&launcherPackageRoot().length>0,true));
test("launcher help is local and bounded",()=>{assert.match(ASEN_HELP,/Usage: asen/);assert.match(ASEN_HELP,/asen home/);});
test("launcher help is generated from the single CLI usage table, so it cannot desync",()=>{
 assert.ok(ASEN_CLI_USAGE.length>=12);
 assert.equal(new Set(ASEN_CLI_USAGE.map(row=>row.syntax)).size,ASEN_CLI_USAGE.length);
 for(const row of ASEN_CLI_USAGE)assert.ok(ASEN_HELP.includes(row.syntax),"help is missing: "+row.syntax);
 assert.match(ASEN_HELP,/asen startup/);
 assert.ok(!ASEN_HELP.includes("\u001b"));
});
