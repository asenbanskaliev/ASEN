import assert from "node:assert/strict";
import test from "node:test";
import { classify,detectChange } from "../src/radar/radar.js";

test("radar detects but does not mutate",()=>{
  const r=detectChange({sourceId:"source-a",repository:"x",commit:"a"},{repository:"x",commit:"b",changedPaths:["internal/store/memory.go","tests/memory.test.ts"]});
  assert.equal(r?.to,"b");
  assert.equal(r?.sourceId,"source-a");
  assert.ok(r?.categories.includes("MEMORY"));
});

test("radar classifies upstream skill changes without knowing source names",()=>{
 assert.ok(classify(["skills/review/SKILL.md"]).includes("SKILLS"));
});
