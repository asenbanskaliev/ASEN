import assert from "node:assert/strict";
import test from "node:test";
import { Dispatcher, type AgentRunner } from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {issueOddDecision} from "./helpers/odd-routing.js";import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";import {issueOrganicWriterAdmission,consumeRunnerWriteReceiver} from "../src/lifecycle/skill-lifecycle.js";

const candidate={id:"candidate",repository:"r",revision:"sha",createdAt:"now"};
function authorized(){
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"work-unit",kind:"work-unit",status:"pass",summary:"bounded",createdAt:"now"});
 evidence.add(candidate,{id:"scope",kind:"scope",status:"pass",summary:"authorized",createdAt:"now"});
 evidence.add(candidate,{id:"rollback",kind:"rollback",status:"pass",summary:"ready",createdAt:"now"});
 return evidence;
}
const sealedCodeChange=(taskId="a")=>issueSkillContext(taskId,"r",candidate,{phase:"apply",codeChange:true});
const codeChangePaths=["skills/asen-phase-protocol/SKILL.md","skills/asen-work-unit/SKILL.md","skills/asen-safe-change/SKILL.md","skills/asen-apply/SKILL.md"];
const writeRequest={id:"a",role:"worker" as const,prompt:"x",repository:"r",writeSurfaces:["src/a"],candidate,skillContext:sealedCodeChange(),skillPaths:codeChangePaths};
function organicAdmission(taskId="a"){const decision=issueOddDecision({taskId,repository:"r",paths:["src/a"],writes:[{path:"src/a",changeKind:"behavior"}]});buildOrchestrationPlan({taskId,repository:"r",prompt:"write",candidate},decision);const applicability=decideLifecycleApplicability(decision,{taskIdentity:taskId,repositoryIdentity:"r",candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},explicitMode:"organic",affectedSubsystems:["dispatcher"],expectedPaths:["src/a"],requiredArtifacts:[]});return issueOrganicWriterAdmission(applicability,["src/a"]);}

test("dispatcher releases writer grant after completion", async()=>{
  const runner: AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};
  const d=new Dispatcher(runner,authorized());
  await d.dispatch({...writeRequest,skillContext:sealedCodeChange(),writerAdmission:organicAdmission()});
  const second=await d.dispatch({...writeRequest,id:"b",skillContext:sealedCodeChange("b"),writerAdmission:organicAdmission("b")});
  assert.equal(second.ok,true);
});

test("dispatcher blocks writes without exact candidate and selected skills",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"should-not-run"})};
 const d=new Dispatcher(runner,new EvidenceStore());
 await assert.rejects(()=>d.dispatch({id:"a",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"]}),/exact candidate/);
 await assert.rejects(()=>d.dispatch({id:"b",role:"worker",prompt:"x",repository:"r",writeSurfaces:["src/a"],candidate}),/skill selection context/);
});

test("dispatcher blocks writes when mandatory mutation evidence is missing",async()=>{
 let ran=false;const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"work-unit",kind:"work-unit",status:"pass",summary:"bounded",createdAt:"now"});
 const d=new Dispatcher(runner,evidence);
 await assert.rejects(()=>d.dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:sealedCodeChange()}),/asen-safe-change.*scope evidence/);
 assert.equal(ran,false);
});

test("evidence from another revision cannot authorize writes",async()=>{
 const old={...candidate,revision:"old"},evidence=new EvidenceStore();
 evidence.add(old,{id:"old-unit",kind:"work-unit",status:"pass",summary:"old",createdAt:"now"});
 evidence.add(old,{id:"old-scope",kind:"scope",status:"pass",summary:"old",createdAt:"now"});
 evidence.add(old,{id:"old-rollback",kind:"rollback",status:"pass",summary:"old",createdAt:"now"});
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,evidence).dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:sealedCodeChange()}),/work-unit evidence/);
});

test("non-worker agents cannot receive write authority",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,authorized()).dispatch({...writeRequest,role:"reviewer",skillContext:sealedCodeChange()}),/Only worker/);
});

test("dispatcher bounds concurrent agent executions",async()=>{let active=0,max=0;const runner:AgentRunner={run:async r=>{active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,30));active--;return{id:r.id,ok:true,output:"ok"};}};const d=new Dispatcher(runner,new EvidenceStore(),2);await Promise.all(Array.from({length:6},(_,i)=>d.dispatch({id:String(i),role:"explorer",prompt:"x",repository:"r"})));assert.equal(max,2);});
test("dispatcher rejects invalid concurrency limits",()=>{const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"ok"})};assert.throws(()=>new Dispatcher(runner,new EvidenceStore(),0),/positive integer/);});


test("caller cannot omit mandatory safe-change skill from a code mutation",async()=>{
 const evidence=new EvidenceStore();
 evidence.add(candidate,{id:"only-unit",kind:"work-unit",status:"pass",summary:"bounded",createdAt:"now"});
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(
  ()=>new Dispatcher(runner,evidence).dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:sealedCodeChange()}),
  /asen-safe-change.*scope evidence/
 );
});


test("dispatcher rejects mutable skill context even when its values look valid",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(
  ()=>new Dispatcher(runner,authorized()).dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:{codeChange:true} as unknown as import("../src/skills/context.js").IssuedSkillContext}),
  /ASEN-issued skill selection context/
 );
});


test("dispatcher rejects a forged frozen skill context",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 const forged=Object.freeze({codeChange:false});
 await assert.rejects(
  ()=>new Dispatcher(runner,authorized()).dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:forged as unknown as import("../src/skills/context.js").IssuedSkillContext}),
  /ASEN-issued skill selection context/
 );
});

test("dispatcher rejects forged skill paths for an issued writer context",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 const d=new Dispatcher(runner,authorized());
 for(const skillPaths of [
  ["skills/asen-work-unit/SKILL.md"],
  ["skills/asen-work-unit/SKILL.md","skills/asen-review/SKILL.md"],
  ["skills/asen-safe-change/SKILL.md","skills/asen-work-unit/SKILL.md"],
  ["skills/asen-work-unit/SKILL.md","skills/asen-safe-change/SKILL.md","skills/asen-safe-change/SKILL.md"]
 ]){
  await assert.rejects(()=>d.dispatch({...writeRequest,writerAdmission:organicAdmission(),skillContext:sealedCodeChange(),skillPaths}),/skill paths do not match issued context/);
 }
});

test("dispatcher rejects forged skill paths for read-only delegated agents",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 const d=new Dispatcher(runner,new EvidenceStore());
 const context=issueSkillContext("read:explore","r",undefined,{phase:"explore"});
 await assert.rejects(
  ()=>d.dispatch({id:"read:explore",role:"explorer",prompt:"x",repository:"r",skillContext:context,skillPaths:["skills/asen-explore/SKILL.md"]}),
  /Delegated skill paths do not match issued context/
 );
});

test("dispatcher rejects skill paths without an issued context",async()=>{
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"bad"})};
 await assert.rejects(
  ()=>new Dispatcher(runner,new EvidenceStore()).dispatch({id:"read",role:"reviewer",prompt:"x",repository:"r",skillPaths:["skills/asen-review/SKILL.md"]}),
  /ASEN-issued skill selection context/
 );
});

test("candidate-bound read roles cannot omit their issued context or exact skill paths",async()=>{
 let ran=false;
 const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const dispatcher=new Dispatcher(runner,new EvidenceStore());
 for(const role of ["explorer","reviewer","verifier"] as const){
  await assert.rejects(()=>dispatcher.dispatch({id:"task:a",role,prompt:"x",repository:"r",candidate}),/issued skill context/);
  assert.equal(ran,false);
 }
});
test("caller-controlled expectedPhase cannot turn explorer context into reviewer or verifier authority",async()=>{
 let ran=false;const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const context=issueSkillContext("role-task","r",candidate,{phase:"explore"});
 const skillPaths=["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"];
 for(const role of ["reviewer","verifier"] as const){
  await assert.rejects(()=>new Dispatcher(runner,new EvidenceStore()).dispatch({id:"role-task",role,expectedPhase:"explore",prompt:"inspect",repository:"r",candidate,skillContext:context,skillPaths}),/agent role/);
  assert.equal(ran,false);
 }
});
test("worker cannot use an explore context to acquire write authority",async()=>{
 let ran=false;
 const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const context=issueSkillContext("a","r",candidate,{phase:"explore"});
 const paths=["skills/asen-phase-protocol/SKILL.md","skills/asen-explore/SKILL.md"];
 await assert.rejects(()=>new Dispatcher(runner,authorized()).dispatch({...writeRequest,skillContext:context,skillPaths:paths}),/apply phase/);
 assert.equal(ran,false);
});


test("worker cannot reuse authority from another lifecycle phase",async()=>{
 let ran=false;
 const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"bad"}}};
 const context=issueSkillContext("phase-worker","r",candidate,{phase:"proposal"});
 const paths=["skills/asen-phase-protocol/SKILL.md","skills/asen-proposal/SKILL.md"];
 await assert.rejects(
  ()=>new Dispatcher(runner,new EvidenceStore()).dispatch({id:"phase-worker",role:"worker",expectedPhase:"tasks",prompt:"x",repository:"r",candidate,skillContext:context,skillPaths:paths}),
  /context does not match agent role/
 );
 assert.equal(ran,false);
});

test("candidate-bound worker cannot replay an issued context by omitting expectedPhase",async()=>{
 let ran=false;
 const runner:AgentRunner={run:async r=>{ran=true;return{id:r.id,ok:true,output:"unauthorized"}}};
 const context=issueSkillContext("phase-worker","r",candidate,{phase:"proposal"});
 const paths=selectSkills(context).map(skill=>skill.path);
 const request={id:"phase-worker",role:"worker" as const,prompt:"x",repository:"r",candidate,skillContext:context,skillPaths:paths};
 await new Dispatcher(runner,new EvidenceStore()).dispatch(request);
 ran=false;
 await assert.rejects(()=>new Dispatcher(runner,new EvidenceStore()).dispatch(request),/used worker context/);
 assert.equal(ran,false);
});
test("concurrent dispatchers cannot spend the same worker context twice",async()=>{
 let started=0;
 const runner:AgentRunner={run:async r=>{started++;return{id:r.id,ok:true,output:"ok"}}};
 const context=issueSkillContext("parallel-worker","r",candidate,{phase:"proposal"});
 const request={id:"parallel-worker",role:"worker" as const,prompt:"x",repository:"r",candidate,skillContext:context,skillPaths:selectSkills(context).map(skill=>skill.path)};
 const results=await Promise.allSettled([new Dispatcher(runner,new EvidenceStore()).dispatch(request),new Dispatcher(runner,new EvidenceStore()).dispatch(request)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(results.filter(r=>r.status==="rejected"&&/used worker context/.test(String(r.reason))).length,1);
 assert.equal(started,1);
});


test("writer admission is opaque, one-use, and burns on a mismatched first claim",async()=>{
 const admission=organicAdmission();
 assert.deepEqual(Reflect.ownKeys(admission),[]);
 const d=new Dispatcher({run:async request=>({id:request.id,ok:true,output:"ok"})},authorized());
 await assert.rejects(()=>d.dispatch({...writeRequest,id:"wrong:worker",skillContext:sealedCodeChange("wrong"),writerAdmission:admission}),/unused exact writer admission/);
 await assert.rejects(()=>d.dispatch({...writeRequest,skillContext:sealedCodeChange(),writerAdmission:admission}),/unused exact writer admission/);
});

test("writer admission rejects structural forgery and duplicate or malformed surfaces",async()=>{
 const d=new Dispatcher({run:async request=>({id:request.id,ok:true,output:"ok"})},authorized());
 await assert.rejects(()=>d.dispatch({...writeRequest,skillContext:sealedCodeChange(),writerAdmission:Object.freeze({})}),/unused exact writer admission/);
 const decision=issueOddDecision({taskId:"surface",repository:"r",paths:["src/a"],writes:[{path:"src/a",changeKind:"behavior"}]});
 buildOrchestrationPlan({taskId:"surface",repository:"r",prompt:"write",candidate},decision);
 const applicability=decideLifecycleApplicability(decision,{taskIdentity:"surface",repositoryIdentity:"r",candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},explicitMode:"organic",affectedSubsystems:["dispatcher"],expectedPaths:["src/a"],requiredArtifacts:[]});
 assert.throws(()=>issueOrganicWriterAdmission(applicability,["src/a","src/a"]),/unique bounded surfaces/);
 const malformedDecision=issueOddDecision({taskId:"surface-control",repository:"r",paths:["src/a"],writes:[{path:"src/a",changeKind:"behavior"}]});
 buildOrchestrationPlan({taskId:"surface-control",repository:"r",prompt:"write",candidate},malformedDecision);
 const malformedApplicability=decideLifecycleApplicability(malformedDecision,{taskIdentity:"surface-control",repositoryIdentity:"r",candidate:{id:candidate.id,repository:candidate.repository,revision:candidate.revision},explicitMode:"organic",affectedSubsystems:["dispatcher"],expectedPaths:["src/a"],requiredArtifacts:[]});
 assert.throws(()=>issueOrganicWriterAdmission(malformedApplicability,[" src/a"]),/Invalid writer surface/);
});


test("dispatcher strips admission and conveys one exact-call runner receiver",async()=>{
 let observed=false;
 const runner:AgentRunner={run:async request=>{
  observed=true;
  assert.equal(request.writerAdmission,undefined);
  assert.ok(request.runnerWriteReceiver);
  assert.equal(consumeRunnerWriteReceiver(request.runnerWriteReceiver,request.id),true);
  assert.equal(consumeRunnerWriteReceiver(request.runnerWriteReceiver,request.id),false);
  return{id:request.id,ok:true,output:"ok"};
 }};
 const d=new Dispatcher(runner,authorized());
 await d.dispatch({...writeRequest,skillContext:sealedCodeChange(),writerAdmission:organicAdmission()});
 assert.equal(observed,true);
});


test("runner receiver burns on a mismatched first claim",async()=>{
 let receiver:object|undefined;
 const runner:AgentRunner={run:async request=>{receiver=request.runnerWriteReceiver;return{id:request.id,ok:true,output:"ok"};}};
 const d=new Dispatcher(runner,authorized());
 await d.dispatch({...writeRequest,skillContext:sealedCodeChange(),writerAdmission:organicAdmission()});
 assert.ok(receiver);
 assert.equal(consumeRunnerWriteReceiver(receiver,"wrong"),false);
 assert.equal(consumeRunnerWriteReceiver(receiver,writeRequest.id),false);
});
