import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {rmSync} from "node:fs";
import test from "node:test";
import type {Candidate} from "../src/core/types.js";
import {decideLifecycleApplicability,tddObligationFor} from "../src/lifecycle/applicability.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {beginStrictTddCycle,type StrictTddPlan} from "../src/test/strict-tdd-cycle.js";
import * as strictModule from "../src/test/strict-tdd-cycle.js";
import {claimPassingTestObservation,executeNodePassingObservation,executeNodeTestObservation} from "../src/test/tdd-observation.js";
import {commitCandidateFiles,gitCandidate} from "./execution-evidence-helper.js";
import {issueOddDecision} from "./helpers/odd-routing.js";

const behaviorPath="src/behavior.mjs",testPath="tests/behavior.test.mjs";
const redTest=`import test from 'node:test';import assert from 'node:assert/strict';import {valid} from '../src/behavior.mjs';test('accepts valid',()=>assert.equal(valid('yes'),1));test('rejects invalid',()=>assert.equal(valid(''),2));\n`;
const plan={expectedFailingCaseIds:["accepts valid","rejects invalid"],decisionPaths:[{caseId:"accepts valid",points:[{behaviorPath,startOffset:0,endOffset:4}]},{caseId:"rejects invalid",points:[{behaviorPath,startOffset:5,endOffset:9}]}],triangulationPolicy:{mode:"required"}} as const;
function obligation(base:Candidate){const task="GSP-05C3a",paths=[behaviorPath],decision=issueOddDecision({taskId:task,repository:base.repository,paths,writes:[{path:behaviorPath,changeKind:"behavior"}],testingRequired:true});buildOrchestrationPlan({taskId:task,repository:base.repository,prompt:"apply",candidate:base},decision);return tddObligationFor(decideLifecycleApplicability(decision,{taskIdentity:task,repositoryIdentity:base.repository,candidate:{id:base.id,repository:base.repository,revision:base.revision},explicitMode:"unspecified",affectedSubsystems:["tdd"],expectedPaths:paths,requiredArtifacts:[]}));}
async function setup(){
 const initial=gitCandidate("strict-green"),base=commitCandidateFiles(initial,{[behaviorPath]:"export const valid=()=>0;\n"},"base behavior"),red=commitCandidateFiles(base,{[testPath]:redTest},"RED"),cycle=beginStrictTddCycle(obligation(base),plan);
 const redResult=cycle.recordRed(red,await executeNodeTestObservation(red,[testPath]),await executeNodeTestObservation(red,[testPath]));
 const green=commitCandidateFiles(red,{[behaviorPath]:"export const valid=value=>value==='yes'?1:2;\n"},"GREEN"),passing=await executeNodePassingObservation(green,[testPath]);return {initial,base,red,green,cycle,redResult,passing};
}
const cleanup=(t:test.TestContext,repository:string)=>t.after(()=>rmSync(repository,{recursive:true,force:true}));

test("records a direct-child GREEN with the exact RED tests, runner, cases, blobs, and modes",async t=>{
 const value=await setup();cleanup(t,value.initial.repository);const result=value.cycle.recordGreen(value.redResult,value.green,value.passing);
 assert.equal(result.state,"green-recorded");assert.deepEqual(result.executedCaseIds,plan.expectedFailingCaseIds);assert.strictEqual(result.red,value.redResult);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.greenCandidate)&&Object.isFrozen(result.testPaths)&&Object.isFrozen(value.cycle.plan.decisionPaths[0]!.points));
 assert.equal(JSON.stringify(result).match(/authority|lifecycle|phase|mutation|review|release|delivery|callback|stdout|stderr/giu),null);assert.equal("StrictGreenResult" in strictModule,false);
});

test("passing observations reject skips, todos, zero-run, assertion, syntax, and runtime failures",async t=>{
 const cases={skip:"import test from 'node:test';test('skip',{skip:true},()=>{});\n",todo:"import test from 'node:test';test.todo('todo');\n",zero:"// none\n",fail:"import test from 'node:test';import assert from 'node:assert/strict';test('x',()=>assert.fail());\n",syntax:"bad syntax }\n",runtime:"throw new Error('boom');\n"};
 for(const [name,content] of Object.entries(cases)){const base=gitCandidate(`passing-${name}`);cleanup(t,base.repository);const candidate=commitCandidateFiles(base,{[testPath]:content});await assert.rejects(()=>executeNodePassingObservation(candidate,[testPath]),/clean test run|passing tests|skipped or todo|executed test case/,name);}
});

test("rejects edited tests, empty GREEN, unrelated production, and wrong candidate bindings",async t=>{
 for(const kind of ["test","empty","unrelated","candidate"] as const){const value=await setup();cleanup(t,value.initial.repository);let green=value.green,passing=value.passing;
  if(kind!=="candidate"){
   execFileSync("git",["-C",value.red.repository,"reset","--hard",value.red.revision],{stdio:"ignore"});
   if(kind==="test")green=commitCandidateFiles(value.red,{[testPath]:redTest.replace("1));","0));").replace("2));","0));")});
   else if(kind==="empty"){execFileSync("git",["-C",value.red.repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","empty"]);green={...value.red,revision:execFileSync("git",["-C",value.red.repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim()};}
   else green=commitCandidateFiles(value.red,{[behaviorPath]:"export const valid=value=>value==='yes'?1:2;\n","src/unrelated.mjs":"export {};\n"});
   if(kind!=="empty")passing=await executeNodePassingObservation(green,[testPath]);
  }
  if(kind==="candidate")green={...green,id:"wrong"};
  assert.throws(()=>value.cycle.recordGreen(value.redResult,green,passing),/test blobs|nonempty|behavior paths|identity mismatch|execution mismatch/);
 }
});

test("GREEN first attempts burn issued RED results and observations; clones, reuse, and cross-cycle fail",async t=>{
 const first=await setup(),second=await setup();cleanup(t,first.initial.repository);cleanup(t,second.initial.repository);
 assert.throws(()=>first.cycle.recordGreen({...first.redResult},first.green,first.passing),/not issued/);assert.throws(()=>claimPassingTestObservation(first.passing),/already been claimed/);assert.throws(()=>first.cycle.recordGreen(first.redResult,first.green,first.passing),/already attempted/);
 assert.throws(()=>second.cycle.recordGreen(first.redResult,second.green,second.passing),/another strict TDD cycle/);assert.throws(()=>claimPassingTestObservation(second.passing),/already been claimed/);
});

test("rejects skipped and merge GREEN histories",async t=>{
 for(const kind of ["skipped","merge"] as const){const value=await setup();cleanup(t,value.initial.repository);execFileSync("git",["-C",value.red.repository,"reset","--hard",value.red.revision],{stdio:"ignore"});let green:Candidate;
  if(kind==="skipped"){const middle=commitCandidateFiles(value.red,{"src/middle.mjs":"export {};\n"});green=commitCandidateFiles(middle,{[behaviorPath]:"export const valid=value=>value==='yes'?1:2;\n"});}
  else{const side=commitCandidateFiles(value.red,{"src/side.mjs":"export {};\n"});execFileSync("git",["-C",value.red.repository,"checkout","-q","-b","green",value.red.revision]);commitCandidateFiles(value.red,{[behaviorPath]:"export const valid=value=>value==='yes'?1:2;\n"});execFileSync("git",["-C",value.red.repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","merge","-q","--no-ff",side.revision,"-m","merge"]);green={...value.red,revision:execFileSync("git",["-C",value.red.repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim()};}
  const passing=await executeNodePassingObservation(green,[testPath]);assert.throws(()=>value.cycle.recordGreen(value.redResult,green,passing),/direct Git parent/);
 }
});

test("decision plans require exact canonical vectors, genuine paths, and policy cardinality",()=>{
 const single={expectedFailingCaseIds:["one"],decisionPaths:[{caseId:"one",points:[{behaviorPath,startOffset:0,endOffset:1}]}],triangulationPolicy:{mode:"not-applicable",reason:"structurally-single-decision-path",rationale:"Only one structural path exists."}} as const;
 const valid=gitCandidate("plan-valid");try{const cycle=beginStrictTddCycle(obligation(valid),single);assert.equal(cycle.plan.triangulationPolicy.mode,"not-applicable");assert.ok(Object.isFrozen(cycle.plan)&&Object.isFrozen(cycle.plan.triangulationPolicy));}finally{rmSync(valid.repository,{recursive:true,force:true});}
 const malformed:unknown[]=[{...single,extra:true},{...single,decisionPaths:[]},{...single,decisionPaths:[{caseId:"other",points:single.decisionPaths[0]!.points}]},{...single,decisionPaths:[{caseId:"one",points:[{behaviorPath:"src/other.mjs",startOffset:0,endOffset:1}]}]},{...single,decisionPaths:[{caseId:"one",points:[{behaviorPath,startOffset:1,endOffset:1}]}]},{...single,triangulationPolicy:{mode:"required"}},{...single,triangulationPolicy:{mode:"not-applicable",reason:"other",rationale:"Why."}},{...single,triangulationPolicy:{mode:"not-applicable",reason:"structurally-single-decision-path",rationale:"not  normalized"}}];
 for(const item of malformed){const base=gitCandidate("plan-invalid");try{assert.throws(()=>beginStrictTddCycle(obligation(base),item as StrictTddPlan),/shape|nonempty|mapped|genuine|offsets|two distinct|structural|normalized/);}finally{rmSync(base.repository,{recursive:true,force:true});}}
});
