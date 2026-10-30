import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/profile-store.js";
import {ASEN_PROFILES_SCHEMA,type RuntimeProfilesFile} from "../src/runtime/profiles.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";

async function selectionFixture(t:TestContext){
 const home=await mkdtemp(path.join(tmpdir(),"asen-profile-selection-")),file=path.join(home,".asen","profiles.json"),project=await realpath(process.cwd());
 const commands=new Map<string,any>(),tools=new Map<string,any>(),events=new Map<string,Function[]>();
 const requests:AgentRequest[]=[],waiting=new Map<string,(request:AgentRequest)=>void>();
 const contexts:Array<ReturnType<typeof context>>=[];
 function context(sessionId:string):{cwd:string;hasUI:boolean;sessionManager:{getSessionId:()=>string};ui:{notify:()=>void}}{const ctx={cwd:project,hasUI:true,sessionManager:{getSessionId:()=>sessionId},ui:{notify:()=>{}}};contexts.push(ctx);return ctx;}
 const data={schema:ASEN_PROFILES_SCHEMA,active:"main",profiles:([
  ["main","profile/inherited","high"],["selected","profile/selected","low"],["default","profile/named-default","medium"],
 ] as const).map(([name,model,thinking])=>({name,routes:Object.fromEntries(["explorer","worker","reviewer","verifier"].map(role=>[role,{model,thinking}]))}))};
 await writeProfilesFile(file,data);
 const pi={registerCommand:(name:string,command:any)=>commands.set(name,command),registerTool:(tool:any)=>tools.set(tool.name,tool),on:(name:string,handler:Function)=>events.set(name,[...(events.get(name)??[]),handler]),getCommands:()=>[],getAllTools:()=>[]};
 createAsenExtension({homeDir:()=>home,profilesFile:file,enableAgentRuntime:true,enableTodoRuntime:false,enableMemoryRuntime:false,autoAdvancePlans:false,agentStoreFile:path.join(home,".asen","agents.json"),agentRunner:{run:async request=>{requests.push(request);waiting.get(request.id)?.(request);return{id:request.id,ok:true,output:"inert selection result"};}}})(pi as any);
 t.after(async()=>{try{for(const ctx of contexts)for(const shutdown of events.get("session_shutdown")??[])await shutdown({},ctx);}finally{await rm(home,{recursive:true,force:true});}});
 const start=async(ctx:ReturnType<typeof context>)=>{for(const handler of events.get("session_start")??[])await handler({},ctx);};
 const command=(args:string,ctx:ReturnType<typeof context>)=>commands.get("asen-profiles").handler(args,ctx);
 const dispatch=async(ctx:ReturnType<typeof context>)=>{
  const started=await tools.get("asen_agent_start").execute("selection-route",{prompt:"Inspect the selected profile route"},new AbortController().signal,()=>{},ctx),id=started.details.id;
  const request=requests.find(item=>item.id===id)??await new Promise<AgentRequest>(resolve=>waiting.set(id,resolve));
  assert.equal(request.isolationKey,ctx.sessionManager.getSessionId());assert.equal(request.repository,project);
  const status=await tools.get("asen_agent_status").execute("selection-owner",{id},new AbortController().signal,()=>{},ctx);
  assert.equal(status.details.task.record.id,id);assert.equal(status.details.task.record.sessionId,request.isolationKey);assert.equal(status.details.task.record.projectId,project);
  for(const key of ["candidate","writeSurfaces","writerAdmission","phaseGrant","runnerWriteReceiver"])assert.equal(Object.hasOwn(request,key),false);
  return request;
 };
 const plan=(facts:unknown,ctx:ReturnType<typeof context>)=>commands.get("asen-plan").handler(JSON.stringify(facts),ctx);
 return {file,data,requests,context,start,command,dispatch,plan};
}

test("profile command selects a copied session route without changing global data",async t=>{
 const f=await selectionFixture(t),a=f.context("selection-a");await f.start(a);const original=await readFile(f.file,"utf8");
 const selected=await f.command("session selected",a);
 assert.equal(selected.sessionProfile.active,"selected");assert.equal(selected.sessionProfile.source,"explicit-session");assert.equal(selected.active,"main");
 assert.equal(selected.sessionProfile.roles.explorer.actual,"unknown");assert.equal(await readFile(f.file,"utf8"),original);
 const facts={taskIdentity:"selection-plan",instruction:"Implement the bounded four-file change",intent:"implementation",scope:{kind:"known",expectedPaths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"]},writes:[{path:"src/a.ts",changeKind:"behavior"}],riskOperations:[],session:{estimatedMinutes:20,continuation:false},testing:{kind:"required"},review:{kind:"dual_explicit",estimatedMinutes:5},unresolvedDecisions:[]};
 const planned=JSON.parse(await f.plan(facts,a));assert.ok(planned.executablePlan.tasks.length);
 for(const task of planned.executablePlan.tasks){assert.equal(task.model,"profile/selected");assert.equal(task.thinking,"low");}
 assert.deepEqual(planned.execution,{started:false,authorized:false});assert.equal(planned.persistence.status,"unavailable");assert.equal(f.requests.length,0);
 const first=await f.dispatch(a);assert.equal(first.model,"profile/selected");assert.equal(first.thinking,"low");
 const edited:RuntimeProfilesFile=structuredClone(f.data);edited.profiles[1]!.routes.explorer!.model="changed-definition";await writeProfilesFile(f.file,edited);
 assert.equal((await f.dispatch(a)).model,"profile/selected","a selected profile must be copied, not re-read");assert.equal(f.requests.length,2);
});

test("profile command inherit reveals the original snapshot and preserves the name default",async t=>{
 const f=await selectionFixture(t),a=f.context("inherit-a");await f.start(a);
 const named=await f.command("session default",a);assert.equal(named.sessionProfile.active,"default");assert.equal(named.sessionProfile.source,"explicit-session");
 assert.equal((await f.dispatch(a)).model,"profile/named-default");await f.command("global selected",a);
 const inherited=await f.command("session --inherit",a);assert.equal(inherited.active,"selected");assert.equal(inherited.sessionProfile.active,"main");assert.equal(inherited.sessionProfile.source,"inherited-global");
 assert.equal((await f.dispatch(a)).model,"profile/inherited");assert.equal(f.requests.length,2);
});

test("profile command global selection affects only future captures",async t=>{
 const f=await selectionFixture(t),a=f.context("global-a"),b=f.context("global-b");await f.start(a);
 const applied=await f.command("global selected",a);assert.equal(applied.active,"selected");assert.equal(applied.sessionProfile.active,"main");
 assert.equal(JSON.parse(await readFile(f.file,"utf8")).active,"selected");await f.start(b);
 assert.equal((await f.dispatch(a)).model,"profile/inherited");assert.equal((await f.dispatch(b)).model,"profile/selected");
 const shown=await f.command("show",b);assert.equal(shown.sessionProfile.active,"selected");assert.equal(shown.sessionProfile.source,"inherited-global");assert.equal(f.requests.length,2);
});

test("profile command rejects invalid selections without file binding or queue effects",async t=>{
 const f=await selectionFixture(t),a=f.context("invalid-selection");await f.start(a);const original=await readFile(f.file,"utf8");
 assert.equal(await f.command("session",a),"Usage: /asen-profiles [show | session <profile> | session --inherit | global <profile>]");
 await assert.rejects(()=>f.command("session absent",a),/Profile does not exist/u);await assert.rejects(()=>f.command("global absent",a),/Profile does not exist/u);
 assert.equal(await readFile(f.file,"utf8"),original);assert.equal(f.requests.length,0);assert.equal((await f.command("",a)).sessionProfile.active,"main");
 await writeFile(f.file,"{ malformed");await assert.rejects(()=>f.command("session selected",a),/Invalid profiles file/u);
 assert.equal(await readFile(f.file,"utf8"),"{ malformed");assert.equal(f.requests.length,0);
 assert.equal((await f.dispatch(a)).model,"profile/inherited","rejected selection must leave captured routing intact");
 await writeFile(f.file,original);assert.equal((await f.command("show",a)).sessionProfile.active,"main");assert.equal(f.requests.length,1);
});
