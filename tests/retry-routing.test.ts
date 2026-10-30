import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createAsenExtension} from "../extensions/asen.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {writeProfilesFile} from "../src/runtime/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";
import {selectSkills} from "../src/skills/registry.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
const cases:Array<{name:string;planned:boolean;global:boolean;model?:string;thinking?:AgentRequest["thinking"]}>=[
 {name:"planned explicit route",planned:true,global:true,model:"accepted/model",thinking:"medium"},
 {name:"planned provider defaults",planned:true,global:true},
 {name:"planned model only",planned:true,global:true,model:"accepted/model"},
 {name:"planned thinking only",planned:true,global:true,thinking:"low"},
 {name:"legacy resolved route",planned:false,global:true,model:"global/original",thinking:"high"},
 {name:"legacy provider defaults",planned:false,global:false},
];
const profiles=()=>({schema:ASEN_PROFILES_SCHEMA,active:"original",profiles:[{name:"original",routes:{explorer:{model:"global/original",thinking:"high" as const}}},{name:"selected",routes:{explorer:{model:"global/later",thinking:"low" as const}}}]});
for(const scenario of cases)test(`retry routing retains ${scenario.name} after profile selection`,async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-retry-route-")),projectId=await realpath(process.cwd()),sessionId=`retry-${scenario.name.replaceAll(" ","-")}`,identity={sessionId,projectId};
 const profilesFile=join(home,".asen","profiles.json"),todos=await SessionTodoStore.open(join(home,".asen","todos.json"));
 const events=new Map<string,Function[]>(),commands=new Map<string,any>(),tools=new Map<string,any>(),requests:AgentRequest[]=[];
 const blocked=deferred(),retryEntered=deferred(),finishRetry=deferred();let confirmations=0,confirmationText="";
 const ctx={mode:"rpc",hasUI:true,cwd:projectId,sessionManager:{getSessionId:()=>sessionId},ui:{notify(){},confirm:async(_title:string,message:string)=>{confirmations++;confirmationText=message;return true;},setWidget:(_key:string,rows:string[]|undefined)=>{if(rows?.some(row=>row.startsWith("Pausado · ")))blocked.resolve();}}};
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(tool:any){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
 t.after(async()=>{finishRetry.resolve();for(const shutdown of events.get("session_shutdown")??[])await shutdown({},ctx);await rm(home,{recursive:true,force:true});});
 const selection={phase:"explore" as const},instruction="Inspect the exact saved retry route without writing";
 const plan=scenario.planned?{role:"explorer" as const,skillSelection:selection,skillPaths:selectSkills(selection).map(skill=>skill.path),...(scenario.model!==undefined?{model:scenario.model}:{}),...(scenario.thinking!==undefined?{thinking:scenario.thinking}:{})}:undefined;
 const todo=await todos.add("Keep the accepted retry route",identity,undefined,undefined,scenario.planned?"asen-plan:retry-route:explorer":undefined,[],instruction,plan);
 if(scenario.global)await writeProfilesFile(profilesFile,profiles());
 createAsenExtension({homeDir:()=>home,profilesFile,enableAgentRuntime:true,enableTodoRuntime:true,enableMemoryRuntime:false,autoAdvancePlans:false,todoStoreFactory:async()=>todos,agentStoreFile:join(home,".asen","agents.json"),agentRunner:{run:async request=>{requests.push(request);if(requests.length===1)return{id:request.id,ok:false,output:"original read-only failure"};retryEntered.resolve();await finishRetry.promise;return{id:request.id,ok:false,output:"bounded retry failure"};}}})(pi as any);
 for(const start of events.get("session_start")??[])await start({},ctx);
 const execute=(name:string,params:unknown,context:any=ctx)=>tools.get(name).execute(name,params,new AbortController().signal,()=>{},context);
 const first=await execute("asen_agent_start",{prompt:instruction,todoId:todo.taskId});await blocked.promise;
 assert.equal(requests.length,1);assert.equal(requests[0]!.id,first.details.id);assert.equal(requests[0]!.model,scenario.model);assert.equal(requests[0]!.thinking,scenario.thinking);
 const beforeStatus=(await execute("asen_agent_status",{id:first.details.id})).details,beforeTasks=await commands.get("asen-task-agents").handler("",ctx);
 assert.equal(beforeStatus.task.record.state,"failed");assert.equal(beforeTasks[0].taskId,todo.taskId);assert.equal(beforeTasks[0].state,"blocked");assert.equal(beforeTasks[0].revision,3);
 await assert.rejects(execute("asen_agent_retry",{id:first.details.id},{...ctx,hasUI:false}),{message:"Explicit Pi UI confirmation is required to retry a failed task"});
 assert.deepEqual((await execute("asen_agent_status",{id:first.details.id})).details,beforeStatus);assert.deepEqual(await commands.get("asen-task-agents").handler("",ctx),beforeTasks);assert.equal(requests.length,1);assert.equal(confirmations,0);
 await writeProfilesFile(profilesFile,profiles());await commands.get("asen-profiles").handler("session selected",ctx);
 const retried=await execute("asen_agent_retry",{id:first.details.id});await retryEntered.promise;
 assert.equal(retried.details.retriedFrom,first.details.id);assert.equal(retried.details.todoId,todo.taskId);assert.equal(confirmations,1);assert.ok(confirmationText.includes(instruction));assert.equal(requests.length,2);
 const request=requests[1]!;assert.equal(request.id,retried.details.id);assert.equal(request.prompt,instruction);assert.equal(request.repository,projectId);assert.equal(request.isolationKey,sessionId);assert.equal(request.role,"explorer");
 const rows=await commands.get("asen-task-agents").handler("",ctx);assert.equal(rows.length,1);assert.equal(rows[0].taskId,todo.taskId);assert.equal(rows[0].state,"running");assert.equal(rows[0].revision,4);assert.equal(rows[0].agents.length,2);
 const status=(await execute("asen_agent_status",{id:request.id})).details;assert.equal(status.task.record.id,request.id);assert.equal(status.task.record.sessionId,sessionId);assert.equal(status.task.record.projectId,projectId);assert.equal(Object.hasOwn(status.task,"request"),false);assert.equal(JSON.stringify(status).includes(instruction),false);
 for(const key of ["candidate","writeSurfaces","writerAdmission","phaseGrant","runnerWriteReceiver"])assert.equal(Object.hasOwn(request,key),false);
 assert.equal(request.model,scenario.model,"retry must retain its failed request model");assert.equal(request.thinking,scenario.thinking,"retry must retain its failed request thinking");assert.equal(Object.hasOwn(request,"model"),scenario.model!==undefined);assert.equal(Object.hasOwn(request,"thinking"),scenario.thinking!==undefined);
});
