import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AgentRuntime} from "../src/agents/agent-runtime.js";
import type {AgentRequest,AgentRunner} from "../src/agents/dispatcher.js";
import {PersistentAgentStore,parseAgentStore} from "../src/runtime/agent-store.js";

async function fixture(t:import("node:test").TestContext){const dir=await mkdtemp(join(tmpdir(),"asen-agent-store-"));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,"agents.json");}
const owner={kind:"user" as const,id:"pi:session-a"};
function req(id:string,sessionId="session-a",repository="/repo"):AgentRequest{return {id,role:"explorer",prompt:`inspect ${id}`,repository,isolationKey:sessionId,owner};}
async function until(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail("condition did not become true");}

test("persistent queue survives reopen, interrupted work is quarantined and queued work stays pending",async t=>{
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:00.000Z"),pending=req("pending"),running=req("running");
 await store.enqueue(pending,owner);await store.enqueue(running,owner);await store.running("running","2026-10-10T10:00:00.000Z");
 const reopened=await PersistentAgentStore.open(file,()=>"2026-10-10T10:01:00.000Z");
 const rows=await reopened.store.list("session-a","/repo");assert.equal(rows.find(x=>x.id==="pending")?.state,"queued");assert.equal(rows.find(x=>x.id==="running")?.state,"interrupted");
 assert.match((await reopened.store.history("running","session-a","/repo")).at(-1)?.summary??"",/explicit authorization required/);
 assert.equal(await reopened.store.get("pending","session-b","/repo"),undefined);assert.equal(await reopened.store.get("pending","session-a","/other"),undefined);
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
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:00.000Z"),request=req("interrupted"),ownerInput={id:request.id,role:request.role,owner,sessionId:"session-a",projectId:"/repo",createdAt:"2026-10-10T10:00:00.000Z"};
 await store.enqueue(request,owner);await store.running(request.id,"2026-10-10T10:00:01.000Z");
 const recovered=await PersistentAgentStore.open(file,()=>"2026-10-10T10:00:02.000Z"),entry=await recovered.store.get("interrupted","session-a","/repo");assert.ok(entry);const resumed=recovered.store.resumable(entry!);assert.ok(resumed);assert.notEqual(resumed.id,request.id);assert.equal(resumed.parentId,request.id);assert.equal(resumed.role,"explorer");
 await assert.rejects(()=>recovered.store.enqueue({...resumed,writeSurfaces:["src/"]},owner),/Authority-bearing agent requests cannot be serialized/);
 await assert.rejects(()=>recovered.store.queued({...ownerInput,role:"worker"}),/record|Invalid/);
});

test("running cancellation reaches the child runner; session and project boundaries reject cancellation",async t=>{
 const file=await fixture(t);let finish!:()=>void;const runner:AgentRunner={run:async r=>new Promise(resolve=>{finish=()=>resolve({id:r.id,ok:true,output:"late"});})};
 const runtime=await AgentRuntime.open({storeFile:file,runner,maxConcurrency:1}),id=await runtime.startExplorer({prompt:"long",session:{sessionId:"session-a",projectId:"/repo"},owner});
 await until(()=>runtime.snapshot().find(x=>x.id===id)?.state==="running");
 assert.equal(await runtime.cancel(id,{sessionId:"other-session",projectId:"/repo"}),false);assert.equal(await runtime.cancel(id,{sessionId:"session-a",projectId:"/other"}),false);assert.equal(await runtime.cancel(id,{sessionId:"session-a",projectId:"/repo"}),true);
 finish();await until(()=>runtime.snapshot().find(x=>x.id===id)?.state==="cancelled");
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
