import assert from "node:assert/strict";
import test from "node:test";
import { detectChange } from "../src/radar/radar.js";

test("radar detects but does not mutate",()=>{
  const r=detectChange({name:"Engram",repository:"x",commit:"a"},{repository:"x",commit:"b",changedPaths:["internal/store/memory.go","tests/memory.test.ts"]});
  assert.equal(r?.to,"b");
  assert.ok(r?.categories.includes("MEMORY"));
});
