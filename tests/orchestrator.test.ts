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

test("orchestration resolves mandatory skills for a risky behavior change",()=>{
 const decision=routeOdd({filesTouched:4});
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,behaviorChange:true,filesTouched:4,writeSurfaces:["src"]},decision);
 assert.deepEqual(p.skills,["asen-odd","asen-work-unit","asen-safe-change","asen-tdd","asen-review"]);
});
