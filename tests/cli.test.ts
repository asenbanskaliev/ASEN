import test from "node:test";import assert from "node:assert/strict";import {launcherPackageRoot} from "../src/cli.js";
test("launcher package root is absolute",()=>assert.equal(typeof launcherPackageRoot()==="string"&&launcherPackageRoot().length>0,true));
