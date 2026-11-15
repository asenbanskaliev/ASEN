import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRunner,AgentRequest} from "../src/agents/dispatcher.js";
import type {PiChildSelectionObservation} from "../src/agents/pi-process-runner.js";
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
type Subscription={active:boolean;listener:(value:PiChildSelectionObservation)=>void};
function observableRunner(){
 const subscriptions:Subscription[]=[],launches:Array<{request:AgentRequest;subscriptions:Subscription[]}>=[],arrivals=new Map<number,ReturnType<typeof deferred<void>>>();
 const runner={subscribeChildSelection(listener:Subscription["listener"]){const entry={active:true,listener};subscriptions.push(entry);return()=>{entry.active=false;};},run(request:AgentRequest,signal?:AbortSignal){launches.push({request,subscriptions:subscriptions.filter(entry=>entry.active)});arrivals.get(launches.length-1)?.resolve();return new Promise<{id:string;ok:boolean;output:string}>(resolve=>{const end=()=>resolve({id:request.id,ok:false,output:"cancelled"});if(signal?.aborted)end();else signal?.addEventListener("abort",end,{once:true});});}} satisfies AgentRunner&{subscribeChildSelection(listener:Subscription["listener"]):()=>void};
 return{runner,subscriptions,launches,async at(index:number){if(!launches[index]){const arrival=deferred<void>();arrivals.set(index,arrival);await arrival.promise;}return launches[index]!;},async emit(index:number,overrides:Partial<PiChildSelectionObservation>={}){const launch=launches[index]!;const value:PiChildSelectionObservation={taskId:launch.request.id,sessionId:launch.request.isolationKey??"default",projectId:await realpath(launch.request.repository),source:"child-reported",model:{provider:"reported",id:"selected"},thinking:"low",...overrides};for(const entry of launch.subscriptions)if(entry.active)await entry.listener(value);}};
}
async function fixture(t:TestContext,mode:"composed"|"factory"|"plain"="composed"){
 const home=await mkdtemp(join(tmpdir(),"asen-selection-ui-")),root=await realpath(process.cwd()),other=join(home,"project-b");await mkdir(other);
 const events=new Map<string,Function[]>(),tools=new Map<string,any>(),notices:string[]=[],capture=observableRunner(),unrelated=observableRunner();
 const pi={on(name:string,handler:Function){events.set(name,[...(events.get(name)??[]),handler]);},registerCommand(){},registerTool(tool:any){tools.set(tool.name,tool);},getCommands(){return[];},getAllTools(){return[];}};
 const contexts:any[]=[],context=(session="selection-a",cwd=root)=>{const ctx={mode:"rpc",hasUI:true,cwd,sessionManager:{getSessionId:()=>session},ui:{notify:(message:string)=>{notices.push(message);},confirm:async()=>true}};contexts.push(ctx);return ctx;};
 const plain:AgentRunner={run:capture.runner.run.bind(capture.runner)},runtime=mode==="factory"?await AgentRuntime.open({storeFile:join(home,"factory-agents.json"),runner:capture.runner}):undefined;
 createAsenExtension({homeDir:()=>home,enableAgentRuntime:true,agentStoreFile:join(home,"agents.json"),agentRunner:mode==="factory"?unrelated.runner:mode==="plain"?plain:capture.runner,...(runtime?{agentRuntimeFactory:async()=>runtime}:{}),autoAdvancePlans:false})(pi as any);
 const start=async(ctx:any)=>{for(const callback of events.get("session_start")??[])await callback({},ctx);},shutdown=async(ctx:any)=>{for(const callback of events.get("session_shutdown")??[])await callback({},ctx);};
 t.after(async()=>{try{for(const ctx of [...contexts].reverse())await shutdown(ctx);}finally{await rm(home,{recursive:true,force:true});}});
 const launch=async(ctx:any)=>{const index=capture.launches.length,result=await tools.get("asen_agent_start").execute("selection-launch",{prompt:"Inspect only"},new AbortController().signal,()=>{},ctx);await capture.at(index);return{index,id:result.details.id};};
 const status=async(ctx:any,id:string)=>(await tools.get("asen_agent_status").execute("selection-status",{id},new AbortController().signal,()=>{},ctx)).details;
 return{home,root,other:await realpath(other),context,start,shutdown,launch,status,capture,unrelated,notices,selectionNotices:()=>notices.filter(message=>message.includes("child-reported selection"))};
}

test("owned child selection is an ephemeral notice, not routing or task authority",async t=>{
 const f=await fixture(t),ctx=f.context();await f.start(ctx);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);
 const task=await f.launch(ctx),before=await f.status(ctx,task.id);await f.capture.emit(task.index);
 assert.deepEqual(f.selectionNotices(),[`ASEN child-reported selection (${task.id}): model reported/selected; thinking low.`]);assert.deepEqual(await f.status(ctx,task.id),before);
 assert.equal(JSON.stringify(before).includes("selected"),false);
});

test("foreign owners and unknown tasks produce no selection notice or stored change",async t=>{
 const f=await fixture(t),ctx=f.context();await f.start(ctx);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);const task=await f.launch(ctx),before=await f.status(ctx,task.id);
 for(const override of [{sessionId:"foreign-session"},{projectId:f.other},{taskId:"agent-unknown"}])await f.capture.emit(task.index,override);
 assert.deepEqual(f.selectionNotices(),[]);assert.deepEqual(await f.status(ctx,task.id),before);assert.equal(f.capture.launches.length,1);
});

test("explicit null child model stays unavailable without inferred usage or provider",async t=>{
 const f=await fixture(t),ctx=f.context();await f.start(ctx);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);const task=await f.launch(ctx);await f.capture.emit(task.index,{model:null,thinking:undefined});
 assert.deepEqual(f.selectionNotices(),[`ASEN child-reported selection (${task.id}): model unavailable; thinking unavailable.`]);
});

test("startup immediately invalidates old launches across duplicate session and project replacement",async t=>{
 const f=await fixture(t),first=f.context();await f.start(first);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);const old=await f.launch(first);
 for(const next of [f.context(),f.context("selection-b"),f.context("selection-b",f.other)]){
  const startup=f.start(next);await f.capture.emit(old.index);await startup;assert.deepEqual(f.selectionNotices(),[]);
  assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);
 }
 const latest=f.context("selection-c");await f.start(latest);const task=await f.launch(latest);await f.capture.emit(task.index);assert.deepEqual(f.selectionNotices(),[`ASEN child-reported selection (${task.id}): model reported/selected; thinking low.`]);
});

for(const boundary of ["replacement","shutdown"] as const)test(`selection paused in public ownership query cannot notify after ${boundary}`,async t=>{
 const f=await fixture(t),ctx=f.context();await f.start(ctx);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);const task=await f.launch(ctx),entered=deferred<void>(),release=deferred<void>(),original=AgentRuntime.prototype.query;
 AgentRuntime.prototype.query=async function(this:AgentRuntime,id,identity){if(id===task.id){entered.resolve();await release.promise;}return original.call(this,id,identity);};
 try{const delivery=f.capture.emit(task.index);await entered.promise;if(boundary==="replacement")await f.start(f.context("replacement"));else await f.shutdown(ctx);release.resolve();await delivery;assert.deepEqual(f.selectionNotices(),[]);}
 finally{release.resolve();AgentRuntime.prototype.query=original;}
});

test("stale foreign shutdown cannot disable the replacement selection owner",async t=>{
 const f=await fixture(t),old=f.context(),current=f.context("selection-b");await f.start(old);assert.equal(f.capture.subscriptions.filter(row=>row.active).length,1);await f.start(current);const task=await f.launch(current);await f.shutdown(old);await f.capture.emit(task.index);
 assert.deepEqual(f.selectionNotices(),[`ASEN child-reported selection (${task.id}): model reported/selected; thinking low.`]);
});

for(const mode of ["factory","plain"] as const)test(`${mode} runtime preserves execution without an observable composed runner`,async t=>{
 const f=await fixture(t,mode),ctx=f.context();await f.start(ctx);const task=await f.launch(ctx);await f.capture.emit(task.index);assert.deepEqual(f.selectionNotices(),[]);assert.equal(f.capture.subscriptions.length,0);assert.equal(f.unrelated.subscriptions.length,0);assert.equal((await f.status(ctx,task.id)).task.record.id,task.id);assert.equal(f.capture.launches.length,1);
});
