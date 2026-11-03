import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AsenAutoPermissionReviewer} from "../src/security/auto-permission-reviewer.js";

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
