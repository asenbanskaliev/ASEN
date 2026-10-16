import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Research-only script outside runtime package.
import {createDifferentialPlan,assessPairedObservation} from "../scripts/eco01-differential-plan.mjs";
test("ECO-01 differential plan binds all frozen runtime edges without asserting parity",()=>{
 const plan=createDifferentialPlan();
 assert.equal(plan.contracts.length,25);
 assert.equal(new Set(plan.contracts.map((c:any)=>c.id)).size,25);
 assert.equal(plan.contracts.filter((c:any)=>c.kind==="code-contract").length,12);
 assert.equal(plan.contracts.filter((c:any)=>c.kind==="external-runtime").length,10);
 assert.equal(plan.contracts.filter((c:any)=>c.kind.startsWith("tracked-")).length,3);
 assert.ok(plan.contracts.every((c:any)=>c.scenarios.length===5&&c.scenarios.every((s:any)=>s.status==="UNVERIFIED")));
});
test("ECO-01 refuses unsupported parity and fabricated paired receipts",()=>{
 const plan=createDifferentialPlan(),contractId=plan.contracts[0].id,base={contractId,scenario:"normal"};
 assert.throws(()=>assessPairedObservation(plan,{...base,status:"EQUIVALENT"}),/receipts/);
 assert.throws(()=>assessPairedObservation(plan,{...base,status:"NOT_APPLICABLE"}),/rationale/);
 assert.throws(()=>assessPairedObservation(plan,{...base,scenario:"invented",status:"UNVERIFIED"}),/Invalid/);
 assert.deepEqual(assessPairedObservation(plan,{...base,status:"UNVERIFIED"}),{contractId,scenario:"normal",status:"UNVERIFIED",admitted:false});
 const receipt="a".repeat(64),asn="b".repeat(40);
 assert.throws(()=>assessPairedObservation(plan,{...base,status:"EQUIVALENT",asenCommit:asn,sourceCommit:plan.baselineCommit,sourceReceipt:receipt,asenReceipt:receipt,sourceOutput:{x:1},asenOutput:{x:2}}),/contradicts/);
 assert.equal(assessPairedObservation(plan,{...base,status:"DIVERGENT",asenCommit:asn,sourceCommit:plan.baselineCommit,sourceReceipt:receipt,asenReceipt:receipt,sourceOutput:{x:1},asenOutput:{x:2}}).admitted,false);
});
test("ECO-01 rejects drifted mapping identities",()=>{
 const plan=createDifferentialPlan();
 assert.ok(plan.contracts.every((c:any)=>c.sourceSha256.length===64));
});
