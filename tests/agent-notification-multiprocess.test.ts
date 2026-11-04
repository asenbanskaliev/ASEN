import assert from "node:assert/strict";
import test from "node:test";
import {spawn} from "node:child_process";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {AgentNotificationJournal} from "../src/runtime/agent-notification-journal.js";

/** Node child processes share only the durable journal. No Pi model, tool or
 * human consent is simulated. Enqueue != parent turn consumption. */
test("EF-601/604 two independent processes record and claim one exact terminal notice",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-agent-notice-multiprocess-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const file=join(root,"notices.json"),projectId=join(root,"project");
 await mkdir(projectId);
 const subject={id:"agent-one",sessionId:"session-1",projectId,state:"completed"};
 const moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/agent-notification-journal.ts")).href;
 const childCode=`import {AgentNotificationJournal} from ${JSON.stringify(moduleUrl)};
 const journal=new AgentNotificationJournal(process.env.ASEN_TEST_NOTICE_FILE);
 const subject=JSON.parse(process.env.ASEN_TEST_NOTICE_SUBJECT);
 console.log("READY");
 process.stdin.once("data",async()=>{
  try{
   const notice=await journal.record(subject);
   const claimed=await journal.claim(notice.eventId,subject);
   if(claimed)await journal.markEnqueued(notice.eventId,subject);
   console.log("RESULT:"+JSON.stringify({eventId:notice.eventId,claimed}));
  }catch(error){console.error("CHILD_FAIL:"+String(error?.message??error));process.exitCode=1;}
 });`;
 function launch(){
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childCode],{
   cwd:process.cwd(),
   env:{...process.env,ASEN_TEST_NOTICE_FILE:file,
    ASEN_TEST_NOTICE_SUBJECT:JSON.stringify(subject)},
   stdio:["pipe","pipe","pipe"],windowsHide:true,
  });
  let stdout="",stderr="";
  child.stdout.setEncoding("utf8").on("data",(s:string)=>stdout+=s);
  child.stderr.setEncoding("utf8").on("data",(s:string)=>stderr+=s);
  const ready=new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error("Timed out before process ready: "+stderr)),25000);
   child.stdout.on("data",()=>{
    if(stdout.includes("READY")){clearTimeout(timeout);resolve();}
   });
   child.once("error",e=>{clearTimeout(timeout);reject(e);});
   child.once("close",code=>{if(!stdout.includes("READY")){clearTimeout(timeout);reject(Error("Exited early: "+code+" "+stderr));}});
  });
  const finished=new Promise<number>((resolve,reject)=>{
   const timeout=setTimeout(()=>{child.kill();reject(Error("Terminal notice child timed out: "+stderr));},30000);
   child.once("close",code=>{clearTimeout(timeout);resolve(code??-1);});
   child.once("error",e=>{clearTimeout(timeout);reject(e);});
  });
  t.after(()=>{if(child.exitCode===null)child.kill();});
  return {child,ready,finished,stdout:()=>stdout,stderr:()=>stderr};
 }
 const workers=[launch(),launch()];
 await Promise.all(workers.map(w=>w.ready));
 for(const w of workers)w.child.stdin.end("START\n");
 const exits=await Promise.all(workers.map(w=>w.finished));
 assert.deepEqual(exits,[0,0],workers.map(w=>w.stderr()).join("\n"));
 const outputs=workers.map(w=>{
  const line=w.stdout().split(/\r?\n/u).find(s=>s.startsWith("RESULT:"));
  assert.ok(line,"A real process must report its terminal notice claim");
  return JSON.parse(line.slice(7)) as {eventId:string;claimed:boolean};
 });
 assert.equal(new Set(outputs.map(x=>x.eventId)).size,1,"Same terminal identity must reuse one durable event");
 assert.equal(outputs.filter(x=>x.claimed).length,1,"At most one process may enqueue");
 const ledger=new AgentNotificationJournal(file);
 const notices=await ledger.list(subject);
 assert.equal(notices.length,1);
 assert.equal(notices[0]?.delivery,"enqueued","Enqueued is not a Pi-consumed result");
 assert.equal("consumed" in (notices[0]??{}),false);
 assert.equal(await ledger.claim(notices[0]!.eventId,subject),false);
 await assert.rejects(()=>ledger.acknowledge(notices[0]!.eventId,
  {...subject,sessionId:"unrelated"},subject.id,"completed"),/owned terminal/);
 assert.equal((await ledger.list(subject))[0]?.delivery,"enqueued");
});


test("EF-601/604 two independent coordinators cannot both acknowledge one terminal result",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-agent-notice-ack-race-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 const file=join(root,"notices.json"),projectId=join(root,"project");
 await mkdir(projectId);
 const subject={id:"agent-ack-race",sessionId:"session-ack-race",projectId,state:"completed"};
 const journal=new AgentNotificationJournal(file);
 const row=await journal.record(subject);
 assert.equal(await journal.claim(row.eventId,subject),true);
 assert.equal(await journal.markEnqueued(row.eventId,subject),true);
 const moduleUrl=pathToFileURL(join(process.cwd(),"src/runtime/agent-notification-journal.ts")).href;
 const childCode=`import {AgentNotificationJournal} from ${JSON.stringify(moduleUrl)};
 const journal=new AgentNotificationJournal(process.env.ASEN_TEST_NOTICE_FILE);
 const subject=JSON.parse(process.env.ASEN_TEST_NOTICE_SUBJECT);
 const eventId=process.env.ASEN_TEST_NOTICE_EVENT;
 console.log("READY");
 process.stdin.once("data",async()=>{
  try{
   const acknowledged=await journal.acknowledge(eventId,subject,subject.id,"completed");
   console.log("ACK:"+JSON.stringify({acknowledged}));
  }catch(error){console.error("CHILD_FAIL:"+String(error?.message??error));process.exitCode=1;}
 });`;
 function launch(){
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",childCode],{
   cwd:process.cwd(),env:{...process.env,ASEN_TEST_NOTICE_FILE:file,
    ASEN_TEST_NOTICE_SUBJECT:JSON.stringify(subject),ASEN_TEST_NOTICE_EVENT:row.eventId},
   stdio:["pipe","pipe","pipe"],windowsHide:true,
  });
  let stdout="",stderr="";
  child.stdout.setEncoding("utf8").on("data",(s:string)=>stdout+=s);
  child.stderr.setEncoding("utf8").on("data",(s:string)=>stderr+=s);
  const ready=new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error("Timed out before ack process ready: "+stderr)),25000);
   child.stdout.on("data",()=>{
    if(stdout.includes("READY")){clearTimeout(timeout);resolve();}
   });
   child.once("error",e=>{clearTimeout(timeout);reject(e);});
   child.once("close",code=>{if(!stdout.includes("READY")){clearTimeout(timeout);reject(Error("Ack process exited early: "+code+" "+stderr));}});
  });
  const finished=new Promise<number>((resolve,reject)=>{
   const timeout=setTimeout(()=>{child.kill();reject(Error("Ack process timed out: "+stderr));},30000);
   child.once("close",code=>{clearTimeout(timeout);resolve(code??-1);});
   child.once("error",e=>{clearTimeout(timeout);reject(e);});
  });
  t.after(()=>{if(child.exitCode===null)child.kill();});
  return {child,ready,finished,stdout:()=>stdout,stderr:()=>stderr};
 }
 const coordinators=[launch(),launch()];
 await Promise.all(coordinators.map(x=>x.ready));
 for(const coordinator of coordinators)coordinator.child.stdin.end("ACK\\n");
 const exits=await Promise.all(coordinators.map(x=>x.finished));
 assert.deepEqual(exits,[0,0],coordinators.map(x=>x.stderr()).join("\\n"));
 const outcomes=coordinators.map(coordinator=>{
  const line=coordinator.stdout().split(/\\r?\\n/u).find(value=>value.startsWith("ACK:"));
  assert.ok(line,"An independent coordinator must report its journal result");
  return JSON.parse(line.slice(4)) as {acknowledged:boolean};
 });
 assert.deepEqual(outcomes.map(x=>x.acknowledged).sort(),[false,true],
  "The lock/CAS must admit exactly one acknowledgement; a duplicate is idempotently rejected");
 assert.equal((await new AgentNotificationJournal(file).list(subject))[0]?.delivery,"acknowledged");
});
