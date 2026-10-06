import test from "node:test";import assert from "node:assert/strict";import {ASEN_HELP,launcherPackageRoot} from "../src/cli.js";
test("launcher package root is absolute",()=>assert.equal(typeof launcherPackageRoot()==="string"&&launcherPackageRoot().length>0,true));
test("launcher help is local and bounded",()=>{assert.match(ASEN_HELP,/Usage: asen/);assert.match(ASEN_HELP,/asen home/);});
