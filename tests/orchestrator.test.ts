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
 assert.deepEqual(p.skills,["asen-phase-protocol","asen-work-unit","asen-safe-change","asen-apply","asen-odd","asen-tdd","asen-review"]);
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
  {taskId:"phase",repository:"r",prompt:"implement",skillPhase:"apply",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  routeOdd({filesTouched:4})
 );
 const explorer=p.agents.find(a=>a.role==="explorer");
 const worker=p.agents.find(a=>a.role==="worker");
 const reviewer=p.agents.find(a=>a.role==="reviewer");
 const verifier=p.agents.find(a=>a.role==="verifier");
 assert.deepEqual(worker?.skillPaths,[
  "skills/asen-phase-protocol/SKILL.md",
  "skills/asen-work-unit/SKILL.md",
  "skills/asen-safe-change/SKILL.md",
  "skills/asen-apply/SKILL.md",
  "skills/asen-odd/SKILL.md"
 ]);
 assert.ok(explorer?.skillPaths?.includes("skills/asen-explore/SKILL.md"));
 assert.equal(explorer?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
 assert.ok(reviewer?.skillPaths?.includes("skills/asen-adversarial-review/SKILL.md"));
 assert.equal(reviewer?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
 assert.ok(verifier?.skillPaths?.includes("skills/asen-verify/SKILL.md"));
 assert.equal(verifier?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
});

test("delegated role contexts are independently issued and task-bound",()=>{
 const candidate={id:"c",repository:"r",revision:"sha",createdAt:"now"};
 const p=buildOrchestrationPlan({taskId:"phase",repository:"r",prompt:"implement",skillPhase:"apply",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},routeOdd({filesTouched:4}));
 assert.equal(p.agents.find(a=>a.role==="explorer")?.skillContext?.taskId,"phase:explore");
 assert.equal(p.agents.find(a=>a.role==="worker")?.skillContext?.taskId,"phase:worker");
 assert.equal(p.agents.find(a=>a.role==="reviewer")?.skillContext?.taskId,"phase:review");
 assert.equal(p.agents.find(a=>a.role==="verifier")?.skillContext?.taskId,"phase:verify");
});
