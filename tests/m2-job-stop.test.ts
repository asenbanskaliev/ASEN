import assert from "node:assert/strict";
import test from "node:test";
import {promises as fs} from "node:fs";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {createNativeM2Navigator} from "../src/runtime/native-m2-navigator.js";
import {projectJobMetadata} from "../src/runtime/job-inspect.js";
import type {BackgroundJobSnapshot} from "../src/runtime/background-jobs.js";

const {mkdir,mkdtemp,realpath}=fs;
const at="2026-11-07T08:00:00.000Z";
const row=(extra:Partial<BackgroundJobSnapshot>={}):BackgroundJobSnapshot=>({id:"job-1",sessionId:"session",projectId:"project",command:"bounded command",mode:"background",state:"running",createdAt:at,updatedAt:at,exitCode:null,eventCount:0,tail:[],...extra});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};};
async function within<T>(promise:Promise<T>,label:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<T>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error(label+" did not settle")),1_000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function controls(){let current=true,closes=0;return {value:{requestRender(){},close(){closes++;},terminalRows(){return 20;},stillCurrent(){return current;}},drift(){current=false;},closes:()=>closes};}

async function waitFor(check:()=>boolean):Promise<void>{for(let turn=0;turn<50;turn++){if(check())return;await tick();}throw Error("condition not observed");}

test("Jobs Stop passes the exact frozen metadata object once and reports only a request",async()=>{
 const metadata=projectJobMetadata(row({id:"job-"+"x".repeat(240)})),gate=deferred<boolean>(),calls:unknown[]=[];
 const ctx=controls(),view=createNativeM2Navigator({kind:"jobs",jobs:[metadata]},{...ctx.value,stopJob:async selected=>{calls.push(selected);return gate.promise;},refresh:async()=>({kind:"jobs",jobs:[metadata]})});
 assert.match(view.render(90).join("\n"),/s: stop/u);view.handleInput("s");view.handleInput("s");view.handleInput("r");
 assert.deepEqual(calls,[metadata]);assert.equal(calls[0],metadata);assert.match(view.render(90).join("\n"),/Requesting Stop/u);
 gate.resolve(true);await waitFor(()=>/Stop requested/u.test(view.render(90).join("\n")));
 const text=view.render(90).join("\n");assert.doesNotMatch(text,/process stopped|exit 0|completed|s: stop/iu);
});

test("Jobs Stop is withheld for unsafe rows, native collisions, stale scope, closed and narrow views",()=>{
 const calls:unknown[]=[];
 const attempt=(jobs:ReturnType<typeof projectJobMetadata>[],keybindings?:{matches:(data:string,action:string)=>boolean})=>{const ctx=controls(),view=createNativeM2Navigator({kind:"jobs",jobs},{...ctx.value,...(keybindings?{keybindings}:{}),stopJob:async selected=>{calls.push(selected);return true;}});return {ctx,view};};
 const active=projectJobMetadata(row()),duplicate=projectJobMetadata(row({command:"other"}));
 for(const jobs of [[],[projectJobMetadata(row({state:"completed"}))],[projectJobMetadata({...row(),recoveredAt:at} as BackgroundJobSnapshot)],[active,duplicate]]){
  const {view}=attempt(jobs);assert.doesNotMatch(view.render(90).join("\n"),/s: stop/u);view.handleInput("s");
 }
 const native=attempt([active],{matches:(data,action)=>data==="s"&&action==="tui.select.cancel"});native.view.handleInput("s");assert.equal(native.ctx.closes(),1);
 const stale=attempt([active]);stale.ctx.drift();stale.view.handleInput("s");
 const closed=attempt([active]);closed.view.handleInput("q");closed.view.handleInput("s");
 const narrow=attempt([active]);assert.throws(()=>narrow.view.render(10),/Invalid M2 width/u);narrow.view.handleInput("s");
 assert.deepEqual(calls,[]);
});

test("Jobs Stop failures are generic and late closed results are not published",async()=>{
 for(const ending of ["error","close"] as const){
  const gate=deferred<boolean>(),ctx=controls();let calls=0;
  const view=createNativeM2Navigator({kind:"jobs",jobs:[projectJobMetadata(row({id:ending}))]},{...ctx.value,stopJob:async()=>{calls++;if(ending==="error")throw Error("PRIVATE_JOB_SECRET");return gate.promise;}});
  view.handleInput("s");assert.equal(calls,1);if(ending==="close"){view.handleInput("q");gate.resolve(true);}await tick();
  if(ending==="error")await waitFor(()=>/Stop unavailable/u.test(view.render(90).join("\n")));
  assert.doesNotMatch(view.render(90).join("\n"),/PRIVATE_JOB_SECRET/u);
 }
});

for(const driftAfterStop of [false,true])test(driftAfterStop?"registered Jobs scope drift does not deny an already accepted Stop":"registered native Jobs Stop cancels only the owned live job created by the public background tool",{timeout:10_000},async()=>{
 const base=await realpath(process.cwd()),scratch=path.join(base,".cache","r13-job-stop");await mkdir(scratch,{recursive:true});
 const root=await mkdtemp(path.join(scratch,"case-")),dirs={home:path.join(root,"home"),config:path.join(root,"config"),cache:path.join(root,"cache"),data:path.join(root,"data"),tmp:path.join(root,"tmp"),pi:path.join(root,"pi"),project:path.join(root,"project")};
 await Promise.all(Object.values(dirs).map(directory=>mkdir(directory,{recursive:true,mode:0o700})));
 const keys=["HOME","XDG_CONFIG_HOME","XDG_CACHE_HOME","XDG_DATA_HOME","TMPDIR","PI_CODING_AGENT_DIR"] as const,prior=new Map(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{HOME:dirs.home,XDG_CONFIG_HOME:dirs.config,XDG_CACHE_HOME:dirs.cache,XDG_DATA_HOME:dirs.data,TMPDIR:dirs.tmp,PI_CODING_AGENT_DIR:dirs.pi});
 const commands=new Map<string,any>(),tools=new Map<string,any>(),aborted=deferred<void>(),stopRenderRequested=deferred<void>();let aborts=0,session="owner-session",viewError:unknown;
 const executor=async(_command:string,_cwd:string,options:{signal:AbortSignal})=>new Promise<{exitCode:null}>(resolve=>{options.signal.addEventListener("abort",()=>{aborts++;aborted.resolve();resolve({exitCode:null});},{once:true});});
 const pi={registerCommand:(name:string,command:any)=>commands.set(name,command),registerTool:(tool:any)=>tools.set(tool.name,tool)};
 const context:any={cwd:dirs.project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>session},ui:{notify(){}}};
 try{
  createAsenExtension({homeDir:()=>dirs.home,packageRoot:root,backgroundJobJournalFile:path.join(dirs.data,"jobs.json"),backgroundExecutor:executor,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi);
  const started=await tools.get("asen_background_start").execute("start",{command:"bounded fake command"},new AbortController().signal,()=>{},context),id=started.details.id as string;
  context.ui.custom=async(factory:any)=>{
   const view=factory({terminal:{rows:24},requestRender(){if(aborts===1)stopRenderRequested.resolve();}},undefined,undefined,()=>{});
   try{
    assert.match(view.render(90).join("\n"),/s: stop/u);view.handleInput("s");
    await within(aborted.promise,"executor abort");await within(stopRenderRequested.promise,"Stop render request");
    assert.match(view.render(90).join("\n"),/Stop requested/u);if(driftAfterStop)session="changed-session";
   }catch(error){viewError=error;}finally{view.handleInput("q");}
  };
  const closed=await commands.get("asen-job-inspect").handler("",context);
  if(viewError)throw viewError; // The production command catches custom-UI errors; keep test failures observable outside it.
  if(driftAfterStop){assert.match(closed.join("\n"),/scope changed/u);assert.doesNotMatch(closed.join("\n"),/no action performed/iu);assert.match(closed.join("\n"),/No further actions are available/u);}
  const ownerContext={...context,mode:"json",hasUI:false,sessionManager:{getSessionId:()=>"owner-session"}};
  const status=await tools.get("asen_background_status").execute("status",{},new AbortController().signal,()=>{},ownerContext);
  assert.equal(status.details.find((job:any)=>job.id===id)?.state,"stopped");assert.equal(aborts,1);
  session="owner-session";context.mode="json";context.hasUI=false;delete context.ui.custom;await commands.get("asen-job-inspect").handler(id,context);assert.equal(aborts,1,"headless metadata inspection cannot cancel");
 }finally{
  session="closed-session";for(const key of keys){const value=prior.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
