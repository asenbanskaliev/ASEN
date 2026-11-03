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
