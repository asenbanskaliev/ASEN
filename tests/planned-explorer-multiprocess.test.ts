import assert from "node:assert/strict";
import test from "node:test";
import {spawn} from "node:child_process";
import {mkdtemp,realpath,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {SessionTodoStore} from "../src/runtime/todo-store.js";
import {selectSkills} from "../src/skills/registry.js";

test("EF-603 two independent Pi-like processes cannot claim equivalent planned Explorers",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-ef603-exact-process-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const projectId=await realpath(process.cwd()),sessionId="ef603-shared";
 const context={sessionId,projectId},file=join(root,"todos.json");
 const store=await SessionTodoStore.open(file);
 const plan={role:"explorer" as const,skillSelection:{phase:"explore" as const},
  skillPaths:selectSkills({phase:"explore"}).map(x=>x.path)};
 const first=await store.add("Equivalent A",context,undefined,undefined,
  "asen-plan:independent-a:explorer",[],"Inspect frozen project without writing",plan);
 const second=await store.add("Equivalent B",context,undefined,undefined,
  "asen-plan:independent-b:explorer",[],"Inspect frozen project without writing",plan);
 const url=pathToFileURL(join(process.cwd(),"src/runtime/todo-store.ts")).href;
 const childCode=`import {SessionTodoStore} from ${JSON.stringify(url)};
 const s=await SessionTodoStore.open(process.env.ASEN_TEST_TODO_FILE);
 const identity={sessionId:process.env.ASEN_TEST_SESSION,projectId:process.env.ASEN_TEST_PROJECT};
 console.log("READY");
 process.stdin.once("data",async()=>{
  try{await s.withAgentLaunch(process.env.ASEN_TEST_TASK,identity,async()=>{},
   ()=>{console.log("DISPATCHED")});console.log("ACCEPTED");}
  catch(e){console.log("REFUSED:"+String(e?.message??e));}
 });`;
 const spawned=[first.taskId,second.taskId].map(taskId=>{
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childCode],{
   cwd:process.cwd(),
   env:{...process.env,ASEN_TEST_TODO_FILE:file,ASEN_TEST_SESSION:sessionId,
    ASEN_TEST_PROJECT:projectId,ASEN_TEST_TASK:taskId},stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="";
  const ready=new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error("EF-603 child startup timeout: "+stderr)),25000);
   child.stdout.setEncoding("utf8").on("data",chunk=>{
    stdout+=chunk;if(stdout.includes("READY")){clearTimeout(timer);resolve();}
   });
   child.stderr.setEncoding("utf8").on("data",chunk=>stderr+=chunk);
   child.once("error",error=>{clearTimeout(timer);reject(error);});
   child.once("close",code=>{if(!stdout.includes("READY")){clearTimeout(timer);reject(new Error("Child exited before ready: "+code+" "+stderr));}});
  });
  const finished=new Promise<number>((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill();reject(new Error("EF-603 child execution timeout: "+stderr));},30000);
   child.once("close",code=>{clearTimeout(timer);resolve(code??-1);});
  });
  t.after(()=>{if(child.exitCode===null)child.kill();});
  return{child,ready,finished,result:()=>stdout,stderr:()=>stderr};
 });
 await Promise.all(spawned.map(p=>p.ready));
 for(const p of spawned)p.child.stdin.end("GO\n");
 const codes=await Promise.all(spawned.map(p=>p.finished));
 assert.deepEqual(codes,[0,0],spawned.map(p=>p.stderr()).join("\n"));
 const output=spawned.map(p=>p.result());
 assert.equal(output.filter(s=>s.includes("DISPATCHED")).length,1);
 assert.equal(output.filter(s=>s.includes("REFUSED:Equivalent planned Explorer already running")).length,1);
 assert.equal(output.filter(s=>s.includes("ACCEPTED")).length,1);
 const rows=await store.list(context);
 assert.equal(rows.filter(row=>row.current.state==="running").length,1);
 assert.equal(rows.filter(row=>row.current.state==="planned").length,1);
});

test("EF-603 Todo running state cannot be reused as a direct second dispatch permit",async t=>{
 const home=await mkdtemp(join(tmpdir(),"asen-ef603-running-guard-"));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const context={sessionId:"ef603-running",projectId:await realpath(process.cwd())},file=join(home,"todos.json");
 const store=await SessionTodoStore.open(file),task=await store.add("One launch",context);
 let dispatches=0;await store.withAgentLaunch(task.taskId,context,async()=>{},()=>{dispatches++;});
 await assert.rejects(()=>store.withAgentLaunch(task.taskId,context,async()=>{},()=>{dispatches++;}),
  /already running; explicit interrupted-agent recovery required/u);
 const secondProcessView=await SessionTodoStore.open(file);
 await assert.rejects(()=>secondProcessView.withAgentLaunch(task.taskId,context,async()=>{},()=>{dispatches++;}),
  /already running; explicit interrupted-agent recovery required/u);
 assert.equal(dispatches,1);assert.equal((await store.list(context))[0]?.current.state,"running");
});

test("EF-603 planned Explorer fingerprint ignores dependency ordering and skill-selection JSON order, not different models",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-ef603-selection-order-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const context={sessionId:"equivalent-plans",projectId:await realpath(process.cwd())};
 const store=await SessionTodoStore.open(join(root,"todos.json"));
 const p1=await store.add("Prerequisite A",context),p2=await store.add("Prerequisite B",context);
 for(const task of [p1,p2]){
  await store.update(task.taskId,context,1,"running");
  await store.update(task.taskId,context,2,"done");
 }
 const selectionA={phase:"explore" as const,risk:"low" as const,filesTouched:2};
 const selectionB={filesTouched:2,risk:"low" as const,phase:"explore" as const};
 const common={role:"explorer" as const,skillPaths:selectSkills(selectionA).map(s=>s.path)};
 const first=await store.add("Explorer A",context,undefined,undefined,"asen-plan:order-a:explorer",
  [p1.taskId,p2.taskId],"Inspect the same read-only artifact",{...common,skillSelection:selectionA});
 const second=await store.add("Explorer B",context,undefined,undefined,"asen-plan:order-b:explorer",
  [p2.taskId,p1.taskId],"Inspect the same read-only artifact",{...common,skillSelection:selectionB});
 const distinct=await store.add("Explorer other model",context,undefined,undefined,"asen-plan:order-model:explorer",
  [p1.taskId,p2.taskId],"Inspect the same read-only artifact",{...common,skillSelection:selectionA,model:"beam:cloud"});
 let launches=0;
 await store.withAgentLaunch(first.taskId,context,async()=>{},()=>{launches++;});
 await assert.rejects(()=>store.withAgentLaunch(second.taskId,context,async()=>{},()=>{launches++;}),
  /Equivalent planned Explorer already running/u);
 await store.withAgentLaunch(distinct.taskId,context,async()=>{},()=>{launches++;});
 assert.equal(launches,2,"Semantically equivalent metadata is one launch, different model is separate");
 assert.equal((await store.list(context)).find(x=>x.taskId===second.taskId)?.current.state,"planned");
});

