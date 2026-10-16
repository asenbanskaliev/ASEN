import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {EventEmitter,once} from "node:events";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {createJsonlQueue,createRpcController,createSecretSanitizer,runCleanup} from "../scripts/eco07-recovery-io.mjs";

function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}

async function within(promise,milliseconds,timeoutValue){
 let timer;
 try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(timeoutValue),milliseconds);})]);}
 finally{clearTimeout(timer);}
}

function fakeTimers(){
 let next=1;
 const pending=new Map();
 return {
  setTimer(callback){const id=next++;pending.set(id,callback);return id;},
  clearTimer(id){pending.delete(id);},
  runNext(){const entry=pending.entries().next().value;assert.ok(entry,"expected a pending timer");pending.delete(entry[0]);entry[1]();},
  get size(){return pending.size;},
 };
}

function fakeChild(){
 const child=new EventEmitter();
 child.exitCode=null;child.signalCode=null;child.writes=[];child.kills=[];child.endCount=0;
 child.stdin=new EventEmitter();
 child.stdin.write=value=>{child.writes.push(value);return true;};
 child.stdin.end=()=>{child.endCount++;};
 child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.kill=signal=>{child.kills.push(signal);return true;};
 return child;
}

test("JSONL queue snapshots sanitized input and serializes write then sync",async()=>{
 const firstWrite=deferred();
 const operations=[];
 let writes=0;
 const file={
  write(line){operations.push(["write",line]);writes++;return writes===1?firstWrite.promise:Promise.resolve();},
  async sync(){operations.push(["sync"]);},
  async close(){operations.push(["close"]);},
 };
 const secret="eco07-real-secret-value";
 const sanitize=createSecretSanitizer(secret);
 const queue=createJsonlQueue({file,now:()=>"fixed",sanitize});
 const details={nested:{value:`before-${secret}`},headers:{authorization:`Bearer ${secret}`},authToken:`prefix-${secret}-suffix`,array:[secret,{note:`embedded-${secret}`}]};
 const original=structuredClone(details);
 const one=queue.record("one",details);
 assert.deepEqual(details,original,"sanitization must not mutate its input");
 const two=queue.record("two",{position:2});
 details.nested.value="after";details.headers.authorization="mutated";
 await Promise.resolve();
 assert.equal(operations.length,1,"a later append must not overlap the first append");
 firstWrite.resolve();
 await Promise.all([one,two]);
 await queue.drainAndClose();
 assert.deepEqual(operations.map(entry=>entry[0]),["write","sync","write","sync","close"]);
 const bytes=operations.filter(entry=>entry[0]==="write").map(entry=>entry[1]).join("");
 assert.equal(bytes.includes(secret),false,"serialized file bytes must not contain the configured secret");
 const rows=bytes.trim().split("\n").map(line=>JSON.parse(line));
 assert.deepEqual(rows,[
  {at:"fixed",kind:"one",nested:{value:"before-[redacted]"},headers:{authorization:"Bearer [redacted]"},authToken:"prefix-[redacted]-suffix",array:["[redacted]",{note:"embedded-[redacted]"}]},
  {at:"fixed",kind:"two",position:2},
 ]);
});

test("JSONL queue propagates write and close failures and permanently rejects new records",async()=>{
 const writeError=new Error("write failed"),closeError=new Error("close failed");
 let closes=0;
 const queue=createJsonlQueue({file:{write:async()=>{throw writeError;},sync:async()=>{},close:async()=>{closes++;throw closeError;}}});
 const write=queue.record("broken");
 await assert.rejects(write,error=>error===writeError);
 const firstDrain=queue.drainAndClose();
 assert.strictEqual(queue.drainAndClose(),firstDrain,"drain must be idempotent");
 await assert.rejects(firstDrain,error=>error instanceof AggregateError&&error.errors.includes(writeError)&&error.errors.includes(closeError));
 assert.equal(closes,1);
 await assert.rejects(queue.record("late"),/closed/u);
});

test("JSONL queue propagates serialization and sync failures through drain",async()=>{
 const serializationError=new Error("cannot sanitize"),syncError=new Error("sync failed");
 const badSanitize=createJsonlQueue({file:{write:async()=>{},sync:async()=>{},close:async()=>{}},sanitize:()=>{throw serializationError;}});
 await assert.rejects(badSanitize.record("broken"),error=>error===serializationError);
 await assert.rejects(badSanitize.drainAndClose(),error=>error===serializationError);
 let closed=false;
 const badSync=createJsonlQueue({file:{write:async()=>{},sync:async()=>{throw syncError;},close:async()=>{closed=true;}}});
 await assert.rejects(badSync.record("broken"),error=>error===syncError);
 await assert.rejects(badSync.drainAndClose(),error=>error===syncError);
 assert.equal(closed,true,"drain must attempt close after a sync failure");
});

test("quota latch rejects pending work and prevents every later write before bounded TERM/KILL cleanup",async()=>{
 const child=fakeChild(),timers=fakeTimers();
 const controller=createRpcController({
  child,label:"test",classifyProviderFailure:value=>value?.quota?"429 quota":undefined,
  redact:value=>String(value),setTimer:timers.setTimer,clearTimer:timers.clearTimer,
  termGraceMs:10,killGraceMs:10,requestTimeoutMs:100,
 });
 const pending=controller.send("prompt",{message:"first"});
 assert.equal(child.writes.length,1);
 assert.equal(controller.observe({quota:true}),"429 quota");
 await assert.rejects(pending,/rate limit.*429 quota/iu);
 await assert.rejects(controller.send("prompt",{message:"late"}),/rate limit/iu);
 await assert.rejects(controller.write({type:"extension_ui_response"}),/rate limit/iu);
 assert.equal(child.writes.length,1,"quota observation must synchronously prevent later prompts and responses");
 assert.equal(child.endCount,1);
 assert.deepEqual(child.kills,["SIGTERM"]);
 timers.runNext();
 assert.deepEqual(child.kills,["SIGTERM","SIGKILL"]);
 timers.runNext();
 const closed=await controller.getClosed();
 assert.deepEqual(closed,{code:null,signal:"SIGKILL",cleanupConfirmed:false});
 assert.equal(timers.size,0);
 assert.equal(child.listenerCount("error"),1,"late errors remain consumed until actual close");
 assert.doesNotThrow(()=>child.emit("error",new Error("late")));
 child.emit("close",null,"SIGKILL");
 assert.equal(child.listenerCount("close"),0);assert.equal(child.listenerCount("error"),0);
});

test("unconfirmed cleanup disposes stream handlers and safely consumes late process errors",async()=>{
 const child=fakeChild(),timers=fakeTimers();
 let observed=0,disposals=0;
 const onData=()=>{observed++;};child.stdout.on("data",onData);
 const controller=createRpcController({child,label:"test",classifyProviderFailure:()=>undefined,setTimer:timers.setTimer,clearTimer:timers.clearTimer,killGraceMs:10,dispose:()=>{disposals++;child.stdout.off("data",onData);}});
 const stopping=controller.stop("SIGKILL");timers.runNext();
 assert.equal((await stopping).cleanupConfirmed,false);
 let lateError;try{child.emit("error",new Error("late"));}catch(error){lateError=error;}
 child.stdout.emit("data","late");
 assert.deepEqual({disposals,observed,lateError},{disposals:1,observed:0,lateError:undefined});
 child.emit("close",null,"SIGKILL");
 assert.equal(child.listenerCount("close"),0);assert.equal(child.listenerCount("error"),0);
});

test("unconfirmed cleanup releases owned handles despite dispose failure and late stream errors",async()=>{
 const child=fakeChild(),timers=fakeTimers(),disposeError=new Error("dispose failed"),foreign=[];
 child.unrefCount=0;child.unref=()=>{child.unrefCount++;};
 for(const stream of [child.stdin,child.stdout,child.stderr]){
  stream.destroyCount=0;stream.unrefCount=0;
  stream.destroy=()=>{stream.destroyCount++;};stream.unref=()=>{stream.unrefCount++;};
 }
 child.stdout.on("error",error=>foreign.push(error.message));
 const queue=createJsonlQueue({file:{write:async()=>{},sync:async()=>{},close:async()=>{}}});
 const onData=()=>{void queue.record("late");};child.stdout.on("data",onData);
 const controller=createRpcController({child,label:"test",classifyProviderFailure:()=>undefined,setTimer:timers.setTimer,clearTimer:timers.clearTimer,killGraceMs:10,dispose:()=>{child.stdout.off("data",onData);throw disposeError;}});
 await queue.drainAndClose();
 const stopping=controller.stop("SIGKILL");timers.runNext();
 const result=await stopping;
 assert.equal(result.cleanupConfirmed,false);assert.ok(result.cleanupErrors.includes(disposeError));
 assert.equal(child.unrefCount,1);
 for(const stream of [child.stdin,child.stdout,child.stderr])assert.deepEqual([stream.destroyCount,stream.unrefCount],[1,1]);
 let unhandled;const onUnhandled=error=>{unhandled=error;};process.once("unhandledRejection",onUnhandled);
 try{child.stdout.emit("data","late");child.stdout.emit("error",new Error("stdout late"));child.stderr.emit("error",new Error("stderr late"));await new Promise(resolve=>setImmediate(resolve));}
 finally{process.removeListener("unhandledRejection",onUnhandled);}
 assert.equal(unhandled,undefined);assert.deepEqual(foreign,["stdout late"]);
 for(const stream of [child.stdin,child.stdout,child.stderr])stream.emit("close");
 child.emit("close",null,"SIGKILL");
 assert.equal(child.listenerCount("error"),0);assert.equal(child.stdout.listenerCount("error"),1,"foreign listener must remain");
 assert.equal(child.stderr.listenerCount("error"),0);assert.equal(child.stdin.listenerCount("error"),0);
});

test("active-handle supervisor exits after unconfirmed owned-child cleanup",async()=>{
 const helper=new URL("../scripts/eco07-recovery-io.mjs",import.meta.url).href;
 const program=`
  const {spawn}=await import("node:child_process");
  const {createRpcController}=await import(${JSON.stringify(helper)});
  const owned=spawn(process.execPath,["-e","setInterval(()=>{},10000)"],{stdio:["pipe","pipe","pipe"]});
  await new Promise((resolve,reject)=>process.send(owned.pid,error=>error?reject(error):resolve()));
  process.disconnect();owned.kill=()=>false;
  const controller=createRpcController({child:owned,label:"fixture",classifyProviderFailure:()=>undefined,killGraceMs:20});
  const result=await controller.stop("SIGKILL");
  if(result.cleanupConfirmed)process.exitCode=2;
 `;
 const supervisor=spawn(process.execPath,["--input-type=module","-e",program],{stdio:["ignore","ignore","ignore","ipc"]});
 const closed=once(supervisor,"close");let ownedPid;
 supervisor.once("message",pid=>{ownedPid=pid;});
 let outcome;
 try{outcome=await within(closed.then(([code,signal])=>({code,signal})),1_200,{timeout:true});}
 finally{
  if(supervisor.exitCode===null&&supervisor.signalCode===null)supervisor.kill("SIGKILL");
  if(ownedPid)try{process.kill(ownedPid,"SIGKILL");}catch(error){if(error?.code!=="ESRCH")throw error;}
  await within(closed,1_000,undefined);
 }
 assert.deepEqual(outcome,{code:0,signal:null});
});

test("asynchronous stdin failure rejects every pending request once",async()=>{
 const child=fakeChild(),callbacks=[];
 child.stdin.write=(value,callback)=>{child.writes.push(value);callbacks.push(callback);return false;};
 const controller=createRpcController({child,label:"test",classifyProviderFailure:()=>undefined});
 const first=controller.send("prompt"),second=controller.send("get_commands");
 assert.ok(callbacks.every(callback=>typeof callback==="function"),"writes must provide completion callbacks");
 callbacks[0](new Error("EPIPE"));callbacks[1](new Error("second EPIPE"));
 child.stdin.emit("error",new Error("stream EPIPE"));
 await assert.rejects(first,/EPIPE/u);await assert.rejects(second,/EPIPE/u);
 assert.equal(child.endCount,1);assert.deepEqual(child.kills,["SIGTERM"]);
 child.emit("close",1,null);await controller.getClosed();
});

test("ordinary RPC responses resolve their matching request and clear its timeout",async()=>{
 const child=fakeChild(),timers=fakeTimers();
 const controller=createRpcController({child,label:"test",classifyProviderFailure:()=>undefined,setTimer:timers.setTimer,clearTimer:timers.clearTimer});
 const request=controller.send("get_commands");
 const {id}=JSON.parse(child.writes[0]);
 controller.observe({type:"response",id,success:true,result:"ok"});
 assert.equal((await request).result,"ok");
 child.emit("close",0,null);
 assert.deepEqual(await controller.getClosed(),{code:0,signal:null,cleanupConfirmed:true});
 assert.equal(timers.size,0);
});

test("confirmed process close cancels quota escalation and shutdown actions remain single-shot",async()=>{
 const child=fakeChild(),timers=fakeTimers();
 child.unref=()=>assert.fail("confirmed close must not unref the child");
 for(const stream of [child.stdin,child.stdout,child.stderr])stream.destroy=()=>assert.fail("confirmed close must not destroy streams");
 const controller=createRpcController({child,label:"test",classifyProviderFailure:()=>"quota",setTimer:timers.setTimer,clearTimer:timers.clearTimer,termGraceMs:10,killGraceMs:10});
 assert.equal(controller.observe({}),"quota");
 assert.equal(controller.observe({}),undefined,"only the first quota classification is reported");
 child.emit("close",7,"SIGTERM");
 assert.deepEqual(await controller.getClosed(),{code:7,signal:"SIGTERM",cleanupConfirmed:true});
 assert.equal(timers.size,0);
 assert.equal(child.endCount,1);
 assert.deepEqual(child.kills,["SIGTERM"]);
});

test("cleanup attempts retain primary, report, and removal failures",async()=>{
 const primary=new Error("primary"),report=new Error("report"),removal=new Error("removal"),attempts=[];
 await assert.rejects(runCleanup(primary,[async()=>{attempts.push("report");throw report;},async()=>{attempts.push("remove");throw removal;}]),error=>error instanceof AggregateError&&error.errors[0]===primary&&error.errors.includes(report)&&error.errors.includes(removal));
 assert.deepEqual(attempts,["report","remove"]);
});

test("E2E wires the existing provider classifier through guarded IO and drains before success evidence",async()=>{
 const source=await readFile(new URL("../scripts/eco07-pi-recovery-e2e.mjs",import.meta.url),"utf8");
 assert.match(source,/createJsonlQueue/);
 assert.match(source,/createRpcController/);
 assert.match(source,/const sanitize=createSecretSanitizer\(apiKey\)/u);
 assert.match(source,/classifyProviderFailure:\s*eco07ProviderRateLimitError/u);
 assert.match(source,/dispose:\(\)=>\{child\.stdout\.off/u);
 assert.match(source,/void recordAsync/u);
 assert.match(source,/await runCleanup\(error/u);
 assert.match(source,/SessionTodoStore\.openProjectScoped\(todoRoot,legacyTodoFile\)/u,"the E2E harness must inspect the same project-scoped Todo store Pi opens");
 assert.match(source,/todoProjectStorageFile\(todoRoot,repository\)/u,"the Pi probe must inspect the exact active project shard");
 assert.match(source,/store\.archived\(todoIdentity\)/u,"the E2E verifier must inspect a completed task after Todo auto-archives it");
 const settleWait=source.indexOf('if(recovered.events.at(-1)?.state==="done"&&second.events.some(event=>event.type==="agent_settled"))'),settleAssert=source.indexOf("const resumedSettled=second.events.findLast"),shutdown=source.indexOf("const completionShutdown");
 assert.ok(settleWait>=0&&settleAssert>settleWait&&shutdown>settleAssert,"the real Pi journey must observe natural agent settlement before shutting down the resumed process");
 assert.match(source,/pipelineTimingsMs/u,"the real Pi receipt must report task transition timings");
 assert.match(source,/processMetrics/u,"the real Pi receipt must report turn and tool-call counts without storing prompts");
 const drain=source.indexOf("await transcript.drainAndClose()"),evidence=source.indexOf("await writeFile(evidencePath");
 assert.ok(drain>=0&&evidence>drain,"successful evidence must follow transcript drain");
 assert.match(source,/transcriptFlushError/u,"failure evidence must retain a distinct flush error");
});

test("ECO-07 real Pi interruption starts from one seeded task and one state transition",async()=>{
 const source=await readFile(new URL("../scripts/eco07-pi-recovery-e2e.mjs",import.meta.url),"utf8");
 assert.match(source,/const initialTask=await \(await openTodoStore\(\)\)\.add\(title,todoIdentity\)/u,"the harness must seed one durable planned Todo");
 assert.match(source,/initialTask\.events\.map\(event=>event\.state\),\["planned"\]/u,"the real Pi call must start from a persisted planned state");
 assert.match(source,/asen_todo_update with \{id: \$\{JSON\.stringify\(initialTask\.taskId\)\}, revision: 1, state: "running"\}/u,"the initial worker prompt must specify the exact one-use state transition");
 assert.match(source,/assert\.deepEqual\(initialTools,\["asen_todo_update"\]/u,"no create/list/review tool may run before interruption");
 assert.match(source,/planned-task-prepared/u,"evidence must preserve the pre-run planned state");
});
