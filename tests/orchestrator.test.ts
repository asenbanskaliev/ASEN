import assert from "node:assert/strict";import test from "node:test";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {routeOdd} from "../src/flow/odd.js";
test("orchestration uses one writer and read-only reviewer/verifier",()=>{
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",writeSurfaces:["src"],candidate:{id:"c",repository:"r",revision:"sha",createdAt:"now"}},routeOdd({filesTouched:4}));
 assert.deepEqual(p.agents.map(a=>a.role),["explorer","worker","reviewer","verifier"]);
 assert.equal(p.agents.filter(a=>a.writeSurfaces?.length).length,1);
});
test("verification route creates only verifier",()=>{
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p"},routeOdd({verificationCommand:true}));
 assert.deepEqual(p.agents.map(a=>a.role),["verifier"]);
});

test("orchestration resolves mandatory skills for a risky behavior change",()=>{
 const decision=routeOdd({filesTouched:4,securitySensitive:true});
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,behaviorChange:true,filesTouched:4,writeSurfaces:["src"],candidate:{id:"c",repository:"r",revision:"sha",createdAt:"now"}},decision);
 assert.deepEqual(p.skills,["asen-odd","asen-work-unit","asen-safe-change","asen-tdd","asen-review"]);
});


test("writer is bound to the exact orchestration candidate",()=>{
 const candidate={id:"c",repository:"r",revision:"sha",createdAt:"now"};
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},routeOdd({filesTouched:4}));
 const worker=p.agents.find(a=>a.role==="worker");
 assert.deepEqual(worker?.candidate,candidate);
 assert.equal(worker?.skillContext?.codeChange,true);
});

test("writer orchestration fails closed without candidate",()=>{
 assert.throws(()=>buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,filesTouched:4,writeSurfaces:["src"]},routeOdd({filesTouched:4})),/exact candidate/);
});

test("orchestration passes exact selected SKILL.md paths to delegated agents",()=>{
 const candidate={id:"c",repository:"r",revision:"sha",createdAt:"now"};
 const p=buildOrchestrationPlan(
  {taskId:"phase",repository:"r",prompt:"implement",skillPhase:"apply",codeChange:true,writeSurfaces:["src"],candidate},
  routeOdd({filesTouched:4})
 );
 assert.ok(p.agents.length>0);
 for(const agent of p.agents){
  assert.deepEqual(agent.skillPaths,[
   "skills/asen-work-unit/SKILL.md",
   "skills/asen-safe-change/SKILL.md",
   "skills/asen-apply/SKILL.md",
   "skills/asen-odd/SKILL.md"
  ]);
 }
});
