import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import {buildOrchestrationPlan,type OrchestrationInput} from "../src/orchestration/orchestrator.js";
import {materializeExecutablePlan} from "../src/orchestration/executable-plan.js";
import {consumeIssuedWorkerContext,isIssuedSkillContext,issueSkillContext,matchesIssuedSkillContext} from "../src/skills/context.js";
import {getSkillContract,selectSkills,type SkillSelectionContext} from "../src/skills/registry.js";
import {controlledInstructionPlanCommand} from "../src/runtime/route-command.js";
import {dispatchNextPlanTask} from "../src/runtime/plan-dispatcher.js";
import {TaskAgentLinkStore} from "../src/runtime/task-agent-link-store.js";
import {equivalentPlannedExplorer,SessionTodoStore,type TodoPlanMetadata} from "../src/runtime/todo-store.js";
import {issueOddDecision} from "./helpers/odd-routing.js";

// Cast only the new optional field while production types still describe the legacy API.
const profiled=(context:SkillSelectionContext,selectionProfile:unknown="organic"):SkillSelectionContext=>
 ({...context,selectionProfile} as SkillSelectionContext);
const base:SkillSelectionContext={phase:"apply",codeChange:true,behaviorChange:true,risk:"medium",filesTouched:4,verification:true};
const ids=(context:SkillSelectionContext)=>selectSkills(context).map(skill=>skill.id);
function orchestration(repository:string,organic:boolean){
 const input:OrchestrationInput={taskId:"organic-selection",repository,prompt:"Implement and test the bounded behavior"};
 const decision=issueOddDecision({taskId:input.taskId,repository,paths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],writes:[{path:"src/a.ts",changeKind:"behavior"}],reviewKind:"dual_explicit",estimatedMinutes:20});
 return buildOrchestrationPlan(organic?{...input,selectionProfile:"organic"} as OrchestrationInput:input,decision);
}

test("organic selection removes only automatic strict TDD and preserves its legacy contract",()=>{
 const strict=ids(base),organic=ids(profiled(base));
 assert.ok(strict.includes("asen-tdd"));
 assert.deepEqual(organic,strict.filter(id=>id!=="asen-tdd"));
 for(const id of ["asen-apply","asen-safe-change","asen-work-unit","asen-review"] as const)assert.ok(organic.includes(id));
 assert.deepEqual(getSkillContract("asen-tdd").evidence,["lifecycle-completion"]);
 assert.deepEqual(getSkillContract("asen-tdd").blocks,["verification"]);
 assert.throws(()=>selectSkills(profiled(base,"skip-all")),/profile|selection|invalid/iu);
 assert.throws(()=>issueSkillContext("bad","/repo",undefined,profiled(base,"skip-all")),/profile|selection|invalid/iu);
});

test("organic orchestration issues genuine, bound contexts without changing default callers",()=>{
 for(const organic of [false,true]){
  const plan=orchestration("/repo",organic),worker=plan.agents.find(agent=>agent.role==="worker")!;
  assert.deepEqual(plan.agents.map(agent=>agent.role),["worker","reviewer","reviewer"]);
  assert.equal(plan.skills.includes("asen-tdd"),!organic);
  assert.ok(plan.skills.includes("asen-safe-change"));
  assert.ok(worker.skillContext);const context=worker.skillContext;
  assert.equal(isIssuedSkillContext(context),true);
  assert.equal(matchesIssuedSkillContext(context,worker.id,"/repo"),true);
  assert.equal(matchesIssuedSkillContext(context,worker.id,"/elsewhere"),false);
  assert.equal(isIssuedSkillContext({...context}),false);
  assert.equal(consumeIssuedWorkerContext({...context}),false);
  assert.equal(consumeIssuedWorkerContext(context),true);
  assert.equal(consumeIssuedWorkerContext(context),false);
  assert.equal(Object.isFrozen(context),true);
  for(const task of materializeExecutablePlan(plan,"Implement and test the bounded behavior").tasks){
   assert.equal(task.skills.includes("asen-tdd"),!organic);
   assert.equal(Object.hasOwn(task.skillSelection!,"selectionProfile"),organic);
   if(organic)assert.equal((task.skillSelection as Record<string,unknown>).selectionProfile,"organic");
   assert.equal(task.authorization,"required_before_dispatch");
  }
 }
 const decision=issueOddDecision({taskId:"unknown-profile",repository:"/repo"});
 assert.throws(()=>buildOrchestrationPlan({taskId:"unknown-profile",repository:"/repo",prompt:"Inspect only",selectionProfile:"skip-all"} as unknown as OrchestrationInput,decision),/profile|selection|invalid/iu);
});

test("public Todo roundtrip preserves organic versus absent legacy profiles and rejects drift atomically",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-organic-selection-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const identity={sessionId:"selection-roundtrip",projectId:root},file=join(root,"todos.json");
 const todos=await SessionTodoStore.open(file);
 for(const organic of [false,true]){
  const selection=organic?profiled({...base,phase:"explore"}):{...base,phase:"explore" as const};
  const plan:TodoPlanMetadata={role:"explorer",skillSelection:selection,skillPaths:selectSkills(selection).map(skill=>skill.path)};
  const add=(suffix:string,metadata=plan)=>todos.add("Inspect bounded scope",identity,undefined,undefined,`asen-plan:${organic}:${suffix}`,[],"Inspect only the bounded scope",metadata);
  const first=await add("a"),second=await add("b");
  assert.equal(equivalentPlannedExplorer(first,second),true);
  const changed={...second,plan:{...plan,skillSelection:organic?{...base,phase:"explore" as const}:profiled({...base,phase:"explore"})}};
  assert.equal(equivalentPlannedExplorer(first,changed),false,"profile participates in the public semantic fingerprint");
  const reopened=await SessionTodoStore.open(file),saved=(await reopened.list(identity)).find(row=>row.taskId===first.taskId)!;
  assert.deepEqual(saved.plan,first.plan);
  assert.equal(Object.hasOwn(saved.plan!.skillSelection!,"selectionProfile"),organic);
  const before=await reopened.list(identity);let validated=0;
  await assert.rejects(()=>reopened.add("Invalid profile",identity,undefined,()=>{validated++;},`asen-plan:${organic}:invalid`,[],"Inspect only",{...plan,skillSelection:profiled(selection,"skip-all")}),/Invalid ASEN Todo/);
  assert.equal(validated,0);
  assert.deepEqual(await reopened.list(identity),before);
  await assert.rejects(()=>add("a",{...plan,skillSelection:changed.plan.skillSelection}),/conflict/iu);
  assert.deepEqual(await reopened.list(identity),before);
 }
});

test("saved public reviewer dispatch reconstructs organic selection and keeps legacy strict",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-organic-dispatch-"));
 const identity={sessionId:"selection-dispatch",projectId:root},seen:AgentRequest[]=[];
 const agents=await AgentRuntime.open({storeFile:join(root,"agents.json"),runner:{run:async request=>{seen.push(request);return {id:request.id,ok:true,output:'{"verdict":"pass","evidence":["local double only"]}'};}}});
 t.after(async()=>{await agents.cancelSession(identity);await rm(root,{recursive:true,force:true});});
 const links=new TaskAgentLinkStore(join(root,"links.json"));
 for(const organic of [false,true]){
  const task=organic
   ?JSON.parse(controlledInstructionPlanCommand(JSON.stringify({instruction:"Implement and test bounded behavior",taskIdentity:"public-organic",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:15},unresolvedDecisions:[]}),root)).executablePlan.tasks.find((item:{role:string})=>item.role==="reviewer")
   :materializeExecutablePlan(orchestration(root,false),"Implement and test bounded behavior").tasks.find(item=>item.role==="reviewer")!;
  const todos=await SessionTodoStore.open(join(root,`todos-${organic}.json`));
  await todos.addPlan([{title:task.title,requestId:`asen-plan:${organic}:reviewer`,dependsOn:[],description:task.instruction,plan:{role:"reviewer",skillPaths:[...task.skillPaths],skillSelection:task.skillSelection}}],identity);
  const reopened=await SessionTodoStore.open(todos.path);let confirmations=0,finish!:()=>void;
  const terminal=new Promise<void>(resolve=>{finish=resolve;});
  const unsubscribe=agents.subscribeTerminal(()=>finish());
  try{
   const result=await dispatchNextPlanTask({todos:reopened,agents,links,identity,validateIdentity:async()=>{},confirm:async()=>{confirmations++;return true;}});
   assert.equal(result.status,"dispatched");assert.equal(confirmations,1);
   await terminal;
  }finally{unsubscribe();await agents.cancelSession(identity);}
  const request=seen.at(-1)!;
  assert.equal(request.role,"reviewer");assert.equal(isIssuedSkillContext(request.skillContext),true);
  assert.equal(request.skillPaths!.includes("skills/asen-tdd/SKILL.md"),!organic);
  assert.equal(Object.hasOwn(request.skillContext!,"selectionProfile"),organic);
  for(const key of ["writeSurfaces","writerAdmission","phaseGrant"] as const)assert.equal(request[key],undefined);
  assert.equal((await reopened.list(identity))[0]!.current.state,"running","review selection alone is not task acceptance");
 }
});
