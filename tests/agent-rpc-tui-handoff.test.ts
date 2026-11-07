/** EF-601/603/604: real ASEN production extension, separate coordinator registrations,
 * actual persistent store/journal and no model. RPC cannot deliver; TUI must
 * inspect exactly once and never inherit a previous registration's authority.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,realpath,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createPiExtension} from "../extensions/asen.js";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";

type RunResult={id:string;ok:boolean;output:string};
function mockPi(sessionId:string,projectId:string,mode:"rpc"|"tui",throwTransport=false){
 const events=new Map<string,Array<(event:unknown,ctx:any)=>Promise<void>|void>>();
 const tools=new Map<string,any>(),notices:string[]=[],sent:Array<{message:any;options:any}>=[];
 const waiting=new Set<{accept:(str:string)=>boolean;resolve:()=>void}>();
 const ui={
  notify(message:string){notices.push(message);for(const pending of [...waiting])if(pending.accept(message)){waiting.delete(pending);pending.resolve();}},
  confirm:async()=>true,
  setWidget:()=>{},
 };
 const context={mode,hasUI:mode==="tui",cwd:projectId,isIdle:()=>true,
  sessionManager:{getSessionId:()=>sessionId},ui};
 const pi={
  on(name:string,handler:(event:unknown,ctx:any)=>Promise<void>|void){
   events.set(name,[...(events.get(name)??[]),handler]);
  },
  registerCommand:()=>{},
  registerTool:(tool:any)=>tools.set(tool.name,tool),
  getCommands:()=>[],getAllTools:()=>[],
  sendMessage(message:any,options:any){
   if(throwTransport)throw Error("SIMULATED_UNCERTAIN_TRANSPORT");
   sent.push({message,options});
  },
 };
 async function fire(name:string){for(const handler of events.get(name)??[])await handler({},context);}
 function waitNotice(predicate:(value:string)=>boolean){
  if(notices.some(predicate))return Promise.resolve();
  return new Promise<void>((resolve,reject)=>{
   const value={accept:predicate,resolve:()=>{clearTimeout(timeout);resolve();}};
   const timeout=setTimeout(()=>{waiting.delete(value);reject(Error("ASEN terminal notice not observed"));},8500);
   waiting.add(value);
  });
 }
 function use(name:string,args:object={}){
  const tool=tools.get(name);
  assert.ok(tool,"Missing production Pi tool: "+name);
  return tool.execute(name,args,new AbortController().signal,()=>{},context);
 }
 return {pi,context,notices,sent,fire,waitNotice,use};
}
async function open(home:string,identity:{sessionId:string;projectId:string},
 mode:"rpc"|"tui",onRun:(id:string)=>Promise<RunResult>,throwTransport=false){
 const host=mockPi(identity.sessionId,identity.projectId,mode,throwTransport);
 createPiExtension({homeDir:()=>home,autoAdvancePlans:false,
  agentRunner:{run:request=>onRun(request.id)}})(host.pi as never);
 await host.fire("session_start");
 return host;
}
async function fileState(home:string,identity:{sessionId:string;projectId:string}){
 const path=join(home,".asen","agent-notices.json");
 const rows=await new AgentNotificationJournal(path).list(identity);
 return {path,rows};
}
test("EF-604 a pending RPC completion moves to one TUI enqueue only after restart and exact inspection",
 {timeout:45000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-rpc-tui-handoff-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const identity={sessionId:"same-native-session",projectId:await realpath(process.cwd())};
 let invocations=0;
 const rpc=await open(home,identity,"rpc",async id=>{
  invocations++;return {id,ok:true,output:"Bounded read-only result"};
 });
 const task=await rpc.use("asen_agent_start",{prompt:"Inspect isolated source without tools"});
 await rpc.waitNotice(s=>s.includes("ASEN terminó"));
 const taskId=task.details.id;
 const pending=(await fileState(home,identity)).rows;
 assert.equal(pending.length,1);
 assert.equal(pending[0]!.agentId,taskId);
 assert.equal(pending[0]!.delivery,"pending");
 assert.equal(rpc.sent.filter(x=>x.message.customType==="asen.agent.result").length,0);
 await rpc.fire("session_shutdown");
 const foreign=await open(home,{...identity,sessionId:"foreign-session"},"tui",
  async()=>{throw Error("RESTART_NEVER_INVOKES_PROVIDER");});
 assert.equal(foreign.sent.filter(x=>x.message.customType==="asen.agent.result").length,0);
 await foreign.fire("session_shutdown");
 const tui=await open(home,identity,"tui",async()=>{throw Error("RESTART_NEVER_INVOKES_PROVIDER");});
 const results=tui.sent.filter(x=>x.message.customType==="asen.agent.result");
 assert.equal(results.length,1,"Pending result must be enqueued exactly once by the TUI");
 assert.equal(results[0]!.message.details.agentId,taskId);
 assert.equal(results[0]!.message.details.deliveryConfirmed,false);
 assert.equal(results[0]!.options.triggerTurn,false);
 const delivered=(await fileState(home,identity)).rows;
 assert.equal(delivered.length,1);
 assert.equal(delivered[0]!.eventId,pending[0]!.eventId);
 assert.equal(delivered[0]!.delivery,"enqueued");
 await assert.rejects(()=>tui.use("asen_agent_ack",{eventId:delivered[0]!.eventId}),
  /Inspect this exact terminal agent/u);
 const seen=await tui.use("asen_agent_status",{id:taskId});
 assert.equal(seen.details.task.record.state,"completed");
 assert.equal(seen.details.task.record.id,taskId);
 const ack=await tui.use("asen_agent_ack",{eventId:delivered[0]!.eventId});
 assert.equal(ack.details.acknowledged,true);
 assert.equal(ack.details.writerAuthorized,false);
 assert.equal(ack.details.humanReadConfirmed,false);
 assert.equal((await fileState(home,identity)).rows[0]!.delivery,"acknowledged");
 await tui.fire("session_shutdown");
 const reopened=await open(home,identity,"tui",async()=>{throw Error("REPLAY_OF_COMPLETED_AGENT");});
 assert.equal(reopened.sent.filter(x=>x.message.customType==="asen.agent.result").length,0,
  "An acknowledged event cannot be injected again on subsequent restart");
 assert.equal(invocations,1);
 assert.equal((await fileState(home,identity)).rows[0]!.delivery,"acknowledged");
 await reopened.fire("session_shutdown");
});
test("EF-604 a transport attempt remains uncertain across TUI restart and cannot acquire ack",
 {timeout:35000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-uncertain-tui-reboot-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const identity={sessionId:"restarted-attempted-session",projectId:await realpath(process.cwd())};
 let calls=0;
 const initial=await open(home,identity,"tui",async id=>{
  calls++;return {id,ok:true,output:"Bounded isolated result"};
 },true);
 const started=await initial.use("asen_agent_start",{prompt:"Read-only uncertain-transport witness"});
 await initial.waitNotice(s=>s.includes("no puede confirmar la entrega"));
 const attempted=(await fileState(home,identity)).rows;
 assert.equal(attempted.length,1);
 assert.equal(attempted[0]!.delivery,"attempted");
 assert.equal(initial.sent.length,0);
 await initial.fire("session_shutdown");
 const recovered=await open(home,identity,"tui",async()=>{throw Error("UNCERTAIN_WORK_REPLAY");});
 assert.equal(recovered.sent.filter(x=>x.message.customType==="asen.agent.result").length,0,
  "An attempted event is not allowed to replay on restart");
 assert.ok(recovered.notices.some(s=>s.includes("entrega incierta")));
 const status=await recovered.use("asen_agent_status",{id:started.details.id});
 assert.equal(status.details.task.record.state,"completed");
 await assert.rejects(()=>recovered.use("asen_agent_ack",{eventId:attempted[0]!.eventId}),
  /Inspect this exact terminal agent|enqueued/u);
 assert.equal((await fileState(home,identity)).rows[0]!.delivery,"attempted");
 assert.equal(calls,1);
 await recovered.fire("session_shutdown");
});

test("EF-601 Pi TUI changing to hold BEFORE the durable claim leaves a retryable pending notice",
 {timeout:35000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-route-flip-before-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const scope={sessionId:"route-change-before-claim",projectId:await realpath(process.cwd())};
 let calls=0,started=0;
 const host=await open(home,scope,"tui",async id=>{
  started++;return {id,ok:true,output:"Bounded provider-free read-only result"};
 });
 host.context.isIdle=()=>++calls===1;
 const task=await host.use("asen_agent_start",{prompt:"Check race before a notification claim"});
 await host.waitNotice(s=>s.includes("ASEN terminó"));
 const before=(await fileState(home,scope)).rows;
 assert.equal(before.length,1);
 assert.equal(before[0]!.agentId,task.details.id);
 assert.equal(before[0]!.delivery,"pending");
 assert.equal(host.sent.filter(x=>x.message.customType==="asen.agent.result").length,0);
 await host.fire("session_shutdown");
 const recovered=await open(home,scope,"tui",async()=>{throw Error("DUPLICATE_AGENT_DISPATCH");});
 assert.equal(recovered.sent.filter(x=>x.message.customType==="asen.agent.result").length,1);
 assert.equal((await fileState(home,scope)).rows[0]!.delivery,"enqueued");
 assert.equal(started,1);
 await recovered.fire("session_shutdown");
});
test("EF-604 Pi TUI changing to hold AFTER a claim cannot send, replay or acknowledge",
 {timeout:35000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-route-flip-after-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const scope={sessionId:"route-change-after-claim",projectId:await realpath(process.cwd())};
 let calls=0,started=0;
 const host=await open(home,scope,"tui",async id=>{
  started++;return {id,ok:true,output:"Bounded provider-free read-only result"};
 });
 host.context.isIdle=()=>++calls<=2;
 const task=await host.use("asen_agent_start",{prompt:"Check race after the durable claim"});
 await host.waitNotice(s=>s.includes("ASEN terminó"));
 const before=(await fileState(home,scope)).rows;
 assert.equal(before.length,1);
 assert.equal(before[0]!.agentId,task.details.id);
 assert.equal(before[0]!.delivery,"attempted","An interrupted post-claim transition must be uncertain");
 assert.equal(host.sent.filter(x=>x.message.customType==="asen.agent.result").length,0);
 assert.ok(host.notices.some(s=>s.includes("aviso queda incierto")));
 await host.fire("session_shutdown");
 const recovered=await open(home,scope,"tui",async()=>{throw Error("REPLAY_AFTER_UNCERTAIN_SEND");});
 assert.equal(recovered.sent.filter(x=>x.message.customType==="asen.agent.result").length,0);
 const lookedUp=await recovered.use("asen_agent_status",{id:task.details.id});
 assert.equal(lookedUp.details.task.record.state,"completed");
 await assert.rejects(()=>recovered.use("asen_agent_ack",{eventId:before[0]!.eventId}),
  /Inspect this exact terminal agent|enqueued/u);
 assert.equal((await fileState(home,scope)).rows[0]!.delivery,"attempted");
 assert.equal(started,1);
 await recovered.fire("session_shutdown");
});

test("EF-601 same-session project drift after enqueue must not wake the foreign TUI workspace",
 {timeout:35000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-ef601-cross-project-wake-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const scope={sessionId:"same-session-new-project",projectId:await realpath(process.cwd())};
 const foreign=join(home,"other-project");await mkdir(foreign);
 let childRuns=0;
 const host=await open(home,scope,"tui",async id=>{childRuns++;return{id,ok:true,output:"Read-only owned summary"};});
 const originalSend=host.pi.sendMessage.bind(host.pi);
 host.pi.sendMessage=(message:any,options:any)=>{
  originalSend(message,options);
  if(message.customType==="asen.agent.result")host.context.cwd=foreign;
 };
 await host.use("asen_agent_start",{prompt:"Return bounded read-only findings in this project"});
 await host.waitNotice(value=>value.includes("ASEN terminó"));
 await new Promise(resolve=>setTimeout(resolve,100));
 const results=host.sent.filter(value=>value.message.customType==="asen.agent.result");
 const wakes=host.sent.filter(value=>value.message.customType==="asen.agent.wake");
 assert.equal(results.length,1,"The original project result was delivered before the workspace changed");
 assert.equal(wakes.length,0,"A delayed wake may never cross project scope despite the same Pi session");
 const entries=(await fileState(home,scope)).rows;
 assert.equal(entries.length,1);assert.equal(entries[0]?.delivery,"enqueued");
 assert.equal(childRuns,1,"No model or child replay may occur for the rejected wake");
 // Restore the owned project before teardown; the drift itself was already observed.
 host.context.cwd=scope.projectId;
 await host.fire("session_shutdown");
});
test("EF-601 unchanged TUI scope still wakes exactly once after the durable enqueue",
 {timeout:35000},async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-ef601-one-owned-wake-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const scope={sessionId:"stable-wake",projectId:await realpath(process.cwd())};
 const host=await open(home,scope,"tui",async id=>({id,ok:true,output:"Read-only result"}));
 await host.use("asen_agent_start",{prompt:"Read one bounded source"});
 await host.waitNotice(value=>value.includes("ASEN terminó"));
 await new Promise(resolve=>setTimeout(resolve,100));
 const results=host.sent.filter(value=>value.message.customType==="asen.agent.result");
 const wakes=host.sent.filter(value=>value.message.customType==="asen.agent.wake");
 assert.equal(results.length,1);assert.equal(results[0]?.options.triggerTurn,false);
 assert.equal(wakes.length,1);assert.equal(wakes[0]?.options.triggerTurn,true);
 assert.equal(wakes[0]?.message.details.projectId,scope.projectId);
 assert.equal((await fileState(home,scope)).rows[0]?.delivery,"enqueued");
 await host.fire("session_shutdown");
});
