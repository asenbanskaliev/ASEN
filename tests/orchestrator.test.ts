import assert from "node:assert/strict";import test from "node:test";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {routeOdd} from "../src/flow/odd.js";
test("orchestration uses one writer and read-only reviewer/verifier",()=>{
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",writeSurfaces:["src"]},routeOdd({filesTouched:4}));
 assert.deepEqual(p.agents.map(a=>a.role),["explorer","worker","reviewer","verifier"]);
 assert.equal(p.agents.filter(a=>a.writeSurfaces?.length).length,1);
});
test("verification route creates only verifier",()=>{
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p"},routeOdd({verificationCommand:true}));
 assert.deepEqual(p.agents.map(a=>a.role),["verifier"]);
});
