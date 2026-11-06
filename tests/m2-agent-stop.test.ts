import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {promises as fs} from "node:fs";
import {createAsenExtension} from "../extensions/asen.js";
import {createNativeM2Navigator} from "../src/runtime/native-m2-navigator.js";
import type {AgentRuntime,AgentSessionIdentity} from "../src/agents/agent-runtime.js";
import type {AgentInspection} from "../src/runtime/agent-inspect.js";
import type {PublicAgentRecord,PublicAgentState} from "../src/runtime/agent-lifecycle.js";

const {mkdir,mkdtemp,realpath,rm}=fs;
const at="2026-11-06T08:00:00.000Z",testTimeout=4_000;
const envKeys=["HOME","XDG_CONFIG_HOME","XDG_CACHE_HOME","XDG_DATA_HOME","TMPDIR","PI_CODING_AGENT_DIR"] as const;
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function within<T>(promise:Promise<T>,label:string,ms=1_000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(label+" did not settle")),ms);})]);}
 finally{if(timer)clearTimeout(timer);}
}
const renderUpdates=new Set<()=>void>();
const notifyRender=()=>{for(const changed of renderUpdates)changed();};
async function waitFor(check:()=>boolean,label:string):Promise<void>{
 if(check())return;
 let changed=()=>{};
 try{await within(new Promise<void>((resolve,reject)=>{
  changed=()=>{try{if(check())resolve();}catch(error){reject(error);}};
  renderUpdates.add(changed);changed();
 }),label);}finally{renderUpdates.delete(changed);}
}
const record=(id:string,state:PublicAgentState="running",sessionId="owner-session",projectId=process.cwd()):PublicAgentRecord=>({
 id,role:"explorer",owner:{kind:"user",id:"pi:"+sessionId},sessionId,projectId,state,createdAt:at,updatedAt:at,
});
const inspection=(row:PublicAgentRecord):AgentInspection=>({record:row,history:[{id:row.id,revision:1,state:"queued",at}]});
function controls(){
 let redraws=0,closes=0,current=true;
 return {value:{requestRender(){redraws++;notifyRender();},close(){closes++;},terminalRows(){return 20;},stillCurrent(){return current;}},
  state:()=>({redraws,closes}),drift(){current=false;}};
}

test("M2 Stop uses the immutable full selected ID once, is single-flight, and never fabricates state",{timeout:testTimeout},async()=>{
 const id="agent-"+"0123456789".repeat(30),row=record(id),source={kind:"agents" as const,agents:[inspection(row)]};
 const before=structuredClone(source),gate=deferred<boolean>(),finished=deferred<void>(),calls:Array<{id:string;sessionId:string;projectId:string}>=[];
 let refreshes=0;const ctx=controls();
 const view=createNativeM2Navigator(source,{...ctx.value,stop:async(target:any)=>{calls.push(target);try{return await gate.promise;}finally{finished.resolve();}},refresh:async()=>{refreshes++;return source;}} as any);
 assert.doesNotMatch(view.render(58).join("\n"),new RegExp(id.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")),"display is bounded");
 assert.match(view.render(100).join("\n"),/s: stop/u);
 view.handleInput("s");view.handleInput("s");view.handleInput("r");
 assert.deepEqual(calls,[{id,sessionId:row.sessionId,projectId:row.projectId}]);assert.equal(refreshes,0);assert.match(view.render(100).join("\n"),/Requesting Stop/u);
 gate.resolve(true);await within(finished.promise,"Stop callback");await waitFor(()=>/Stop requested/u.test(view.render(100).join("\n")),"Stop result publication");
 const text=view.render(100).join("\n");assert.doesNotMatch(text,/stopped|completed|Task done/iu);assert.doesNotMatch(text,/s: stop/u);
 assert.deepEqual(source,before);assert.equal(row.state,"running");view.handleInput("s");assert.equal(calls.length,1);
 view.handleInput("r");await waitFor(()=>refreshes===1,"post-Stop refresh");
});

test("M2 withholds Stop for terminal, missing, duplicate, Jobs, native collision, closed and narrow views",{timeout:testTimeout},()=>{
 const calls:any[]=[],attempt=(source:any,keybindings?:any)=>{const ctx=controls(),view=createNativeM2Navigator(source,{...ctx.value,keybindings,stop:async(target:any)=>{calls.push(target);return true;}} as any);return {ctx,view};};
 for(const source of [{kind:"agents",agents:[]},{kind:"agents",agents:[inspection(record("done","completed"))]},
  {kind:"agents",agents:[inspection(record("same")),inspection(record("same"))]},{kind:"jobs",jobs:[]}]){
  const {view}=attempt(source);assert.doesNotMatch(view.render(100).join("\n"),/s: stop/u);view.handleInput("s");
 }
 const native=attempt({kind:"agents",agents:[inspection(record("native"))]},{matches:(data:string,action:string)=>data==="s"&&action==="tui.select.cancel"});
 native.view.handleInput("s");assert.equal(native.ctx.state().closes,1);
 const closed=attempt({kind:"agents",agents:[inspection(record("closed"))]});closed.view.handleInput("q");closed.view.handleInput("s");
 const narrow=attempt({kind:"agents",agents:[inspection(record("narrow"))]});assert.deepEqual(narrow.view.render(5),["Close"]);narrow.view.handleInput("s");
 assert.deepEqual(calls,[]);
});

test("M2 Jobs preserves invalid narrow width and input behavior without Stop dispatch",{timeout:testTimeout},async()=>{
 const refreshed=deferred<void>();let refreshes=0,stops=0;const ctx=controls(),source={kind:"jobs" as const,jobs:[]};
 const view=createNativeM2Navigator(source,{...ctx.value,stop:async()=>{stops++;return true;},refresh:async()=>{refreshes++;refreshed.resolve();return source;}} as any);
 assert.throws(()=>view.render(10),error=>error instanceof Error&&error.message==="Invalid M2 width");
 view.handleInput("s");assert.equal(stops,0);assert.equal(ctx.state().closes,0);
 view.handleInput("r");await within(refreshed.promise,"Jobs refresh after invalid render");assert.equal(refreshes,1);
 assert.match(view.render(12).join("\n"),/JOBS/u);view.handleInput("q");assert.equal(ctx.state().closes,1);
});

test("M2 Stop suppresses stale or closed results and publishes generic failures only",{timeout:testTimeout},async()=>{
 for(const ending of ["close","drift","error"] as const){
  const gate=deferred<boolean>(),finished=deferred<void>(),ctx=controls();let calls=0;
  const view=createNativeM2Navigator({kind:"agents",agents:[inspection(record(ending))]},{...ctx.value,stop:async()=>{calls++;try{return await gate.promise;}finally{finished.resolve();}}} as any);
  view.handleInput("s");assert.equal(calls,1);if(ending==="close")view.handleInput("q");if(ending==="drift")ctx.drift();const redraws=ctx.state().redraws;
  if(ending==="error")gate.reject(Error("PRIVATE_RUNTIME_SECRET"));else gate.resolve(true);
  await within(finished.promise,"late Stop callback");
  if(ending==="error")await waitFor(()=>/Stop unavailable/u.test(view.render(100).join("\n")),"generic Stop error");
  assert.doesNotMatch(view.render(100).join("\n"),/PRIVATE_RUNTIME_SECRET/u);if(ending!=="error")assert.equal(ctx.state().redraws,redraws);
 }
});

type Command={handler:(args:string|undefined,context:any)=>unknown};
type ExtensionFixture=Awaited<ReturnType<typeof extensionFixture>>;
async function extensionFixture(options:{records:PublicAgentRecord[];query?:(id:string,identity:AgentSessionIdentity)=>Promise<any>;cancel?:(id:string,identity:AgentSessionIdentity)=>Promise<boolean>;withRuntime?:boolean}){
 const projectId=await realpath(process.cwd()),base=path.join(projectId,".cache","r12-stop-fixture");await mkdir(base,{recursive:true});
 const root=await mkdtemp(path.join(base,"case-")),dirs={home:path.join(root,"home"),config:path.join(root,"config"),cache:path.join(root,"cache"),data:path.join(root,"data"),tmp:path.join(root,"tmp"),pi:path.join(root,"pi")};
 await Promise.all(Object.values(dirs).map(directory=>mkdir(directory,{recursive:true})));
 const prior=new Map(envKeys.map(key=>[key,process.env[key]]));process.env.HOME=dirs.home;process.env.XDG_CONFIG_HOME=dirs.config;process.env.XDG_CACHE_HOME=dirs.cache;process.env.XDG_DATA_HOME=dirs.data;process.env.TMPDIR=dirs.tmp;process.env.PI_CODING_AGENT_DIR=dirs.pi;
 const restoreEnvironment=()=>{for(const key of envKeys){const value=prior.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}};
 let sessionId="owner-session",disposed=false,activeClose:(()=>void)|undefined;const commands=new Map<string,Command>(),dispatches:Array<{id:string;identity:AgentSessionIdentity}>=[];
 const owns=(row:PublicAgentRecord,identity:AgentSessionIdentity)=>row.sessionId===identity.sessionId&&row.projectId===identity.projectId;
 const runtime={list:async(identity:AgentSessionIdentity)=>options.records.filter(row=>owns(row,identity)),query:options.query??(async(id:string,identity:AgentSessionIdentity)=>{const found=options.records.find(row=>row.id===id&&owns(row,identity));return found?{record:found,history:[]}:null;}),cancel:options.cancel??(async(id:string,identity:AgentSessionIdentity)=>{dispatches.push({id,identity});return true;})} as unknown as AgentRuntime;
 const pi={registerCommand:(name:string,command:Command)=>commands.set(name,command)};
 try{createAsenExtension({homeDir:()=>dirs.home,enableAgentRuntime:false,...(options.withRuntime===false?{}:{agentRuntimeFactory:async()=>runtime}),...(options.withRuntime===false?{agents:()=>options.records}:{})})(pi);}
 catch(error){restoreEnvironment();await rm(root,{recursive:true,force:false});throw error;}
 const context:any={cwd:projectId,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>sessionId},ui:{notify(){},custom:undefined}};
 const open=async(run:(view:ReturnType<typeof createNativeM2Navigator>)=>Promise<void>|void)=>{
  context.ui.custom=async(factory:any)=>{let closed=false;const view=factory({terminal:{rows:24},requestRender(){notifyRender();}},undefined,undefined,()=>{closed=true;});activeClose=()=>{if(!closed)view.handleInput("q");};try{await run(view);}finally{activeClose();activeClose=undefined;}};
  return within(Promise.resolve(commands.get("asen-agent-inspect")!.handler("",context)),"agent navigator command",1_500);
 };
 const dispose=async()=>{if(disposed)return;disposed=true;activeClose?.();sessionId="disposed-session";context.hasUI=false;delete context.ui.custom;restoreEnvironment();await rm(root,{recursive:true,force:false});};
 return {projectId,commands,context,dispatches,open,dispose,drift(){sessionId="changed-session";}};
}
async function withFixture<T>(fixture:ExtensionFixture,run:(fixture:ExtensionFixture)=>Promise<T>):Promise<T>{try{return await run(fixture);}finally{await fixture.dispose();}}

test("registered native Agents view revalidates current ownership and dispatches exact scope through AgentRuntime.cancel",{timeout:testTimeout},async()=>{
 const projectId=await realpath(process.cwd()),id="owned-"+"x".repeat(240),row=record(id,"running","owner-session",projectId);
 await withFixture(await extensionFixture({records:[row]}),async f=>{await f.open(async view=>{assert.match(view.render(90).join("\n"),/s: stop/u);view.handleInput("s");await waitFor(()=>f.dispatches.length===1,"runtime cancellation");assert.match(view.render(90).join("\n"),/Stop requested/u);});assert.deepEqual(f.dispatches,[{id,identity:{sessionId:"owner-session",projectId,worktree:projectId}}]);});
});

test("registered Stop denies stale, foreign, duplicate, terminal, closed-source and context-drift targets with zero dispatch",{timeout:testTimeout},async()=>{
 const projectId=await realpath(process.cwd());
 for(const mode of ["stale","foreign","duplicate","terminal","drift"] as const){
  const active=record("target","running","owner-session",projectId),records=mode==="duplicate"?[active,{...active}]:[mode==="terminal"?{...active,state:"completed" as const}:active];
  await withFixture(await extensionFixture({records,query:async(_id,_identity)=>mode==="stale"?null:mode==="foreign"?{record:{...active,sessionId:"other"},history:[]}:{record:records[0],history:[]}}),async f=>{await f.open(async view=>{if(mode==="drift")f.drift();view.handleInput("s");if(mode==="stale"||mode==="foreign")await waitFor(()=>/Stop unavailable/u.test(view.render(100).join("\n")),mode+" denial");});assert.deepEqual(f.dispatches,[],mode);});
 }
 const lookup=deferred<any>(),lookupStarted=deferred<void>(),lookupFinished=deferred<void>();let queries=0;
 await withFixture(await extensionFixture({records:[record("async-drift","running","owner-session",projectId)],query:async(_id,_identity)=>{if(++queries===1)return {record:record("async-drift","running","owner-session",projectId),history:[]};lookupStarted.resolve();try{return await lookup.promise;}finally{lookupFinished.resolve();}}}),async f=>{await f.open(async view=>{view.handleInput("s");await within(lookupStarted.promise,"Stop lookup start");f.drift();lookup.resolve({record:record("async-drift","running","owner-session",projectId),history:[]});await within(lookupFinished.promise,"Stop lookup finish");});assert.deepEqual(f.dispatches,[]);});
 await withFixture(await extensionFixture({records:[record("no-backend","running","owner-session",projectId)],withRuntime:false}),async f=>{await f.open(view=>{assert.doesNotMatch(view.render(100).join("\n"),/s: stop/u);view.handleInput("s");});assert.deepEqual(f.dispatches,[]);});
});

test("headless public inspection remains read-only and never gains Stop execution",{timeout:testTimeout},async()=>{
 const projectId=await realpath(process.cwd()),row=record("headless","running","owner-session",projectId);
 await withFixture(await extensionFixture({records:[row]}),async f=>{f.context.mode="json";f.context.hasUI=false;delete f.context.ui.custom;const result=await within(Promise.resolve(f.commands.get("asen-agent-inspect")!.handler(row.id,f.context)),"headless inspection");assert.ok(Array.isArray(result));assert.deepEqual(f.dispatches,[]);assert.doesNotMatch((result as string[]).join("\n"),/Stop requested/u);});
});
