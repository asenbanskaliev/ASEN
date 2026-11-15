import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
// @ts-expect-error Research-only script is outside the runtime package.
import {createDifferentialPlan} from "../scripts/eco01-differential-plan.mjs";

const root=process.cwd();
const matrix=JSON.parse(readFileSync(join(root,"docs/audit/eco01-functional-parity-matrix-2026-10-16.json"),"utf8"));
const plan=createDifferentialPlan();

test("ECO-01 evidence matrix covers each frozen source edge exactly once",()=>{
 assert.equal(matrix.sourceCommit,plan.baselineCommit);
 assert.equal(matrix.contracts.length,plan.contracts.length);
 assert.deepEqual(new Set(matrix.contracts.map((x:any)=>x.id)),new Set(plan.contracts.map((x:any)=>x.id)));
 for(const contract of plan.contracts){
  const row=matrix.contracts.find((x:any)=>x.id===contract.id);
  assert.equal(row.sourceSha256,contract.sourceSha256);
  assert.deepEqual(row.sourceSpan,contract.sourceSpan);
  assert.deepEqual(new Set(row.scenarios.map((x:any)=>x.name)),new Set(contract.scenarios.map((x:any)=>x.name)));
 }
});
test("ECO-01 cannot be called functionally complete with unverified or unadmitted scenarios",()=>{
 const cases=matrix.contracts.flatMap((row:any)=>row.scenarios);
 const unverified=cases.filter((row:any)=>row.status==="UNVERIFIED");
 const nonAdmitted=cases.filter((row:any)=>row.status!=="UNVERIFIED"&&row.evidence?.assessment?.admitted!==true);
 assert.equal(cases.length,matrix.summary.scenarios);
 assert.equal(unverified.length,matrix.summary.statusCounts.UNVERIFIED);
 assert.ok(unverified.length>0||nonAdmitted.length>0,"Remove this temporary gate only when independent admission is enforced by a permanent closure verifier");
 assert.notEqual(matrix.summary.verified,matrix.summary.scenarios);
});
