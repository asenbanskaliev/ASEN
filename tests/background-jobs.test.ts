import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {BackgroundJobRegistry,backgroundJobTerminalNotification,formatBackgroundJobStatus} from "../src/runtime/background-jobs.js";
import {BackgroundJobJournal} from "../src/runtime/background-job-journal.js";

test("bounds output, emits completion once, and keeps session isolation",()=>{
 const registry=new BackgroundJobRegistry(),events=[] as string[],job=registry.start({sessionId:"s1",command:"long",maxTailLines:2,maxLineChars:4});
 registry.subscribe(job.id,event=>events.push(event.kind));registry.append(job.id,"abcdef\nhello\nlast");registry.finish(job.id,"completed",0);
 const snapshot=registry.snapshot(job.id);assert.deepEqual(snapshot.tail,["ello","last"]);assert.equal(snapshot.state,"completed");assert.deepEqual(events,["line","line","line","completed"]);assert.equal(registry.list("s2").length,0);
});

test("stops a session's running jobs and rejects later output",async()=>{
 const registry=new BackgroundJobRegistry(),job=registry.start({sessionId:"s1",command:"watch"});registry.stop(job.id);assert.equal(registry.snapshot(job.id).state,"stopped");assert.throws(()=>registry.append(job.id,"late"),/not running/);await registry.disposeSession("s1");assert.equal(registry.list("s1").length,0);
});

test("session disposal waits for process close before deleting job state",async()=>{
 const registry=new BackgroundJobRegistry(),{job,done}=registry.run({sessionId:"dispose",command:process.execPath,args:["-e","setTimeout(()=>{},10000)"]});
 await registry.disposeSession("dispose");
 assert.equal((await done).state,"stopped");
 assert.equal(registry.list("dispose").length,0);
});

test("session disposal is bounded when an executor ignores abort and retains state until settlement",async()=>{
 let settle!:()=>void;
 const registry=new BackgroundJobRegistry(undefined,()=>new Promise(resolve=>{settle=()=>resolve({exitCode:0});}),20),{job,done}=registry.run({sessionId:"stuck",command:"long-running"});
 const started=Date.now();await registry.disposeSession("stuck");assert.ok(Date.now()-started<500);assert.equal(registry.snapshot(job.id).state,"stopped");assert.equal(registry.list("stuck").length,1);
 settle();await done;await new Promise(resolve=>setImmediate(resolve));assert.equal(registry.list("stuck").length,0);
});

test("spawn errors settle the job result and do not leave shutdown waiting",async()=>{
 const registry=new BackgroundJobRegistry(),{done}=registry.run({sessionId:"spawn-error",command:"asen-command-that-does-not-exist-7a1d"});
 assert.equal((await done).state,"failed");await registry.disposeSession("spawn-error");assert.equal(registry.list("spawn-error").length,0);
});

test("synchronous spawn setup failures become failed jobs instead of stranded running records",async()=>{
 const registry=new BackgroundJobRegistry(),{job,done}=registry.run({sessionId:"spawn-sync-error",command:process.execPath,cwd:42 as unknown as string});
 assert.equal((await done).state,"failed");await registry.disposeSession("spawn-sync-error");assert.equal(registry.list("spawn-sync-error").length,0);
 assert.equal(job.sessionId,"spawn-sync-error");
});

test("fails closed on an event flood",()=>{
 const registry=new BackgroundJobRegistry(),job=registry.start({sessionId:"s1",command:"monitor",maxEventsPerMinute:2});registry.append(job.id,"1\n2\n3");assert.equal(registry.snapshot(job.id).state,"flooded");
});

test("bounds running jobs globally and per Pi session",()=>{
 const registry=new BackgroundJobRegistry();
 for(let index=0;index<BackgroundJobRegistry.maxRunningJobsPerSession;index++)registry.start({sessionId:"same",command:`job-${index}`});
 assert.throws(()=>registry.start({sessionId:"same",command:"overflow-session"}),/concurrency limit/);
 for(let index=1;index<BackgroundJobRegistry.maxRunningJobs/BackgroundJobRegistry.maxRunningJobsPerSession;index++)for(let count=0;count<BackgroundJobRegistry.maxRunningJobsPerSession;count++)registry.start({sessionId:`session-${index}`,command:`job-${index}-${count}`});
 assert.equal(registry.list("other").length,0);assert.throws(()=>registry.start({sessionId:"new-session",command:"overflow-global"}),/concurrency limit/);
});

test("bounds retained terminal jobs per session and globally",()=>{
 const registry=new BackgroundJobRegistry();
 for(let index=0;index<BackgroundJobRegistry.maxRetainedJobsPerSession+3;index++){const job=registry.start({sessionId:"retained",command:`job-${index}`});registry.finish(job.id,"completed",0);}
 assert.equal(registry.list("retained").length,BackgroundJobRegistry.maxRetainedJobsPerSession);
 for(let index=0;index<6;index++)for(let count=0;count<BackgroundJobRegistry.maxRetainedJobsPerSession;count++){const job=registry.start({sessionId:`session-${index}`,command:`global-${index}-${count}`});registry.finish(job.id,"completed",0);}
 assert.ok([...Array(6).keys()].every(index=>registry.list(`session-${index}`).length<=BackgroundJobRegistry.maxRetainedJobsPerSession));
 const retained=registry.list("retained").length+[...Array(6).keys()].reduce((count,index)=>count+registry.list(`session-${index}`).length,0);
 assert.equal(retained,BackgroundJobRegistry.maxRetainedJobs);
});

test("background job status is isolated by both session and project",()=>{
 const registry=new BackgroundJobRegistry(),one=registry.start({sessionId:"same-session",projectId:"/project/a",command:"a"}),two=registry.start({sessionId:"same-session",projectId:"/project/b",command:"b"});
 assert.deepEqual(registry.list("same-session","/project/a").map(job=>job.id),[one.id]);assert.deepEqual(registry.list("same-session","/project/b").map(job=>job.id),[two.id]);
});

test("journal-backed registry reports a running job as interrupted after restart without replay",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-background-journal-restart-"));t.after(()=>rm(root,{recursive:true,force:true}));const journal=new BackgroundJobJournal(path.join(root,"jobs.json"));let starts=0,settle!:(value:{exitCode:number|null})=>void;
 const first=new BackgroundJobRegistry(journal,async()=>{starts++;return new Promise(resolve=>{settle=resolve;});}),running=first.run({sessionId:"s",projectId:"p",command:"run-once"});
 const restarted=new BackgroundJobRegistry(journal),recovered=restarted.list("s","p");assert.equal(starts,1);assert.equal(recovered.length,1);assert.equal(recovered[0]?.id,running.job.id);assert.equal(recovered[0]?.state,"interrupted");assert.equal((recovered[0] as typeof recovered[number]&{resumable?:boolean}).resumable,false);settle({exitCode:0});assert.equal((await running.done).state,"completed");
});

test("runs a real contained child and records its exit",async()=>{
 const registry=new BackgroundJobRegistry(),child=registry.run({sessionId:"real",command:process.execPath,args:["-e","process.stdout.write('ok\\n')"]});
 const result=await child.done;assert.equal(result.state,"completed");assert.equal(result.exitCode,0);assert.deepEqual(result.tail,["ok"]);
});

test("timeout terminates a real child",async()=>{
 const registry=new BackgroundJobRegistry(),child=registry.run({sessionId:"timeout",command:process.execPath,args:["-e","setTimeout(()=>{},10000)"],timeoutMs:50});
 const result=await child.done;assert.equal(result.state,"timed_out");
});


test("T10 scoped subscriptions reject cross-session and cross-project observers",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",projectId:"project-a",command:"task"});
 const received:string[]=[];
 assert.throws(()=>registry.subscribeScoped(job.id,"intruder","project-a",()=>{}),/does not belong/);
 assert.throws(()=>registry.subscribeScoped(job.id,"owner","project-b",()=>{}),/does not belong/);
 assert.throws(()=>registry.subscribeScoped(job.id,"","project-a",()=>{}),/scope is invalid/);
 const unsubscribe=registry.subscribeScoped(job.id,"owner","project-a",event=>received.push(event.kind));
 registry.append(job.id,"output");registry.finish(job.id,"completed",0);
 unsubscribe();
 assert.deepEqual(received,["line","completed"]);
});

test("T10 scoped snapshots and cancellation reject cross-session and cross-project access",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",projectId:"a",command:"long"});
 assert.throws(()=>registry.snapshotScoped(job.id,"intruder","a"),/does not belong/);
 assert.throws(()=>registry.snapshotScoped(job.id,"owner","b"),/does not belong/);
 assert.throws(()=>registry.stopScoped(job.id,"intruder","a"),/does not belong/);
 assert.throws(()=>registry.stopScoped(job.id,"owner","b"),/does not belong/);
 assert.equal(registry.snapshotScoped(job.id,"owner","a").state,"running");
 registry.stopScoped(job.id,"owner","a");
 assert.equal(registry.snapshotScoped(job.id,"owner","a").state,"stopped");
});

test("T10 notifications use observed terminal state and stable identity",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",projectId:"p",command:"task"});
 assert.equal(backgroundJobTerminalNotification(job),null);
 registry.finish(job.id,"failed",7);
 const observed=registry.snapshot(job.id);
 const first=backgroundJobTerminalNotification(observed);
 assert.ok(first);assert.match(first.message,/Failed/);assert.match(first.message,/exit code 7/);
 assert.deepEqual(backgroundJobTerminalNotification(observed),first);
});
test("T10 accessible status is bounded and requires no color or terminal controls",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",command:"task"});
 registry.finish(job.id,"completed",0);
 const status=formatBackgroundJobStatus(registry.snapshot(job.id),24);
 assert.ok(status.length<=24);assert.doesNotMatch(status,/\\x1b/);
 assert.match(formatBackgroundJobStatus(registry.snapshot(job.id)),/Succeeded/);
 assert.throws(()=>formatBackgroundJobStatus(registry.snapshot(job.id),10),/width/);
});

test("T10 terminal notification identity does not change on subsequent status updates",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",projectId:"project",command:"task"});
 registry.finish(job.id,"failed",1);
 const initial=backgroundJobTerminalNotification(registry.snapshot(job.id));
 assert.ok(initial);
 registry.setDeliveryState(job.id,"pending","retry");
 const retried=backgroundJobTerminalNotification(registry.snapshot(job.id));
 assert.equal(initial.id,retried?.id);
});
test("T10 accessible output removes terminal controls from untrusted job identity",()=>{
 const registry=new BackgroundJobRegistry();
 const job=registry.start({sessionId:"owner",projectId:"project",command:"task"});
 assert.doesNotMatch(formatBackgroundJobStatus({...job,id:"unsafe\\x1b[31m\\nnext"}),/[\x00-\x1f\x7f-\x9f]/u);
});
