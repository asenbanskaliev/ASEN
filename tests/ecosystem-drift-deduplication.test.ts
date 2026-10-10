import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {detectBaselineDrift} from "../scripts/ecosystem-baseline.mjs";

test("repeated runtime observations do not duplicate drift reports",()=>{
 const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
 const change={kind:"ADDED",path:"assets/agents/new.md"};
 const report=detectBaselineDrift(baseline,baseline,{additionalChanges:[change,change]});
 assert.deepEqual(report.changes,[change]);
 assert.equal(report.autoAdopt,false);
 assert.ok(report.invalidatedPaths.includes(change.path));
});
