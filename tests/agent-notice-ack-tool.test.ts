import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";
import {registerAgentTools} from "../src/agents/pi-agent-tools.js";
test("EF-601 Pi ack only confirms an authenticated coordinator action in the same TUI session",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-ack-tool-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:100}));
 const identity={sessionId:"ack-session",projectId:await realpath(process.cwd())};
 const journal=new AgentNotificationJournal(join(root,"notices.json"));
 const row=await journal.record({id:"agent-ack",state:"completed",...identity});
 await journal.claim(row.eventId,identity);await journal.markEnqueued(row.eventId,identity);
 let durableState="completed";
 const runtime={list:async()=>[],query:async(id:string,scope:typeof identity)=>id==="agent-ack"&&scope.sessionId===identity.sessionId
  ?{record:{id,role:"explorer",state:durableState,...identity}}:null};
 const tools=new Map<string,any>();
 registerAgentTools({registerTool:(tool:any)=>tools.set(tool.name,tool)} as never,async()=>runtime as never,
  undefined,undefined,journal);
 const ctx={mode:"tui",hasUI:true,cwd:identity.projectId,sessionManager:{getSessionId:()=>identity.sessionId},ui:{notify:()=>{}}};
 const ack=(eventId:string,context:any=ctx)=>tools.get("asen_agent_ack").execute("ack",{eventId},
  new AbortController().signal,()=>{},context);
 await assert.rejects(()=>ack(row.eventId,{...ctx,mode:"rpc"}),/Pi TUI/u);
 await assert.rejects(()=>ack(row.eventId,{...ctx,sessionManager:{getSessionId:()=>"foreign"}}),/not available/u);
 await assert.rejects(()=>ack(row.eventId),/Inspect this exact terminal agent/u);
 const query=()=>tools.get("asen_agent_status").execute("status",{id:"agent-ack"},
  new AbortController().signal,()=>{},ctx);
 const listed=await tools.get("asen_agent_status").execute("list",{},
  new AbortController().signal,()=>{},ctx);
 assert.ok(Array.isArray(listed.details));
 await assert.rejects(()=>ack(row.eventId),/Inspect this exact terminal agent/u);
 durableState="failed";
 await query();
 await assert.rejects(()=>ack(row.eventId),/Inspect this exact terminal agent/u);
 durableState="completed";
 await query();
 const results=await Promise.all([ack(row.eventId),ack(row.eventId)]);
 assert.deepEqual(results.map((r:any)=>r.details.acknowledged).sort(),[false,true]);
 assert.ok(results.every((r:any)=>r.details.writerAuthorized===false&&r.details.humanReadConfirmed===false&&
  r.details.evidence==="COORDINATOR_ACTION_ONLY"));
 assert.equal((await new AgentNotificationJournal(join(root,"notices.json")).list(identity))[0]?.delivery,"acknowledged");
 await assert.rejects(()=>ack("asen:agent:"+"0".repeat(64)+":terminal"),/not available/u);
});

test("EF-604 re-registering Pi tools after a restart discards earlier inspection authority",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-pi-ack-restart-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:6,retryDelay:100}));
 const owner={sessionId:"persistent-pi-session",projectId:await realpath(process.cwd())};
 const journal=new AgentNotificationJournal(join(root,"notices.json"));
 const task={id:"read-only-completed",state:"completed",...owner};
 const row=await journal.record(task);
 await journal.claim(row.eventId,owner);
 await journal.markEnqueued(row.eventId,owner);
 const uncertain=await journal.record({...task,id:"uncertain-before-restart"});
 await journal.claim(uncertain.eventId,owner); // attempted: no confirmed transport
 const runtime={list:async()=>[],query:async(id:string,scope:typeof owner)=>
  scope.sessionId===owner.sessionId&&scope.projectId===owner.projectId&&
  (id===task.id||id==="uncertain-before-restart")
  ?{record:{id,role:"explorer",state:"completed",...owner}}:null};
 const ctx={mode:"tui",hasUI:true,cwd:owner.projectId,
  sessionManager:{getSessionId:()=>owner.sessionId},ui:{notify:()=>{}}};
 const register=()=>{
  const exposed=new Map<string,any>();
  registerAgentTools({registerTool:(tool:any)=>exposed.set(tool.name,tool)} as never,
   async()=>runtime as never,undefined,undefined,journal);
  const call=(name:string,args:object)=>exposed.get(name).execute(name,args,
   new AbortController().signal,()=>{},ctx);
  return {status:(id?:string)=>call("asen_agent_status",id?{id}:{}),
   ack:(eventId:string)=>call("asen_agent_ack",{eventId})};
 };
 const first=register();
 await first.status(task.id);
 const reopened=register(); // new registration drops the old in-memory inspection map
 await assert.rejects(()=>reopened.ack(row.eventId),/Inspect this exact terminal agent/u);
 await reopened.status(); // listing is not specific inspection
 await assert.rejects(()=>reopened.ack(row.eventId),/Inspect this exact terminal agent/u);
 await reopened.status("uncertain-before-restart");
 await assert.rejects(()=>reopened.ack(uncertain.eventId),/Inspect this exact terminal agent/u);
 assert.equal((await journal.list(owner)).find(x=>x.eventId===uncertain.eventId)?.delivery,"attempted");
 await reopened.status(task.id);
 const confirmed=await reopened.ack(row.eventId);
 assert.equal(confirmed.details.acknowledged,true);
 assert.equal(confirmed.details.writerAuthorized,false);
 assert.equal(confirmed.details.humanReadConfirmed,false);
 assert.equal((await journal.list(owner)).find(x=>x.eventId===row.eventId)?.delivery,"acknowledged");
});
