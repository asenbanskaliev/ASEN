/** EF-603: no scope/role/model aliasing in production durable agent coalescing. */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,realpath,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest} from "../src/agents/dispatcher.js";

async function fixture(t:import("node:test").TestContext){
 const home=await mkdtemp(join(tmpdir(),"asen-ef603-scopes-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const first=join(home,"one"),second=join(home,"two");
 await mkdir(first);await mkdir(second);
 return {home,first:await realpath(first),second:await realpath(second)};
}
test("EF-603 only the exact unplanned Explorer coalesces across concurrent route/role/scope requests",
 {timeout:45000},async t=>{
 const f=await fixture(t);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const launched:string[]=[];
 const runtime=await AgentRuntime.open({
  storeFile:join(f.home,"agents.json"),maxConcurrency:20,
  runner:{run:async(request:AgentRequest)=>{
   launched.push(request.id);
   await gate;
   return {id:request.id,ok:true,output:"Bounded deterministic read-only evidence"};
  }},
 });
 const session={sessionId:"active-a",projectId:f.first};
 const base={role:"explorer" as const,prompt:"Same exact unplanned read-only analysis",session};
 const [e1,e2,e3]=await Promise.all([
  runtime.startReadOnly(base),
  runtime.startReadOnly(base),
  runtime.startReadOnly(base),
 ]);
 assert.equal(e1,e2);
 assert.equal(e1,e3);
 const alternate=await Promise.all([
  runtime.startReadOnly({...base,prompt:base.prompt+" changed"}),
  runtime.startReadOnly({...base,model:"ollama-cloud/beam"}),
  runtime.startReadOnly({...base,thinking:"low" as const}),
  runtime.startReadOnly({...base,session:{...session,sessionId:"active-b"}}),
  runtime.startReadOnly({...base,session:{...session,projectId:f.second}}),
  runtime.startReadOnly({...base,role:"reviewer" as const}),
  runtime.startReadOnly({...base,role:"reviewer" as const}),
  runtime.startReadOnly({...base,role:"verifier" as const}),
  runtime.startReadOnly({...base,role:"verifier" as const}),
  runtime.startReadOnly({...base,owner:{kind:"user" as const,id:"named-owner"}}),
  runtime.startReadOnly({...base,owner:{kind:"user" as const,id:"named-owner"}}),
 ]);
 assert.equal(new Set([e1,...alternate]).size,alternate.length+1,
  "Different role, owner, prompt, route or session cannot inherit an Explorer identity");
 const records=await runtime.list(session);
 assert.equal(records.filter(x=>x.id===e1).length,1);
 assert.equal(records.filter(x=>x.role==="reviewer").length,2);
 assert.equal(records.filter(x=>x.role==="verifier").length,2);
 assert.equal(records.filter(x=>x.role==="explorer").length,1+3+2,
  "The primary scope contains one coalesced plus prompt/model/thinking/owned variants");
 assert.ok(records.every(x=>x.state==="queued"||x.state==="running"));
 release();
 const expected=records.length;
 // Windows runners can be saturated by parallel multi-OS CI tests. Bound
 // by elapsed time, not a fixed number of filesystem-heavy list operations.
 const settleDeadline=Date.now()+20000;
 while(true){
  const done=await runtime.list(session);
  if(done.length===expected&&done.every(x=>x.state==="completed"))break;
  if(Date.now()>=settleDeadline)assert.fail(
   "Durable agents did not settle: "+JSON.stringify(done.map(x=>({id:x.id,state:x.state,role:x.role}))));
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.equal(launched.length,alternate.length+1,"Only distinct requests may consume a runner slot");
 const repeated=await runtime.startReadOnly(base);
 assert.notEqual(repeated,e1,"A completed Explorer is not an active task and must not be reused");
 // One final dispatch is allowed; it is still a provider-free deterministic runner.
 const repeatDeadline=Date.now()+10000;
 while(true){
  const item=(await runtime.list(session)).find(x=>x.id===repeated);
  if(item?.state==="completed")break;
  if(Date.now()>=repeatDeadline)assert.fail("Post-completion Explorer did not settle: "+item?.state);
  await new Promise(resolve=>setTimeout(resolve,25));
 }
});
test("EF-603 a planned Explorer cannot inherit an ad-hoc task even with identical prompt",
 {timeout:20000},async t=>{
 const f=await fixture(t);
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const runtime=await AgentRuntime.open({storeFile:join(f.home,"agents.json"),maxConcurrency:5,
  runner:{run:async(request:AgentRequest)=>{
   await gate;return{id:request.id,ok:true,output:"Completed isolated planned agent"};
  }}});
 const input={role:"explorer" as const,prompt:"Exact shared Explorer instruction",
  session:{sessionId:"planned-vs-adhoc",projectId:f.first}};
 const publicId=await runtime.startReadOnly(input);
 const prepared=async(_agentId:string,enqueue:()=>Promise<void>,dispatch:()=>void)=>{
  await enqueue();dispatch();
 };
 const p1=await runtime.startReadOnly({...input,onPrepared:prepared});
 const p2=await runtime.startReadOnly({...input,onPrepared:prepared});
 assert.equal(new Set([publicId,p1,p2]).size,3);
 const list=await runtime.list(input.session);
 assert.equal(list.length,3);
 assert.ok(list.every(item=>item.role==="explorer"));
 release();
 for(let attempt=0;attempt<200;attempt++){
  const done=await runtime.list(input.session);
  if(done.every(item=>item.state==="completed"))break;
  if(attempt===199)assert.fail("Planned agents did not finish after runner release");
  await new Promise(resolve=>setTimeout(resolve,10));
 }
});
