import assert from "node:assert/strict";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
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

test("legacy recovery does not persist or remint private selection description",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-selection-provenance-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"lifecycle.json"),key=randomBytes(32);
 const lifecycle=createSkillLifecycle(await issueStructuredLifecycleApplicability("GSP05I1-C1-recovery",candidate,["src/a.ts"],"not-applicable","unspecified"));
 const marked=lifecycle.state;assert.ok(workflowSelectionDescriptionForSnapshot(marked));
 await saveLifecycle(path,marked,key);
 const recovered=await loadLifecycle(path,"GSP05I1-C1-recovery",candidate,key),recoveredSnapshot=recovered.state;
 assert.equal(workflowSelectionDescriptionForSnapshot(recoveredSnapshot),undefined);
 assert.equal(workflowSelectionDescriptionForSnapshot(recovered.state),undefined);
 assert.deepEqual(Reflect.ownKeys(recoveredSnapshot),["version","taskId","candidate","nextPhase","records"]);
});
