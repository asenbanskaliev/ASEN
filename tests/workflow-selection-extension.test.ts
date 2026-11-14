import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test,{after} from "node:test";
import {createAsenExtension,createPiExtension} from "../extensions/asen.js";
import {implementedCommands} from "../src/runtime/command-catalog.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {type LifecycleApplicabilityInput,tddObligationFor} from "../src/lifecycle/applicability.js";
import {claimWorkflowSelection,readWorkflowSelection,registerWorkflowSelectionCommand,type WorkflowSelectionChoice,type WorkflowSelectionConsumer} from "../src/lifecycle/workflow-selection.js";

type Context={cwd:string;ui:{notify(message:string,level:"info"|"error"):void}};
type Command={handler:(args:string|undefined,ctx:Context)=>unknown};
function registration(){
 const commands=new Map<string,Command>();
 const facade=createAsenExtension()({registerCommand:(name,command)=>{assert.ok(!commands.has(name));commands.set(name,command as Command);}});
 return {commands,facade};
}
function selectionRegistration(){
 const commands=new Map<string,Command>();
 const consumer=registerWorkflowSelectionCommand((name,command)=>commands.set(name,command));
 return {commands,consumer};
}
function context(cwd:string){const notifications:Array<{message:string;level:"info"|"error"}>=[];return {ctx:{cwd,ui:{notify:(message:string,level:"info"|"error")=>notifications.push({message,level})}},notifications};}
const ownedProjectRoots:string[]=[];
async function project(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"asen-workflow-selection-"));
 ownedProjectRoots.push(root);return root;
}
after(async()=>{for(const root of ownedProjectRoots)await fs.rm(root,{recursive:true,force:true});});
async function select(command:Command,cwd:string,task="GSP-05I1-A"){return command.handler(`sdd ${task}`,context(cwd).ctx) as Promise<WorkflowSelectionChoice>;}
function read(consumer:WorkflowSelectionConsumer,task:string,repository:string){return readWorkflowSelection(consumer,{taskIdentity:task,repositoryIdentity:repository});}
function claim(consumer:WorkflowSelectionConsumer,choice:unknown,task:string,repository:string){return claimWorkflowSelection(consumer,choice,{taskIdentity:task,repositoryIdentity:repository});}

await test("public ODD-only registration and discovery retire only the SDD selector",async()=>{
 const {commands}=registration();
 assert.equal(commands.has("asen-workflow"),false);
 assert.equal(implementedCommands().filter(name=>name==="asen-task-agents").length,1);
 assert.deepEqual([...commands.keys()].sort(),implementedCommands().filter(name=>name!=="asen-authority-status").sort());
 const hub=await commands.get("asen-customize")!.handler("",context("").ctx) as {customize_surfaces:{name:string}[]};
 assert.deepEqual(hub.customize_surfaces.map(row=>row.name),["asen-profiles","asen-persona","asen-mode","asen-history","asen-usage","asen-stats"]);
});

await test("public ODD-only production factory registers without a host SDD command",async t=>{
 const root=await project(),commands=new Map<string,any>(),events=new Map<string,Function[]>();
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,command:unknown){commands.set(name,command);},registerTool(){},getCommands(){return [...commands.keys()].map(name=>({name,source:"extension"}));},getAllTools(){return [];}};
 const ctx={...context(root).ctx,mode:"rpc",hasUI:false};
 t.after(async()=>{for(const listener of events.get("session_shutdown")??[])await listener({},ctx);});
 const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 try{
  createPiExtension({homeDir:()=>root,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as never);
  await events.get("session_start")![0]!({},ctx);
  assert.equal(commands.has("asen-workflow"),false);
  assert.equal(commands.size,36);
  const rows=await commands.get("asen-commands")!.handler("",ctx);
  assert.equal(rows,undefined,"production handlers notify rather than returning internal DTOs");
  for(const name of ["asen-profiles","asen-persona","asen-plan","asen-route","asen-review"])assert.ok(commands.has(name));
 }finally{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;}
});

await test("public ODD-only complex and high-risk work stays organic; flags cannot mint selection",async()=>{
 const repository=await fs.realpath(await project()),candidate={id:"public-odd",repository,revision:"fixture-revision",createdAt:"now"};
 const {facade}=registration(),paths=["a.ts","b.ts","c.ts","d.ts"];
 for(const riskOperations of [[],["security_boundary" as const]])for(const override of [{},{explicitMode:"structured" as const},{requiredArtifacts:["proposal" as const]}]){
  const decision=issueOddDecision({taskId:"public-odd",repository,paths,writes:[{path:"a.ts",changeKind:"behavior"}],riskOperations});
  buildOrchestrationPlan({taskId:"public-odd",repository,prompt:"bounded work",candidate},decision);
  const input:LifecycleApplicabilityInput={taskIdentity:"public-odd",repositoryIdentity:repository,candidate:{id:candidate.id,repository,revision:candidate.revision},explicitMode:"unspecified",affectedSubsystems:["runtime"],expectedPaths:paths,requiredArtifacts:[],...override};
  const result=facade.decideLifecycleApplicability(decision,input);
  assert.equal(result.outcome,Object.keys(override).length?"blocked":"organic");
  if(result.outcome==="blocked")assert.deepEqual(result.reasons,["sdd-selection-required"]);
  assert.equal(tddObligationFor(result).mode,"required");
 }
});

await test("legacy internal handler issues one exact, deeply immutable task/repository choice",async()=>{
 const root=await project();
 const {commands:selectionCommands,consumer}=selectionRegistration();
 const command=selectionCommands.get("asen-workflow")!,observed=context(path.join(root,".","nested",".."));await fs.mkdir(path.join(root,"nested"));
 const choice=await command.handler("sdd GSP-05I1-A",observed.ctx) as WorkflowSelectionChoice,repository=await fs.realpath(root);
 assert.deepEqual(choice,{workflow:"sdd",source:"pi-command",taskIdentity:"GSP-05I1-A",repositoryIdentity:repository});
 assert.ok(Object.isFrozen(choice));assert.equal(read(consumer,"GSP-05I1-A",repository),choice);
 assert.equal(claim(consumer,choice,"GSP-05I1-A",repository),choice);assert.equal(read(consumer,"GSP-05I1-A",repository),undefined);
 assert.deepEqual(observed.notifications,[{message:"SDD workflow selected for task GSP-05I1-A.",level:"info"}]);
});

await test("invalid, ambiguous, extra, control, and noncanonical arguments issue nothing",async()=>{
 const root=await project(),{commands,consumer}=selectionRegistration(),command=commands.get("asen-workflow")!,repository=await fs.realpath(root);
 for(const args of [undefined,"","sdd","sdd ","SDD task","organic task","sdd task extra","sdd\ttask"," sdd task","sdd task ","sdd ../task","sdd .","sdd task/name","sdd tést","sdd task\u0000id",`sdd ${"a".repeat(129)}`]){
  const observed=context(root);assert.equal(await command.handler(args,observed.ctx),"Usage: /asen-workflow sdd <task-id>");
  assert.deepEqual(observed.notifications,[{message:"Usage: /asen-workflow sdd <task-id>",level:"info"}]);
 }
 assert.equal(read(consumer,"task",repository),undefined);
});

await test("pending duplicates fail closed without overwrite, source substitution, or side effects",async()=>{
 const root=await project(),{commands,consumer}=selectionRegistration(),command=commands.get("asen-workflow")!,repository=await fs.realpath(root),first=await select(command,root,"task-1");
 await assert.rejects(select(command,root,"task-1"),/pending/);assert.equal(read(consumer,"task-1",repository),first);
 const other=await select(command,root,"task-2");assert.equal(other.source,"pi-command");
 assert.equal("phase" in other||"write" in other||"review" in other||"delivery" in other||"authority" in other,false);
 assert.deepEqual(Reflect.ownKeys(other),["workflow","source","taskIdentity","repositoryIdentity"]);
});

await test("repository identity requires an existing real path",async()=>{
 const root=await project(),missing=path.join(root,"missing"),{commands,consumer}=selectionRegistration(),command=commands.get("asen-workflow")!;
 await assert.rejects(select(command,missing,"missing-task"));
 assert.equal(read(consumer,"missing-task",path.resolve(missing)),undefined);
});

await test("claims reject clones and burn genuine first mismatch or malformed attempts",async()=>{
 const root=await project(),repository=await fs.realpath(root),{commands,consumer}=selectionRegistration(),command=commands.get("asen-workflow")!;
 const cloned=await select(command,root,"clone");assert.throws(()=>claim(consumer,structuredClone(cloned),"clone",repository),/genuine/);assert.equal(claim(consumer,cloned,"clone",repository),cloned);assert.throws(()=>claim(consumer,cloned,"clone",repository),/genuine|used/);
 const wrongTask=await select(command,root,"wrong-task");assert.throws(()=>claim(consumer,wrongTask,"other",repository),/mismatch/);assert.throws(()=>claim(consumer,wrongTask,"wrong-task",repository),/genuine|used/);
 const wrongRepo=await select(command,root,"wrong-repo");assert.throws(()=>claim(consumer,wrongRepo,"wrong-repo",path.join(repository,"other")),/mismatch/);assert.throws(()=>claim(consumer,wrongRepo,"wrong-repo",repository),/genuine|used/);
 const malformed=await select(command,root,"malformed");assert.throws(()=>claimWorkflowSelection(consumer,malformed,{taskIdentity:"malformed"} as never),/binding/);assert.throws(()=>claim(consumer,malformed,"malformed",repository),/genuine|used/);
});

await test("live extension registrations are independent and do not mint on import, registration, or status",async()=>{
 const root=await project(),repository=await fs.realpath(root),one=selectionRegistration(),two=selectionRegistration();
 assert.equal(read(one.consumer,"same",repository),undefined);assert.equal(read(two.consumer,"same",repository),undefined);
 const choice=await select(one.commands.get("asen-workflow")!,root,"same");assert.throws(()=>claim(two.consumer,choice,"same",repository),/genuine/);assert.equal(claim(one.consumer,choice,"same",repository),choice);
 const independent=await select(two.commands.get("asen-workflow")!,root,"same");assert.equal(claim(two.consumer,independent,"same",repository),independent);
});

await test("opaque consumer intrinsics reject fakes before properties or callbacks and concurrent use stays one-shot",async()=>{
 const root=await project(),repository=await fs.realpath(root),{commands,consumer}=selectionRegistration(),command=commands.get("asen-workflow")!;let invoked=0;
 const fake=Object.defineProperties({}, {read:{get:()=>{invoked++;return ()=>invoked++;}},claim:{get:()=>{invoked++;return ()=>invoked++;}}});
 const binding=Object.defineProperty({},"taskIdentity",{get:()=>{invoked++;return "race";}});
 assert.throws(()=>readWorkflowSelection(fake,binding as never),/consumer/);assert.throws(()=>claimWorkflowSelection({...consumer},fake,binding as never),/consumer/);assert.equal(invoked,0);
 const issued=await Promise.allSettled([select(command,root,"race"),select(command,root,"race")]);assert.deepEqual(issued.map(item=>item.status).sort(),["fulfilled","rejected"]);
 const choice=read(consumer,"race",repository)!;
 const claims=await Promise.allSettled([Promise.resolve().then(()=>claim(consumer,choice,"race",repository)),Promise.resolve().then(()=>claim(consumer,choice,"race",repository))]);
 assert.deepEqual(claims.map(item=>item.status).sort(),["fulfilled","rejected"]);
});
