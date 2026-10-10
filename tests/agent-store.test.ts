import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest,AgentRunner} from "../src/agents/dispatcher.js";
import {PersistentAgentStore,parseAgentStore} from "../src/runtime/agent-store.js";

async function fixture(t:import("node:test").TestContext){const dir=await mkdtemp(join(tmpdir(),"asen-agent-store-"));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,"agents.json");}
const owner={kind:"user" as const,id:"pi:session-a"};
function req(id:string,sessionId="session-a",repository="/repo"):AgentRequest{return {id,role:"explorer",prompt:`inspect ${id}`,repository,isolationKey:sessionId,owner};}
async function until(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail("condition did not become true");}

test("persistent queue survives reopen and both queued and running work are quarantined for explicit review",async t=>{
 const file=await fixture(t),child=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"pair"],{encoding:"utf8",timeout:30000});assert.equal(child.status,0,`${child.error?.message??""}\n${child.stderr}`);
 const reopened=await PersistentAgentStore.open(file,()=>"2026-10-10T10:01:00.000Z");
 const rows=await reopened.store.list("session-crash","/repo");assert.equal(rows.find(x=>x.id==="queued-before-crash")?.state,"interrupted");assert.match(rows.find(x=>x.id==="queued-before-crash")?.summary??"",/not dispatched before process restart/);assert.equal(rows.find(x=>x.id==="crash-recovery-task")?.state,"interrupted");
 assert.match((await reopened.store.history("crash-recovery-task","session-crash","/repo")).at(-1)?.summary??"",/explicit authorization required/);
 assert.equal(await reopened.store.get("queued-before-crash","other-session","/repo"),undefined);assert.equal(await reopened.store.get("queued-before-crash","session-crash","/other"),undefined);
});

test("opening a second runtime in a live process does not mark its queued or running agents interrupted",async t=>{
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:00.000Z"),queued=req("live-queued"),running=req("live-running");
 await store.enqueue(queued,owner);await store.enqueue(running,owner);await store.running(running.id,"2026-10-10T10:00:01.000Z");
 const reopened=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:02.000Z"),rows=await reopened.store.list("session-a","/repo");
 assert.equal(rows.find(row=>row.id===queued.id)?.state,"queued");assert.equal(rows.find(row=>row.id===running.id)?.state,"running");
});

test("agent recovery lookup accepts Windows case aliases for the same project root",async t=>{
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file),request=req("case-alias","session-case","C:\\Work\\ASEN");
 await store.enqueue(request,owner);
 const alias=await store.list("session-case","c:/work/asen");
 assert.equal(alias.some(row=>row.id===request.id),process.platform==="win32");
});

test("a process crash after durable dispatch is recovered as interrupted without replay",async t=>{
 const file=await fixture(t),child=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running"],{encoding:"utf8",timeout:30000});
 assert.equal(child.status,0,`${child.error?.message??""}\n${child.stderr}`);
 const recovered=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:02.000Z"),entry=await recovered.store.get("crash-recovery-task","session-crash","/repo");
 assert.equal(entry?.record.state,"interrupted");assert.match(entry?.record.summary??"",/explicit authorization required/);
 assert.equal(entry?.result,undefined);assert.equal(entry?.events.at(-1)?.state,"interrupted");
});

test("completed result and history survive restart only with a bound execution receipt",async t=>{
 const file=await fixture(t);const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:"result retained"})};
 const runtime=await AgentRuntime.open({storeFile:file,runner}),id=await runtime.startExplorer({prompt:"read project",session:{sessionId:"session-a",projectId:"/repo"},owner});
 await until(()=>runtime.snapshot().find(x=>x.id===id)?.state==="completed");
 const reopened=await PersistentAgentStore.open(file),entry=await reopened.store.get(id,"session-a","/repo");assert.equal(entry?.record.state,"completed");assert.equal(entry?.result?.output,"result retained");assert.equal(entry?.events.at(-1)?.state,"completed");
 const raw=await readFile(file,"utf8"),receiptKey=await readFile(`${file}.receipt-key`),parsed=JSON.parse(raw);parsed.entries[0].result.output="forged";assert.throws(()=>parseAgentStore(JSON.stringify(parsed),receiptKey),/Invalid ASEN agent store/);
 parsed.entries[0].result.sha256=createHash("sha256").update(JSON.stringify([id,"session-a","/repo","forged"])).digest("hex");assert.throws(()=>parseAgentStore(JSON.stringify(parsed),receiptKey),/Invalid ASEN agent store/);
 const changedPrompt=JSON.parse(raw);changedPrompt.entries[0].request.prompt="run different work";assert.throws(()=>parseAgentStore(JSON.stringify(changedPrompt),receiptKey),/Invalid ASEN agent store/);
 const changedOwner=JSON.parse(raw);changedOwner.entries[0].record.owner.id="other-agent";assert.throws(()=>parseAgentStore(JSON.stringify(changedOwner),receiptKey),/Invalid ASEN agent store/);
 assert.throws(()=>parseAgentStore(raw),/Invalid ASEN agent store/);
 const impossible=JSON.parse(raw);impossible.entries[0].events[1].state="completed";assert.throws(()=>parseAgentStore(JSON.stringify(impossible)),/Invalid ASEN agent store/);
});

test("only read-only explorer tasks can continue, and each continuation has a new identity",async t=>{
 const file=await fixture(t),child=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running"],{encoding:"utf8",timeout:30000});assert.equal(child.status,0,`${child.error?.message??""}\n${child.stderr}`);
 const recovered=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:02.000Z"),entry=await recovered.store.get("crash-recovery-task","session-crash","/repo");assert.ok(entry);const resumed=recovered.store.resumable(entry!);assert.ok(resumed);assert.notEqual(resumed.id,entry!.record.id);assert.equal(resumed.parentId,entry!.record.id);assert.equal(resumed.role,"explorer");
 await assert.rejects(()=>recovered.store.enqueue({...resumed,writeSurfaces:["src/"]},owner),/Authority-bearing agent requests cannot be serialized/);
 await assert.rejects(()=>recovered.store.enqueue(resumed,owner),/atomic interrupted-task claim/);
 await assert.rejects(()=>recovered.store.queued({...entry!.record,role:"worker"}),/record|Invalid/);
});

test("an interrupted continuation can itself be recovered once without duplicating its earlier attempt",async t=>{
 const file=await fixture(t),session={sessionId:"session-crash",projectId:"/repo"};
 const firstCrash=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running"],{encoding:"utf8",timeout:30000});assert.equal(firstCrash.status,0,`${firstCrash.error?.message??""}\n${firstCrash.stderr}`);
 const recoveredParent=await PersistentAgentStore.open(file),parent=await recoveredParent.store.get("crash-recovery-task",session.sessionId,session.projectId);assert.equal(parent?.record.state,"interrupted");
 const continuationCrash=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"continue-running",parent!.record.id],{encoding:"utf8",timeout:30000});assert.equal(continuationCrash.status,0,`${continuationCrash.error?.message??""}\n${continuationCrash.stderr}`);
 const raw=JSON.parse(await readFile(file,"utf8")) as {entries:Array<{record:{id:string};request:{continuationOf?:string}}>},first=raw.entries.find(entry=>entry.request.continuationOf===parent!.record.id);assert.ok(first);
 const restarted=await PersistentAgentStore.open(file),child=await restarted.store.get(first!.record.id,session.sessionId,session.projectId);assert.equal(child?.record.state,"interrupted");
 const second=await restarted.store.enqueueContinuation(first!.record.id,session.sessionId,session.projectId,owner);
 assert.notEqual(second.id,first!.record.id);assert.equal(second.parentId,first!.record.id);assert.equal((await restarted.store.list(session.sessionId,session.projectId)).filter(row=>row.state==="interrupted").length,2);
 await assert.rejects(()=>restarted.store.enqueueContinuation(first!.record.id,session.sessionId,session.projectId,owner),/already has a continuation/);
});

test("concurrent continuation requests atomically create at most one replacement execution",async t=>{
 const file=await fixture(t),session={sessionId:"session-crash",projectId:"/repo"},crash=spawnSync(process.execPath,["--import","tsx",resolve("tests/fixtures/agent-crash-process.ts"),file,"running"],{encoding:"utf8",timeout:30000});assert.equal(crash.status,0,`${crash.error?.message??""}\n${crash.stderr}`);
 const runner:AgentRunner={run:async r=>({id:r.id,ok:true,output:`continued:${r.id}`})},runtimes=await Promise.all([AgentRuntime.open({storeFile:file,runner}),AgentRuntime.open({storeFile:file,runner})]);
 const attempts=await Promise.allSettled(runtimes.map(runtime=>runtime.continue("crash-recovery-task",session)));
 assert.equal(attempts.filter(result=>result.status==="fulfilled").length,1);assert.equal(attempts.filter(result=>result.status==="rejected").length,1);
 const continuation=attempts.find((result):result is PromiseFulfilledResult<string>=>result.status==="fulfilled")!.value;
 await until(()=>runtimes.some(runtime=>runtime.snapshot().find(record=>record.id===continuation)?.state==="completed"));
 const entries=(await runtimes[0]!.store.list(session.sessionId,session.projectId)).filter(record=>record.id===continuation);
 assert.equal(entries.length,1);assert.equal(entries[0]?.state,"completed");
});

test("running cancellation reaches the child runner; session and project boundaries reject cancellation",async t=>{
 const file=await fixture(t);let cleaned=false;const runner:AgentRunner={run:async (r,signal)=>new Promise(resolve=>{signal?.addEventListener("abort",()=>setTimeout(()=>{cleaned=true;resolve({id:r.id,ok:false,output:"closed"});},10),{once:true});})};
 const runtime=await AgentRuntime.open({storeFile:file,runner,maxConcurrency:1}),id=await runtime.startExplorer({prompt:"long",session:{sessionId:"session-a",projectId:"/repo"},owner});
 await until(()=>runtime.snapshot().find(x=>x.id===id)?.state==="running");
 assert.equal(await runtime.cancel(id,{sessionId:"other-session",projectId:"/repo"}),false);assert.equal(await runtime.cancel(id,{sessionId:"session-a",projectId:"/other"}),false);assert.equal(await runtime.cancel(id,{sessionId:"session-a",projectId:"/repo"}),true);
 assert.equal(cleaned,true);assert.equal(runtime.snapshot().find(x=>x.id===id)?.state,"cancelled");
});

test("session shutdown waits for every cancelled runner to release its resources",async t=>{
 const file=await fixture(t);let cleaned=0,release!:()=>void;const runner:AgentRunner={run:async(request,signal)=>new Promise(resolve=>{const onAbort=()=>setTimeout(()=>{cleaned++;resolve({id:request.id,ok:false,output:"closed"});},15);signal?.addEventListener("abort",onAbort,{once:true});release=()=>resolve({id:request.id,ok:true,output:"late"});})};
 const runtime=await AgentRuntime.open({storeFile:file,runner,maxConcurrency:2}),session={sessionId:"session-a",projectId:"/repo"},ids=await Promise.all(["first","second"].map(prompt=>runtime.startExplorer({prompt,session,owner})));
 await until(()=>runtime.snapshot().filter(row=>ids.includes(row.id)).every(row=>row.state==="running"));await runtime.cancelSession(session);
 assert.equal(cleaned,2);assert.ok(runtime.snapshot().filter(row=>ids.includes(row.id)).every(row=>row.state==="cancelled"));release();
});

test("concurrent Pi tasks obey the configured limit, keep result ownership and persist failures",async t=>{
 const file=await fixture(t);let active=0,maxActive=0,started=0,release!:()=>void;const bothStarted=new Promise<void>(resolve=>{release=resolve;});const runner:AgentRunner={run:async request=>{active++;started++;maxActive=Math.max(maxActive,active);if(started===2)release();await bothStarted;active--;if(request.prompt.includes("fail-"))throw new Error("injected runner failure");return {id:request.id,ok:true,output:`owned:${request.id}`};}};
 const runtime=await AgentRuntime.open({storeFile:file,runner,maxConcurrency:2}),session={sessionId:"session-a",projectId:"/repo"},ids=await Promise.all(["one","fail-two","three","four"].map(prompt=>runtime.startExplorer({prompt,session,owner})));
 await until(()=>runtime.snapshot().filter(record=>ids.includes(record.id)).every(record=>["completed","failed"].includes(record.state)));
 assert.ok(maxActive<=2);assert.equal(maxActive,2);const entries=await Promise.all(ids.map(id=>runtime.store.get(id,session.sessionId,session.projectId)));
 assert.equal(entries.filter(entry=>entry?.record.state==="completed").length,3);assert.equal(entries.filter(entry=>entry?.record.state==="failed").length,1);
 for(const entry of entries.filter(Boolean)){if(entry!.record.state==="completed")assert.equal(entry!.result?.output,`owned:${entry!.record.id}`);else assert.match(entry!.record.summary??"",/injected runner failure/);}
 const reopened=await PersistentAgentStore.open(file);assert.equal((await reopened.store.list(session.sessionId,session.projectId)).filter(record=>ids.includes(record.id)).length,4);
});

test("cancelling a capacity-waiting task removes it from the dispatcher queue",async t=>{
 const file=await fixture(t);let release!:()=>void,calls=0;const runner:AgentRunner={run:async request=>{calls++;if(request.prompt==="hold")await new Promise<void>(resolve=>{release=()=>resolve();});return {id:request.id,ok:true,output:request.prompt};}};
 const runtime=await AgentRuntime.open({storeFile:file,runner,maxConcurrency:1}),session={sessionId:"session-a",projectId:"/repo"},first=await runtime.startExplorer({prompt:"hold",session});await until(()=>runtime.snapshot().find(record=>record.id===first)?.state==="running");
 const second=await runtime.startExplorer({prompt:"must not execute",session});await until(()=>runtime.store.snapshot().filter(record=>record.state==="queued").some(record=>record.id===second));assert.equal(await runtime.cancel(second,session),true);await until(()=>runtime.snapshot().find(record=>record.id===second)?.state==="cancelled");
 release();await until(()=>runtime.snapshot().find(record=>record.id===first)?.state==="completed");assert.equal(calls,1);
});

test("corrupt agent store is quarantined instead of resetting over the damaged file",async t=>{
 const file=await fixture(t);await writeFile(file,"{broken",{mode:0o600});const opened=await PersistentAgentStore.open(file);assert.ok(opened.quarantined);assert.equal((await readFile(opened.quarantined!,"utf8")),"{broken");assert.deepEqual(opened.store.snapshot(),[]);
});

test("concurrent writers preserve every unique task under the cross-process file lock",async t=>{
 const file=await fixture(t),stores=await Promise.all(Array.from({length:8},()=>PersistentAgentStore.open(file))),tasks=Array.from({length:8},(_,i)=>stores[i]!.store.enqueue(req(`parallel-${i}`),owner));await Promise.all(tasks);
 const reopened=await PersistentAgentStore.open(file);assert.equal((await reopened.store.list("session-a","/repo")).length,8);
 await assert.rejects(()=>reopened.store.enqueue(req("parallel-1"),owner),/already exists/);
});

test("a completed task missing its receipt is interrupted without losing verified completed results",async t=>{
 const file=await fixture(t),runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:`valid:${request.id}`})},runtime=await AgentRuntime.open({storeFile:file,runner}),session={sessionId:"session-a",projectId:"/repo"};
 const ids=await Promise.all(["missing-receipt","invalid-receipt","verified"].map(prompt=>runtime.startExplorer({prompt,session,owner})));await until(()=>runtime.snapshot().filter(row=>ids.includes(row.id)).every(row=>row.state==="completed"));
 const parsed=JSON.parse(await readFile(file,"utf8"));delete parsed.entries.find((entry:{record:{id:string}})=>entry.record.id===ids[0])!.result;parsed.entries.find((entry:{record:{id:string}})=>entry.record.id===ids[1])!.result.sha256="0".repeat(64);await writeFile(file,`${JSON.stringify(parsed)}\n`,{mode:0o600});
 const reopened=await PersistentAgentStore.open(file),rows=await reopened.store.list(session.sessionId,session.projectId),unverified=await reopened.store.get(ids[0]!,session.sessionId,session.projectId),invalid=await reopened.store.get(ids[1]!,session.sessionId,session.projectId),verified=await reopened.store.get(ids[2]!,session.sessionId,session.projectId);
 for(const id of ids.slice(0,2))assert.equal(rows.find(row=>row.id===id)?.state,"interrupted");for(const entry of [unverified,invalid]){assert.match(entry?.record.summary??"",/Unverified completion after restart/);assert.equal(entry?.result,undefined);}
 assert.equal(verified?.record.state,"completed");assert.equal(verified?.result?.output,`valid:${ids[2]}`);
});
