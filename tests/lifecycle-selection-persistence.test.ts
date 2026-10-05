import assert from "node:assert/strict";
import {mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHmac,randomBytes} from "node:crypto";
import test from "node:test";
import {decideLifecycleApplicability,decideLifecycleApplicabilityWithSelection,workflowSelectionDescriptionForApplicability,type LifecycleApplicabilityInput} from "../src/lifecycle/applicability.js";
import {createSkillLifecycle,loadLifecycle,saveLifecycle,workflowSelectionDescriptionForSnapshot} from "../src/lifecycle/skill-lifecycle.js";
import {issueStructuredLifecycleApplicability} from "./helpers/lifecycle-applicability.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {fixtureArtifactRunner} from "./lifecycle-pi-fixture.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {claimWorkflowSelection,registerWorkflowSelectionCommand,type WorkflowSelectionChoice} from "../src/lifecycle/workflow-selection.js";

const repository=await realpath(".");
const candidate={id:"selection-provenance",repository,revision:"cb9d7fc",createdAt:"now"};
const description={schemaVersion:1,workflow:"sdd",source:"pi-command",taskIdentity:"GSP05I1-C1",repositoryIdentity:repository} as const;
function routed(taskIdentity:string,repositoryIdentity:string){
 const boundCandidate={...candidate,repository:repositoryIdentity},decision=issueOddDecision({taskId:taskIdentity,repository:repositoryIdentity,paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind:"documentation"}]});
 buildOrchestrationPlan({taskId:taskIdentity,repository:repositoryIdentity,prompt:"structured",candidate:boundCandidate},decision);
 const input:LifecycleApplicabilityInput={taskIdentity,repositoryIdentity,candidate:{id:boundCandidate.id,repository:repositoryIdentity,revision:boundCandidate.revision},explicitMode:"unspecified",affectedSubsystems:["lifecycle"],expectedPaths:["src/a.ts"],requiredArtifacts:[]};
 return {decision,input};
}
async function admittedSelection(taskIdentity:string,cwd:string){
 const commands=new Map<string,{handler:(args:string|undefined,context:{cwd:string;ui:{notify():void}})=>unknown}>(),consumer=registerWorkflowSelectionCommand((name,command)=>commands.set(name,command));
 const choice=await commands.get("asen-workflow")!.handler(`sdd ${taskIdentity}`,{cwd,ui:{notify:()=>{}}}) as WorkflowSelectionChoice,repositoryIdentity=await realpath(cwd);
 return claimWorkflowSelection(consumer,choice,{taskIdentity,repositoryIdentity});
}

test("genuine command selection privately describes only exact initial and phase snapshots",async()=>{
 const applicability=await issueStructuredLifecycleApplicability("GSP05I1-C1",candidate,["src/lifecycle/skill-lifecycle.ts"],"not-applicable","unspecified");
 assert.deepEqual(workflowSelectionDescriptionForApplicability(applicability),description);
 const lifecycle=createSkillLifecycle(applicability),initial=lifecycle.state;
 const observed=workflowSelectionDescriptionForSnapshot(initial);
 assert.deepEqual(observed,description);assert.ok(Object.isFrozen(observed));
 assert.deepEqual(Reflect.ownKeys(initial),["version","taskId","candidate","nextPhase","records"]);
 const context=issueSkillContext("GSP05I1-C1:worker",repository,candidate,{phase:"context-init"}),skillPaths=selectSkills(context).map(skill=>skill.path);
 const runner=fixtureArtifactRunner(()=>({kind:"project-context",content:"context",repository,candidateId:candidate.id,revision:candidate.revision}));
 const phase=await lifecycle.runPhase(new Dispatcher(runner,new EvidenceStore()),{phase:"context-init",context,skillPaths,prompt:"context",evidence:new EvidenceStore(),risk:"low"});
 assert.deepEqual(workflowSelectionDescriptionForSnapshot(phase),description);
 assert.deepEqual(workflowSelectionDescriptionForSnapshot(lifecycle.state),description);
});

test("direct selection-aware applicability rejects and burns cross-route provenance",async t=>{
 const parent=await mkdtemp(join(tmpdir(),"asen-selection-binding-"));t.after(()=>rm(parent,{recursive:true,force:true}));
 const repoA=await realpath(await mkdtemp(join(parent,"repo-a-"))),repoB=await realpath(await mkdtemp(join(parent,"repo-b-")));
 for(const mismatch of [
  {selectionTask:"task-a",selectionRepo:repoA,routeTask:"task-b",routeRepo:repoA},
  {selectionTask:"same-task",selectionRepo:repoA,routeTask:"same-task",routeRepo:repoB},
 ]){
  const selection=await admittedSelection(mismatch.selectionTask,mismatch.selectionRepo),wrong=routed(mismatch.routeTask,mismatch.routeRepo);
  let issued:unknown;assert.throws(()=>{issued=decideLifecycleApplicabilityWithSelection(wrong.decision,wrong.input,selection);},/selection.*binding/i);assert.equal(issued,undefined);
  const original=routed(mismatch.selectionTask,mismatch.selectionRepo);
  assert.throws(()=>decideLifecycleApplicabilityWithSelection(original.decision,original.input,selection),/already used|proof was already used/i);
 }
 const positive=routed("positive",repoB),result=decideLifecycleApplicabilityWithSelection(positive.decision,positive.input,await admittedSelection("positive",repoB));
 assert.equal(result.outcome,"structured");assert.deepEqual(workflowSelectionDescriptionForApplicability(result),{schemaVersion:1,workflow:"sdd",source:"pi-command",taskIdentity:"positive",repositoryIdentity:repoB});
 let reads=0;const fake=Object.defineProperty({},"taskIdentity",{get:()=>{reads++;return "positive";}}),caller=Object.defineProperty({},"taskIdentity",{get:()=>{reads++;return "positive";}}),unread=routed("unread",repoA);
 assert.throws(()=>decideLifecycleApplicabilityWithSelection(unread.decision,caller as LifecycleApplicabilityInput,fake),/genuinely claimed/);assert.equal(reads,0);
});

test("organic and blocked applicability retain no selection description",async()=>{
 const decision=issueOddDecision({taskId:"GSP05I1-C1-organic",repository,paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind:"documentation"}]});
 buildOrchestrationPlan({taskId:"GSP05I1-C1-organic",repository,prompt:"organic",candidate},decision);
 const organic=decideLifecycleApplicability(decision,{taskIdentity:"GSP05I1-C1-organic",repositoryIdentity:repository,candidate:{id:candidate.id,repository,revision:candidate.revision},explicitMode:"organic",affectedSubsystems:["lifecycle"],expectedPaths:["src/a.ts"],requiredArtifacts:[]});
 assert.equal(organic.outcome,"organic");assert.equal(workflowSelectionDescriptionForApplicability(organic),undefined);
 const blocked=await issueStructuredLifecycleApplicability("GSP05I1-C1-blocked",candidate,["src/a.ts"],"not-applicable","organic");
 assert.equal(blocked.outcome,"blocked");assert.equal(workflowSelectionDescriptionForApplicability(blocked),undefined);
 const selected=createSkillLifecycle(await issueStructuredLifecycleApplicability("GSP05I1-C1-selected",candidate,["src/a.ts"],"not-applicable","unspecified"));
 assert.equal(workflowSelectionDescriptionForSnapshot(selected.state)?.workflow,"sdd");
});

test("descriptive lookups reject clones and structural traps without observation",async()=>{
 const applicability=await issueStructuredLifecycleApplicability("GSP05I1-C1-intrinsic",candidate,["src/a.ts"],"not-applicable","unspecified"),lifecycle=createSkillLifecycle(applicability),snapshot=lifecycle.state;
 let invocations=0;
 const trapped=Object.defineProperties({}, {
  schemaVersion:{get:()=>{invocations++;return 1;}},
  workflow:{get:()=>{invocations++;return "sdd";}},
  describe:{get:()=>{invocations++;return ()=>invocations++;}},
 });
 assert.equal(workflowSelectionDescriptionForApplicability({...applicability}),undefined);
 assert.equal(workflowSelectionDescriptionForSnapshot(structuredClone(snapshot)),undefined);
 assert.equal(workflowSelectionDescriptionForApplicability(trapped),undefined);
 assert.equal(workflowSelectionDescriptionForSnapshot(trapped),undefined);
 assert.equal(invocations,0);
});

test("selected lifecycle persists outer v3 and preserves descriptive provenance through recovery",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-selection-provenance-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"lifecycle.json"),key=randomBytes(32),task="GSP05I1-C2-recovery";
 const lifecycle=createSkillLifecycle(await issueStructuredLifecycleApplicability(task,candidate,["src/a.ts"],"not-applicable","unspecified")),marked=lifecycle.state;
 await saveLifecycle(path,marked,key);const raw=JSON.parse(await readFile(path,"utf8"));
 assert.deepEqual(Object.keys(raw),["version","taskIdentity","repositoryIdentity","candidateId","currentRevision","nextPhase","workflowSelection","testingBinding","snapshot","mac"]);assert.equal(raw.version,3);assert.deepEqual(raw.workflowSelection,{...description,taskIdentity:task});assert.equal(raw.testingBinding.mode,"not-applicable");
 const recovered=await loadLifecycle(path,task,candidate,key);assert.deepEqual(workflowSelectionDescriptionForSnapshot(recovered.state),{...description,taskIdentity:task});
 const context=issueSkillContext(`${task}:worker`,repository,candidate,{phase:"context-init"}),skillPaths=selectSkills(context).map(skill=>skill.path),runner=fixtureArtifactRunner(()=>({kind:"project-context",content:"context",repository,candidateId:candidate.id,revision:candidate.revision}));
 const advanced=await recovered.runPhase(new Dispatcher(runner,new EvidenceStore()),{phase:"context-init",context,skillPaths,prompt:"context",evidence:new EvidenceStore(),risk:"low"});assert.ok(workflowSelectionDescriptionForSnapshot(advanced));await saveLifecycle(path,advanced,key);assert.equal(workflowSelectionDescriptionForSnapshot((await loadLifecycle(path,task,candidate,key)).state)?.taskIdentity,task);
});

test("only privately marked exact snapshots can emit v3",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-selection-mint-"));t.after(()=>rm(dir,{recursive:true,force:true}));const key=randomBytes(32),path=join(dir,"flow.json"),task="GSP05I1-C2-mint",flow=createSkillLifecycle(await issueStructuredLifecycleApplicability(task,candidate,["src/a.ts"],"not-applicable","unspecified")),state=flow.state;
 for(const forged of [structuredClone(state),{...structuredClone(state),workflowSelection:{...description,taskIdentity:task}},{...structuredClone(state),extra:true}])await assert.rejects(()=>saveLifecycle(path,forged as typeof state,key),/migration required|shape/);
 let reads=0;const trapped=structuredClone(state);Object.defineProperty(trapped,"taskId",{enumerable:true,get:()=>{reads++;return task;}});await assert.rejects(()=>saveLifecycle(path,trapped,key),/shape/);assert.equal(reads,0);
});

test("v3 exact envelope, bindings and domain fail closed even when re-signed",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-selection-v3-tamper-"));t.after(()=>rm(dir,{recursive:true,force:true}));const key=randomBytes(32),path=join(dir,"flow.json"),task="GSP05I1-C2-tamper",flow=createSkillLifecycle(await issueStructuredLifecycleApplicability(task,candidate,["src/a.ts"],"not-applicable","unspecified"));await saveLifecycle(path,flow.state,key);const original=JSON.parse(await readFile(path,"utf8"));
 const resign=(raw:any,domain="asen.lifecycle.explicit-selection.v3\0")=>{const {mac:_,...payload}=raw;raw.mac=createHmac("sha256",key).update(domain).update(JSON.stringify(payload)).digest("hex");};
 const unauthenticated=structuredClone(original);unauthenticated.workflowSelection.taskIdentity="other";await writeFile(path,JSON.stringify(unauthenticated));await assert.rejects(()=>loadLifecycle(path,task,candidate,key),/integrity/);
 const mutations=[(r:any)=>r.taskIdentity="other",(r:any)=>r.repositoryIdentity="other",(r:any)=>r.candidateId="other",(r:any)=>r.currentRevision="other",(r:any)=>r.nextPhase="archive",(r:any)=>r.workflowSelection.taskIdentity="other",(r:any)=>r.workflowSelection.repositoryIdentity="other",(r:any)=>r.workflowSelection.extra=true,(r:any)=>r.testingBinding.taskIdentity="other",(r:any)=>r.testingBinding.repositoryIdentity="other",(r:any)=>r.testingBinding.mode="required",(r:any)=>delete r.testingBinding,(r:any)=>r.extra=true,(r:any)=>r.version=4];
 for(const mutate of mutations){const raw=structuredClone(original);mutate(raw);resign(raw);await writeFile(path,JSON.stringify(raw));await assert.rejects(()=>loadLifecycle(path,task,candidate,key),/binding|identity|shape|schema|mismatch/);}
 for(const domain of ["","asen.lifecycle.v2\0"]){const raw=structuredClone(original);resign(raw,domain);await writeFile(path,JSON.stringify(raw));await assert.rejects(()=>loadLifecycle(path,task,candidate,key),/integrity/);}
 const upper=structuredClone(original);upper.mac=upper.mac.toUpperCase();await writeFile(path,JSON.stringify(upper));await assert.rejects(()=>loadLifecycle(path,task,candidate,key),/integrity/);
 let reads=0;const caller=Object.defineProperty({...candidate},"id",{enumerable:true,get:()=>{reads++;return candidate.id;}});await assert.rejects(()=>loadLifecycle(path,task,caller,key),/shape/);assert.equal(reads,0);
});
