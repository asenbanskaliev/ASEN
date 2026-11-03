import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {selectSkills} from "../src/skills/registry.js";

async function fixture(t:import("node:test").TestContext,hold=false){
 const home=await mkdtemp(join(tmpdir(),"asen-planned-direct-"));
 const identity={sessionId:"planned-direct-session",projectId:await realpath(process.cwd())};
 const todos=await SessionTodoStore.open(join(home,"todos.json"));
 const events=new Map<string,Function[]>(),tools=new Map<string,any>();
 let launches=0,release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 const pi={on:(name:string,fn:Function)=>events.set(name,[...(events.get(name)??[]),fn]),
  registerTool:(tool:any)=>tools.set(tool.name,tool),registerCommand:()=>{},getCommands:()=>[],getAllTools:()=>[],
  sendMessage:()=>{}};
 const context={mode:"rpc",hasUI:true,cwd:identity.projectId,sessionManager:{getSessionId:()=>identity.sessionId},
  ui:{notify:()=>{},confirm:async()=>true,setWidget:()=>{}}};
 createAsenExtension({homeDir:()=>home,enableAgentRuntime:true,enableTodoRuntime:true,enableMemoryRuntime:false,
  todoStoreFactory:async()=>todos,agentStoreFile:join(home,"agents.json"),autoAdvancePlans:false,
  agentRunner:{run:async (request:{id:string})=>{launches++;if(hold)await barrier;return{id:request.id,ok:true,output:"Read-only fixture result"};}}})(pi as any);
 await Promise.all((events.get("session_start")??[]).map(start=>start({},context)));
 t.after(async()=>{
  release();
  for(const shutdown of events.get("session_shutdown")??[])await shutdown({},context);
  await rm(home,{recursive:true,force:true,maxRetries:6,retryDelay:100});
 });
 const selection={phase:"explore" as const};
 const paths=selectSkills(selection).map(skill=>skill.path);
 const create=async(id:string,candidateRevision?:string,prompt="Read the exact planned project scope")=>todos.add("Inspect locked candidate",identity,undefined,undefined,
  "asen-plan:"+id+":explorer",[],prompt,
  {role:"explorer",skillPaths:paths,skillSelection:selection,...(candidateRevision?{candidateRevision}:{})});
 const start=(taskId:string,prompt="Read the exact planned project scope")=>tools.get("asen_agent_start").execute("planned-direct",{prompt,todoId:taskId},new AbortController().signal,()=>{},context);
 return {home,identity,todos,create,start,getLaunches:()=>launches,tools,context};
}

test("EF-603 two simultaneous public starts of the same persisted plan have one durable launch",async t=>{
 const f=await fixture(t,true),task=await f.create("same-task");
 const outcomes=await Promise.allSettled([f.start(task.taskId),f.start(task.taskId)]);
 assert.equal(outcomes.filter(row=>row.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(row=>row.status==="rejected").length,1);
 assert.equal((await f.todos.list(f.identity)).find(row=>row.taskId===task.taskId)?.current.state,"running");
 const tasks=(await f.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},f.context)).details;
 assert.equal(tasks.length,1,"only the exact owned planned Explorer may be enqueued");
 assert.ok(f.getLaunches()<=1,"at most one runner can start for one planned identity");
 await assert.rejects(()=>f.start(task.taskId),/unclaimed|reconcile/i);
});

test("EF-103 public Todo route rejects a stale candidate before enqueue or agent execution",async t=>{
 const f=await fixture(t),task=await f.create("stale-candidate","0".repeat(40));
 await assert.rejects(()=>f.start(task.taskId),/candidate changed/u);
 assert.equal(f.getLaunches(),0);
 assert.equal((await f.todos.list(f.identity))[0]?.current.state,"planned");
 const agents=(await f.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},f.context)).details;
 assert.deepEqual(agents,[]);
});

test("EF-603 public plan start binds a real HEAD candidate and refuses a second launch",async t=>{
 const f=await fixture(t,true);
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:f.identity.projectId,encoding:"utf8"}).trim();
 const task=await f.create("bound-head",head);
 const result=await f.start(task.taskId);
 assert.equal(result.details.todoId,task.taskId);
 await assert.rejects(()=>f.start(task.taskId),/unclaimed|reconcile/i);
 assert.equal((await f.todos.list(f.identity))[0]?.current.state,"running");
});

test("EF-603 two different Todo IDs with identical Explorer scope cannot start twice across the journal lock",async t=>{
 const f=await fixture(t,true),first=await f.create("semantic-a"),second=await f.create("semantic-b");
 const outcomes=await Promise.allSettled([f.start(first.taskId),f.start(second.taskId)]);
 assert.equal(outcomes.filter(o=>o.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(o=>o.status==="rejected").length,1);
 const failure=outcomes.find(o=>o.status==="rejected");
 assert.match(String(failure&&"reason" in failure?failure.reason:""),/Equivalent planned Explorer already running/);
 const rows=await f.todos.list(f.identity);
 assert.equal(rows.filter(row=>row.current.state==="running").length,1);
 assert.equal(rows.filter(row=>row.current.state==="planned").length,1);
 const agents=(await f.tools.get("asen_agent_status").execute("status",{},new AbortController().signal,()=>{},f.context)).details;
 assert.equal(agents.length,1);
 assert.ok(f.getLaunches()<=1);
});
test("EF-603 genuinely different Explorer instructions retain independent read-only dispatch",async t=>{
 const f=await fixture(t,true);
 const first=await f.create("different-a",undefined,"Inspect endpoint A without changes");
 const second=await f.create("different-b",undefined,"Inspect endpoint B without changes");
 const rows=await Promise.all([f.start(first.taskId,"Inspect endpoint A without changes"),
  f.start(second.taskId,"Inspect endpoint B without changes")]);
 assert.equal(rows.length,2);
 assert.equal((await f.todos.list(f.identity)).filter(row=>row.current.state==="running").length,2);
});
