import assert from "node:assert/strict";
import {test,type TestContext} from "node:test";
import {mkdir,mkdtemp,realpath,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAsenExtension,type AsenExtensionDependencies} from "../extensions/asen.js";

type Request={file:string;arguments:readonly string[];cwd:string;timeoutMs:number|undefined;maxBufferBytes:number;signal?:AbortSignal};
type ProcessResult={stdout:string;stderr:string;exitCode:number|null;signal:string|null;timedOut:boolean;outputLimitExceeded:boolean};
type NativeOptions={executable:string|(()=>string);execute:(request:Request)=>Promise<ProcessResult>};
type Observation={operation:string;status:string;data?:unknown;reason?:string;reviewAuthority:boolean;deliveryAuthority:boolean};
const mode=(effective="on")=>({schema:"gentle-ai.review-mode/v1",operation:"status",scope:"both",
 status:{schema:"gentle-ai.rdd-mode-status/v1",global:"",clone_local:effective,effective,source:"clone_local"}});
const assessment=()=>({schema:"gentle-ai.review-assessment/v1",risk:"high",reasons:[{code:"security"}],
 changed_paths:1,changed_lines:2,candidate:{kind:"current-changes"}});
const continuation={operation:"review.status",command:"opaque native command --do-not-rebuild",
 arguments:[{name:"--z",value:"",token:"opaque Z"},{name:"--a",value:"a b",token:"opaque A"}]};
const processResult=(data:unknown):ProcessResult=>({stdout:JSON.stringify(data),stderr:"",exitCode:0,signal:null,timedOut:false,outputLimitExceeded:false});

// Parent supplies isolated HOME/config/cache/temp and ASEN_NO_SKILL_REGISTRY=1.
// No session_start: registration itself is the public seam; no SDK/bootstrap or Git fixtures.
async function fixture(t:TestContext,configured=true,resolver=false,executable?:NativeOptions["executable"]){
 const root=await mkdtemp(path.join(os.tmpdir(),"asen-native-control-"));
 const home=path.join(root,"home"),project=path.join(root,"project"),other=path.join(root,"other");
 let shutdown=async()=>{};
 t.after(async()=>{try{await shutdown();}finally{await rm(root,{recursive:true,force:true});}});
 await Promise.all([mkdir(home),mkdir(project),mkdir(other)]);
 const cwd=await realpath(project),file=path.join(root,"fake-native.exe"),requests:Request[]=[],notices:string[]=[];
 let sessionId="native-control",reply:()=>Promise<ProcessResult>=async()=>processResult(mode());
 const forbidden=()=>assert.fail("Native observation must not invoke model/review/host execution or UI consent");
 const commands=new Map<string,any>(),events=new Map<string,Function[]>();
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},registerShortcut(){},
  getCommands(){assert.equal(this,pi);return [...commands].map(([name,command])=>({name,description:command.description,source:"extension"}));},
  getAllTools(){return [];},getFlag(){return false;},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 const ctx:any={cwd,hasUI:false,sessionManager:{getSessionId:()=>sessionId},
  ui:{notify(message:string){notices.push(message);},select:forbidden,editor:forbidden,confirm:forbidden,custom:forbidden}};
 const nativeRdd:NativeOptions={executable:executable??(resolver?()=>file:file),execute:async request=>{requests.push(request);return reply();}};
 const dependencies={homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},
  autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false,
  ...(configured?{nativeRdd}:{})} as unknown as AsenExtensionDependencies;
 createAsenExtension(dependencies)(pi);
 shutdown=async()=>{for(const fn of events.get("session_shutdown")??[])await fn({},ctx);};
 return {cwd,file,other,ctx,requests,notices,commands,nativeRdd,
  session(value:string){sessionId=value;},respond(fn:()=>Promise<ProcessResult>){reply=fn;},
  wire(data:unknown){reply=async()=>processResult(data);},
  async call(args:string){return await commands.get("asen-review").handler(args,ctx);}};
}
function available(value:unknown,operation:string,data:unknown){
 assert.deepEqual(value,{operation,status:"available",data,reviewAuthority:false,deliveryAuthority:false});
}
function unavailable(value:unknown,operation:string){
 const result=value as Observation;
 assert.equal(result?.operation,operation);assert.equal(result.status,"unavailable");
 assert.match(result.reason??"",/^[a-z][a-z0-9_-]*$/i);
 assert.equal(Object.hasOwn(result,"data"),false);assert.equal(result.reviewAuthority,false);assert.equal(result.deliveryAuthority,false);
}

for(const [operation,data,resolver] of [["status",mode("on"),false],["status",mode("off"),true],["assess",assessment(),false]] as const){
 test(`public native ${operation} preserves wire and bounded argv (${resolver?"resolver":"path"}, ${JSON.stringify(data)})`,async t=>{
  const f=await fixture(t,true,resolver);f.wire(data);f.ctx.cwd=`${f.cwd}${path.sep}.`;
  available(await f.call(`native ${operation}`),operation,data);
  assert.equal(f.notices.length,1,"Public command must display its observation");
  available(JSON.parse(f.notices[0]!),operation,data);
  assert.equal(f.requests.length,1);
  const {signal,...request}=f.requests[0]!;assert.equal(signal,undefined);
  assert.deepEqual(request,{file:f.file,arguments:operation==="status"?["review","mode","status","--cwd",f.cwd,"--json"]:["review","assess","--cwd",f.cwd,"--json"],
   cwd:f.cwd,timeoutMs:30_000,maxBufferBytes:16*1024*1024});
 });
}
test("mode optional metadata and default source remain raw",async t=>{
 const f=await fixture(t);
 const data={...mode("off"),scope:"global",status:{...mode("off").status,global:"off",clone_local:"",source:"default",revision:"opaque revision",reach:"this_build"}};
 f.wire(data);available(await f.call("native status"),"status",data);
});
test("unconfigured native status/assess are unavailable, never simulated OFF",async t=>{
 const f=await fixture(t,false);
 for(const operation of ["status","assess"]){
  unavailable(await f.call(`native ${operation}`),operation);
  assert.equal(typeof f.notices.at(-1),"string");unavailable(JSON.parse(f.notices.at(-1)!),operation);
 }
 assert.equal(f.notices.length,2);assert.equal(f.requests.length,0);
});
for(const executable of ["example-unqualified-native","relative/native.exe",()=>{throw new Error("resolver unavailable");}]){
 test(`invalid executable fails closed without execution: ${String(executable)}`,async t=>{
  const f=await fixture(t,true,false,executable);
  unavailable(await f.call("native status"),"status");assert.equal(f.requests.length,0);
 });
}
for(const state of ["off","unknown","unavailable"]){
 test(`${state} never enables review; ASSESS remains callable`,async t=>{
  const f=await fixture(t);f.wire(state==="unavailable"?{}:mode(state));
  const status=await f.call("native status");
  if(state==="off")available(status,"status",mode("off"));else unavailable(status,"status");
  for(const args of ["native on","native enable","native start","native status extra","native assess --untracked x","native assess --base-ref main"]){
   assert.equal(typeof await f.call(args),"string");
  }
  assert.equal(f.requests.length,1);
  const data=assessment();f.wire(data);available(await f.call("native assess"),"assess",data);
  assert.equal(f.requests.length,2);
 });
}
for(const data of [
 {...assessment(),risk:"passive"},
 {...assessment(),candidate:{kind:"base-diff",base_ref:"opaque ref",consumed:true},review_due:false,review_due_reason:"already_reviewed"},
 {...assessment(),candidate:{kind:"current-changes",consumed:false},review_due:true,review_due_reason:"high_risk",next_transition:continuation},
 {...assessment(),risk:"medium",review_due:true,review_due_reason:"slice_budget_reached",next_transition:continuation},
]){
 test(`assessment is informational and opaque: ${JSON.stringify(data)}`,async t=>{
  const f=await fixture(t);f.wire(data);available(await f.call("native assess"),"assess",data);
  assert.equal(f.requests.length,1,"Continuation is never executed");
 });
}
const badMode:unknown[]=[null,{...mode(),schema:"wrong"},{...mode(),extra:true},{...mode(),operation:"enable"},{...mode(),scope:"project"},
 ...[{schema:"wrong"},{global:"unknown"},{clone_local:null},{effective:"unknown"},{source:"guessed"},{revision:0},{reach:"global"},{extra:true}].map(patch=>({...mode(),status:{...mode().status,...patch}}))];
const badAssessment:unknown[]=[{...assessment(),schema:"wrong"},{...assessment(),risk:"unknown"},
 ...[-1,0.5,Number.MAX_SAFE_INTEGER+1].flatMap(count=>[{...assessment(),changed_paths:count},{...assessment(),changed_lines:count}]),
 ...[null,{kind:"unknown"},{kind:"base-diff",base_ref:""},{kind:"current-changes",consumed:"true"}].map(candidate=>({...assessment(),candidate})),
 ...[[{}],[{code:""}],[{code:"x",path:4}],[{code:"x",detail:""}],null].map(reasons=>({...assessment(),reasons})),
 ...[{review_due:true},{review_due_reason:"high_risk"},{review_due:"true",review_due_reason:"high_risk"},
  {review_due:true,review_due_reason:"passive"},{review_due:false,review_due_reason:"high_risk"},
  {review_due:false,review_due_reason:"unknown"},{review_due:false,review_due_reason:"already_reviewed"},
  {candidate:{kind:"current-changes",consumed:true},review_due:true,review_due_reason:"high_risk"},
  {review_due:false,review_due_reason:"under_budget",next_transition:continuation},
  {next_transition:continuation}].map(patch=>({...assessment(),...patch})),
 ...[{...continuation,operation:"review.start"},{...continuation,command:""},{...continuation,extra:true},
  {...continuation,arguments:["--opaque"]},{...continuation,arguments:[{name:"",value:"x"}]},
  {...continuation,arguments:[{name:"x",value:1}]},{...continuation,arguments:[{name:"x",value:"",token:""}]},
  {...continuation,arguments:[{name:"x",value:"",extra:true}]}].map(next_transition=>({...assessment(),review_due:true,review_due_reason:"high_risk",next_transition}))];
for(const [operation,vectors] of [["status",badMode],["assess",badAssessment]] as const){
 for(const [index,data] of vectors.entries())test(`native ${operation} rejects incompatible wire #${index}`,async t=>{
  const f=await fixture(t);f.wire(data);unavailable(await f.call(`native ${operation}`),operation);assert.equal(f.requests.length,1);
 });
}
for(const operation of ["status","assess"]){
 for(const [name,patch] of Object.entries({nonzero:{exitCode:1},stderr:{stderr:"provider refusal"},timeout:{timedOut:true},
  signal:{signal:"SIGTERM"},overflow:{outputLimitExceeded:true},json:{stdout:"{"},missing:{stdout:undefined},badFlag:{timedOut:"false"}})){
  test(`native ${operation} transport ${name} is unavailable without authority`,async t=>{
   const f=await fixture(t);f.respond(async()=>({...processResult(operation==="status"?mode():assessment()),...patch}) as unknown as ProcessResult);
   unavailable(await f.call(`native ${operation}`),operation);assert.equal(f.requests.length,1);
  });
 }
 test(`native ${operation} executor throw/malformed result and whitespace stderr`,async t=>{
  const f=await fixture(t);
  for(const reply of [async()=>{throw new Error("not launched");},async()=>null as unknown as ProcessResult]){
   f.respond(reply);unavailable(await f.call(`native ${operation}`),operation);
  }
  const data=operation==="status"?mode():assessment();
  f.respond(async()=>({...processResult(data),stderr:" \r\n\t"}));available(await f.call(`native ${operation}`),operation,data);
 });
}
test("pre-aborted native observation never calls executor",async t=>{
 const f=await fixture(t),abort=new AbortController();abort.abort();f.ctx.signal=abort.signal;
 for(const operation of ["status","assess"])unavailable(await f.call(`native ${operation}`),operation);
 assert.equal(f.requests.length,0);
});
for(const change of ["session","manager","cwd","signal","abort"]){
 test(`native observation does not publish after ${change} changes across await`,async t=>{
  const f=await fixture(t),abort=new AbortController();f.ctx.signal=abort.signal;
  let complete!:(result:ProcessResult)=>void,entered!:()=>void;
  const transportEntered=new Promise<boolean>(resolve=>{entered=()=>resolve(true);});
  f.respond(()=>new Promise(resolve=>{complete=resolve;entered();}));
  const pending=f.call("native assess");
  // Observe transport entry or the legacy response, without polling or clocks.
  assert.equal(await Promise.race([transportEntered,pending.then(()=>false)]),true,"Registered command must reach injected executor");
  assert.equal(f.requests[0]?.signal,abort.signal);
  if(change==="session")f.session("new-session");
  if(change==="manager")f.ctx.sessionManager={getSessionId:()=>"native-control"};
  if(change==="cwd")f.ctx.cwd=f.other;
  if(change==="signal")f.ctx.signal=new AbortController().signal;
  if(change==="abort")abort.abort();
  complete(processResult(assessment()));unavailable(await pending,"assess");
  assert.ok(f.notices.every(message=>JSON.parse(message).status!=="available"),"No stale publication");
 });
}
test("legacy headless manual workspace, correction and request grammar remain separate",async t=>{
 const f=await fixture(t);
 for(const args of ["workspace",`workspace correction ${"a".repeat(64)}`]){
  assert.equal((await f.call(args) as {status:string}).status,"unavailable");
 }
 await assert.rejects(f.call("a".repeat(64)),/No existe solicitud pendiente/);
 assert.equal(typeof await f.call(JSON.stringify({operation:"status",native:true})),"string");
 assert.equal(f.requests.length,0);
 const usage=await f.call("");assert.equal(typeof usage,"string");
 assert.match(usage as string,/native status/);assert.match(usage as string,/native assess/);
 assert.match(f.commands.get("asen-review").description,/ASEN/);
});
