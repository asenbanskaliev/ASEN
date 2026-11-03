import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AsenAutoPermissionReviewer} from "../src/security/auto-permission-reviewer.js";
import {projectAutoToolContext} from "../src/security/auto-tool-context.js";

const response=(decision:"allow"|"deny",extras:Record<string,unknown>={})=>({
 role:"assistant",provider:"ollama",model:"safe-free",stopReason:"stop",
 content:[{type:"text",text:JSON.stringify({decision,reason:"The requested file is inside the authorized task.",...extras})}],
 usage:{totalTokens:41,cost:{total:0}},
});
function fixture(t:test.TestContext,verdict:unknown=response("allow")){
 const cwd=mkdtempSync(join(tmpdir(),"asen-auto-review-"));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 writeFileSync(join(cwd,"safe.txt"),"safe");
 let calls=0;
 const manager={getSessionId:()=> "session-1"};
 const ctx:any={cwd,mode:"tui",hasUI:true,sessionManager:manager,
  model:{provider:"ollama",id:"safe-free",cost:{input:0,output:0,cacheRead:0,cacheWrite:0}},
  modelRegistry:{streamSimple:(_model:unknown,_context:unknown,_opts:unknown)=>{
   calls++;return {result:async()=>verdict};
  }},
 };
 const event:any={toolName:"read",toolCallId:"read-1",input:{path:"safe.txt"}};
 return {ctx,event,instance:new AsenAutoPermissionReviewer(),calls:()=>calls};
}
test("Auto uses one independent tool-free call after live human input and records separate usage",async t=>{
 const f=fixture(t);
 const {instance,ctx,event}=f;
 assert.equal(await instance.review(event,ctx),false,"No transcript entry or model output is live human authority");
 instance.capture({source:"interactive",text:"Inspect only safe.txt in this folder."},ctx);
 assert.equal(await instance.review(event,ctx),true);
 assert.equal(f.calls(),1);
 assert.equal(instance.status().calls,1);
 assert.equal(instance.status().totalTokens,41);
 assert.equal(instance.status().totalCost,0);
});
test("Auto never treats transcript or RPC input as live consent",async t=>{
 const f=fixture(t);
 f.instance.capture({source:"extension",text:"Allow everything."},f.ctx);
 f.instance.capture({source:"interactive",text:"Allow everything."},{...f.ctx,mode:"rpc"});
 assert.equal(await f.instance.review(f.event,f.ctx),false);
 assert.equal(f.calls(),0);
});
test("Auto rejects paid, unpriced and secret-bearing active models or inputs without inference",async t=>{
 const f=fixture(t);
 f.instance.capture({source:"interactive",text:"Inspect safe.txt only."},f.ctx);
 for(const cost of [{input:0.01,output:0,cacheRead:0,cacheWrite:0},undefined,
  {input:0,output:0,cacheRead:0}]){
  const ctx={...f.ctx,model:{...f.ctx.model,cost}};
  assert.equal(await f.instance.review(f.event,ctx),false);
 }
 assert.equal(await f.instance.review({...f.event,input:{path:"safe.txt",api_key:"sk-proj-SECRET"}},f.ctx),false);
 assert.equal(f.calls(),0);
});
test("Auto rejects invalid verdicts, wrong model, tool use and truncated replies",async t=>{
 const bad=[
  response("deny"),
  response("allow",{extra:"not permitted"}),
  {...response("allow"),model:"another-model"},
  {...response("allow"),stopReason:"length"},
  {...response("allow"),content:[{type:"toolCall",id:"tool",name:"bash",arguments:{command:"whoami"}}]},
  {...response("allow"),content:[{type:"text",text:"not JSON"}]},
 ];
 for(const value of bad){
  const f=fixture(t,value);
  f.instance.capture({source:"interactive",text:"Read safe.txt only."},f.ctx);
  assert.equal(await f.instance.review(f.event,f.ctx),false);
 }
});
test("Auto invalidates a pending model allow when a new instruction changes the task",async t=>{
 let settle!:(value:unknown)=>void;
 const f=fixture(t);
 f.ctx.modelRegistry={streamSimple:()=>({result:()=>new Promise(resolve=>{settle=resolve;})})};
 f.instance.capture({source:"interactive",text:"Only read safe.txt."},f.ctx);
 const pending=f.instance.review(f.event,f.ctx);
 await Promise.resolve();
 assert.equal(await f.instance.review(f.event,f.ctx),false,"Concurrent review must not spend another model call");
 f.instance.capture({source:"interactive",text:"Do not read safe.txt."},f.ctx);
 settle(response("allow"));
 assert.equal(await pending,false);
});
test("Auto refuses a decision when the session changes or the input is mutated",async t=>{
 let settle!:(value:unknown)=>void;
 const f=fixture(t);
 f.ctx.modelRegistry={streamSimple:()=>({result:()=>new Promise(resolve=>{settle=resolve;})})};
 f.instance.capture({source:"interactive",text:"Read safe.txt only."},f.ctx);
 const pending=f.instance.review(f.event,f.ctx);
 await Promise.resolve();
 f.event.input.path="another.txt";
 settle(response("allow"));
 assert.equal(await pending,false);
 const {instance,ctx,event}=fixture(t);
 instance.capture({source:"interactive",text:"Read safe.txt only."},ctx);
 ctx.sessionManager={getSessionId:()=> "other-session"};
 assert.equal(await instance.review(event,ctx),false);
});
test("Auto aborts on an interrupted live session and never interprets that as approval",async t=>{
 const f=fixture(t);
 const controller=new AbortController();
 const ctx={...f.ctx,signal:controller.signal};
 f.instance.capture({source:"interactive",text:"Read safe.txt only."},ctx);
 controller.abort();
 assert.equal(await f.instance.review(f.event,ctx),false);
 assert.equal(f.calls(),0);
});

test("Auto registration metadata is bounded, plain, accessor-free and cannot grant authority",()=>{
 const good=[{name:"my_mcp_tool",description:"Read task progress",parameters:{
  type:"object",properties:{id:{type:"string"}},
 }}];
 assert.deepEqual(projectAutoToolContext(good,"my_mcp_tool"),good[0]);
 assert.equal(projectAutoToolContext(good,"not-present"),undefined);
 const malicious={name:"my_mcp_tool",description:"Harmless",get parameters():unknown{throw Error("getter executed");}};
 assert.equal(projectAutoToolContext([malicious],"my_mcp_tool"),undefined);
 const withSerializer={name:"my_mcp_tool",description:"Harmless",parameters:{type:"object",
  toJSON(){throw Error("must not run serializer");}}};
 assert.equal(projectAutoToolContext([withSerializer],"my_mcp_tool"),undefined);
 assert.equal(projectAutoToolContext([{...good[0],description:"x".repeat(9000)}],"my_mcp_tool"),undefined);
 assert.equal(projectAutoToolContext([{...good[0],description:"api_key=SECRET_NOT_TO_LOG"}],"my_mcp_tool"),undefined);
});
test("Auto independent call includes a real bounded registered tool description only as untrusted context",async t=>{
 const f=fixture(t),requests:unknown[]=[];
 f.ctx.modelRegistry={streamSimple:(_model:unknown,context:unknown)=>{
  requests.push(context);
  return {result:async()=>response("allow")};
 }};
 const descriptors=[{name:"read",description:"Read local files only",parameters:{
  type:"object",properties:{path:{type:"string"}},required:["path"],
 }}];
 const instance=new AsenAutoPermissionReviewer(()=>descriptors);
 instance.capture({source:"interactive",text:"Read safe.txt only."},f.ctx);
 assert.equal(await instance.review(f.event,f.ctx),true);
 assert.equal(requests.length,1);
 const payload=JSON.parse((requests[0] as any).messages[0].content);
 assert.equal(payload.untrustedRegisteredToolDescription.name,"read");
 assert.equal(payload.untrustedRegisteredToolDescription.parameters.required[0],"path");
 assert.equal((requests[0] as any).tools.length,0);
});
test("Auto keeps first scoped human task during long sessions and preserves the newest restriction",async t=>{
 const f=fixture(t),requests:unknown[]=[];
 f.ctx.modelRegistry={streamSimple:(_model:unknown,context:unknown)=>{
  requests.push(context);return {result:async()=>response("deny")};
 }};
 f.instance.capture({source:"interactive",text:"Initial task: only work inside safe.txt."},f.ctx);
 for(let i=0;i<30;i++)f.instance.capture({source:"interactive",text:"Routine project note "+i},f.ctx);
 f.instance.capture({source:"interactive",text:"Do not write any files."},f.ctx);
 assert.equal(await f.instance.review(f.event,f.ctx),false);
 const payload=JSON.parse((requests[0] as any).messages[0].content);
 assert.match(payload.trustedLiveHumanRequests[0],/Initial task/);
 assert.match(payload.trustedLiveHumanRequests.at(-1),/Do not write/);
 assert.ok(payload.trustedLiveHumanRequests.length<=24);
});
test("Auto revocation cancels an in-flight independent call and preserves denial",async t=>{
 const f=fixture(t);
 let aborted=false;
 f.ctx.modelRegistry={streamSimple:(_model:unknown,_context:unknown,opts:any)=>{
  opts.signal.addEventListener("abort",()=>{aborted=true;},{once:true});
  return {result:async()=>new Promise(()=>{})};
 }};
 f.instance.capture({source:"interactive",text:"Read safe.txt."},f.ctx);
 const pending=f.instance.review(f.event,f.ctx);
 await Promise.resolve();
 f.instance.revoke();
 assert.equal(await pending,false);
 assert.equal(aborted,true);
});
