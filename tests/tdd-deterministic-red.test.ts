import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import test from "node:test";
import type { Candidate } from "../src/core/types.js";
import { decideLifecycleApplicability, tddObligationFor } from "../src/lifecycle/applicability.js";
import { buildOrchestrationPlan } from "../src/orchestration/orchestrator.js";
import { beginStrictTddCycle } from "../src/test/strict-tdd-cycle.js";
import * as strictModule from "../src/test/strict-tdd-cycle.js";
import { claimTestObservation, executeNodeTestObservation } from "../src/test/tdd-observation.js";
import { commitCandidateFiles, gitCandidate } from "./execution-evidence-helper.js";
import { issueOddDecision } from "./helpers/odd-routing.js";

const testPath="tests/red.test.mjs",plan={expectedFailingCaseIds:["rejects invalid input"]} as const;
const failingTest=`import test from 'node:test';import assert from 'node:assert/strict';test('rejects invalid input',()=>assert.equal(1,2));\n`;
function obligation(base:Candidate,required=true){
 const task="GSP-05C2",paths=required?["src/behavior.ts"]:["docs/readme.md"];
 const decision=issueOddDecision({taskId:task,repository:base.repository,paths,writes:[{path:paths[0]!,changeKind:required?"behavior":"documentation"}],testingRequired:required});
 buildOrchestrationPlan({taskId:task,repository:base.repository,prompt:"apply",candidate:base},decision);
 const applicability=decideLifecycleApplicability(decision,{taskIdentity:task,repositoryIdentity:base.repository,candidate:{id:base.id,repository:base.repository,revision:base.revision},explicitMode:"unspecified",affectedSubsystems:["tdd"],expectedPaths:paths,requiredArtifacts:[]});
 return tddObligationFor(applicability);
}
async function setup(content=failingTest,extra:Readonly<Record<string,string>>={}){
 const base=gitCandidate("strict-red"),red=commitCandidateFiles(base,{[testPath]:content,...extra},"RED"),cycle=beginStrictTddCycle(obligation(base),plan);
 return {base,red,cycle,first:await executeNodeTestObservation(red,[testPath]),second:await executeNodeTestObservation(red,[testPath])};
}

test("records two identical genuine Node assertion runs at a direct-child test-only RED",async t=>{
 const value=await setup();t.after(()=>rmSync(value.base.repository,{recursive:true,force:true}));
 const result=value.cycle.recordRed(value.red,value.first,value.second);
 assert.deepEqual(result.failingCaseIds,plan.expectedFailingCaseIds);assert.ok(Object.isFrozen(result)&&Object.isFrozen(value.first.testPaths));
 assert.deepEqual(Object.keys(value.first),["adapterId","commandFingerprint","testPaths","executedCaseIds","failingCaseIds","assertionFingerprint","failureKind"]);
 assert.equal(JSON.stringify(result).match(/authority|lifecycle|phase|mutation|review|release|delivery|callback|stdout|stderr/giu),null);
});

test("caller cannot inject commands, classifications, fingerprints, cases, or non-test paths",async t=>{
 const base=gitCandidate("strict-inputs");t.after(()=>rmSync(base.repository,{recursive:true,force:true}));
 for(const paths of [["src/production.js"],["../red.test.mjs"],[testPath,testPath],[]])await assert.rejects(()=>executeNodeTestObservation(base,paths),/test path|nonempty|duplicates/);
 const red=commitCandidateFiles(base,{[testPath]:failingTest});
 const injected=await (executeNodeTestObservation as any)(red,[testPath],{command:["fake"],adapterId:"fake",executedCaseIds:["fake"],assertionFingerprint:"a".repeat(64)});
 assert.equal(injected.adapterId,"node-test");assert.deepEqual(injected.executedCaseIds,["rejects invalid input"]);assert.deepEqual(injected.testPaths,[testPath]);
 assert.throws(()=>claimTestObservation({...injected}),/not issued/);claimTestObservation(injected);assert.throws(()=>claimTestObservation(injected),/already been claimed/);
});

test("fails closed for zero tests, syntax errors, and non-assertion runtime failures",async t=>{
 for(const [label,content] of [["zero","// no tests\n"],["syntax","this is not valid javascript }\n"],["runtime","throw new Error('boom');\n"]] as const){
  const base=gitCandidate(label);t.after(()=>rmSync(base.repository,{recursive:true,force:true}));const red=commitCandidateFiles(base,{[testPath]:content});
  await assert.rejects(()=>executeNodeTestObservation(red,[testPath]),/failing test run|not an assertion|did not report/);
 }
});

test("rejects nondeterministic actual assertion observations",async t=>{
 const randomTest=`import test from 'node:test';import assert from 'node:assert/strict';test('rejects invalid input',()=>assert.equal(Math.random(),-1));\n`;
 const value=await setup(randomTest);t.after(()=>rmSync(value.base.repository,{recursive:true,force:true}));
 assert.notEqual(value.first.assertionFingerprint,value.second.assertionFingerprint);
 assert.throws(()=>value.cycle.recordRed(value.red,value.first,value.second),/nondeterministic/);
});

test("rejects production changes, candidate mismatch, skipped, unrelated, and merge RED revisions",async t=>{
 const production=await setup(failingTest,{"src/production.js":"changed\n"});t.after(()=>rmSync(production.base.repository,{recursive:true,force:true}));
 assert.throws(()=>production.cycle.recordRed(production.red,production.first,production.second),/executed strict test paths/);
 const mismatch=await setup();t.after(()=>rmSync(mismatch.base.repository,{recursive:true,force:true}));
 assert.throws(()=>mismatch.cycle.recordRed({...mismatch.red,id:"other"},mismatch.first,mismatch.second),/identity mismatch/);
 for(const kind of ["skipped","unrelated","merge"] as const){
  const base=gitCandidate(kind);t.after(()=>rmSync(base.repository,{recursive:true,force:true}));let red:Candidate;
  if(kind==="skipped"){const middle=commitCandidateFiles(base,{"tests/middle.test.mjs":"// middle\n"});red=commitCandidateFiles(middle,{[testPath]:failingTest});}
  else if(kind==="unrelated"){execFileSync("git",["-C",base.repository,"checkout","-q","--orphan","other"]);execFileSync("git",["-C",base.repository,"rm","-q","-rf","."]);red=commitCandidateFiles(base,{[testPath]:failingTest});}
  else{const side=commitCandidateFiles(base,{"tests/side.test.mjs":"// side\n"});execFileSync("git",["-C",base.repository,"checkout","-q","-b","main",base.revision]);commitCandidateFiles(base,{[testPath]:failingTest});execFileSync("git",["-C",base.repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","merge","-q","--no-ff",side.revision,"-m","merge"]);red=gitCandidate(base.id,base.repository);}
  const first=await executeNodeTestObservation(red,[testPath]),second=await executeNodeTestObservation(red,[testPath]);
  assert.throws(()=>beginStrictTddCycle(obligation(base),plan).recordRed(red,first,second),/direct Git parent/);
 }
});

test("burns genuine observations and cycle on malformed first RED attempt",async t=>{
 const value=await setup();t.after(()=>rmSync(value.base.repository,{recursive:true,force:true}));
 assert.throws(()=>value.cycle.recordRed({...value.red,repository:"other"},value.first,value.second),/identity mismatch/);
 assert.throws(()=>claimTestObservation(value.first),/already been claimed/);assert.throws(()=>claimTestObservation(value.second),/already been claimed/);
 assert.throws(()=>value.cycle.recordRed(value.red,value.first,value.second),/already attempted/);
});

test("rejects N/A, forged, cloned, reused obligations, malformed plans, and cycle clones",()=>{
 for(const malformed of [{expectedFailingCaseIds:[]},{expectedFailingCaseIds:["x","x"]},{expectedFailingCaseIds:["x"],testPaths:["src/fake.js"]}]){
  const base=gitCandidate("plan");try{assert.throws(()=>beginStrictTddCycle(obligation(base),malformed as never),/nonempty|duplicates|shape/);}finally{rmSync(base.repository,{recursive:true,force:true});}
 }
 const base=gitCandidate("obligation");try{const genuine=obligation(base);assert.throws(()=>beginStrictTddCycle({...genuine},plan),/not issued/);const cycle=beginStrictTddCycle(genuine,plan);assert.throws(()=>beginStrictTddCycle(genuine,plan),/already been claimed/);assert.equal("StrictTddCycle" in strictModule,false);assert.throws(()=>({...cycle}).recordRed(base,{} as never,{} as never),/exact issued cycle/);}finally{rmSync(base.repository,{recursive:true,force:true});}
 const na=gitCandidate("na");try{assert.throws(()=>beginStrictTddCycle(obligation(na,false),plan),/applicable/);}finally{rmSync(na.repository,{recursive:true,force:true});}
});
