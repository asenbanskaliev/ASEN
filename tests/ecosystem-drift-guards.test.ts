import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {detectBaselineDrift} from "../scripts/ecosystem-baseline.mjs";

const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));

test("drift validation rejects duplicate runtime reports",()=>{
 const change={kind:"ADDED",path:"docs/added.md"};
 assert.throws(()=>detectBaselineDrift(baseline,baseline,{additionalChanges:[change,change]}),/Duplicate runtime edge drift change/);
});

test("drift validation rejects self-renames and missing owners",()=>{
 assert.throws(()=>detectBaselineDrift(baseline,baseline,{additionalChanges:[{kind:"RENAMED",path:"docs/old.md",to:"docs/old.md"}]}),/Malformed runtime edge drift changes/);
 assert.throws(()=>detectBaselineDrift(baseline,baseline,{runtimeEdges:[{sourcePath:"docs/missing-owner.md",targetPaths:["README.md"]}]}),/Runtime edge owner is missing/);
});
