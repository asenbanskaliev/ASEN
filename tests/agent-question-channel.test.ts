import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {AgentRequest} from "../src/agents/dispatcher.js";
import type {PublicAgentRecord} from "../src/runtime/agent-lifecycle.js";
import {PersistentAgentStore,parseAgentStore,type AgentPendingQuestion} from "../src/runtime/agent-store.js";

const owner={kind:"user" as const,id:"pi:session-a"},SESSION="session-a",PROJECT="/repo";
/** Deterministic one-second-per-step clock; every durable leg needs a strictly later stamp. */
function clock(start=Date.parse("2026-10-10T10:00:00.000Z")):()=>string{let step=0;return()=>new Date(start+step++*1000).toISOString();}
function req(id:string):AgentRequest{return {id,role:"explorer",prompt:`inspect ${id}`,repository:PROJECT,isolationKey:SESSION,owner};}
async function fixture(t:import("node:test").TestContext){const dir=await mkdtemp(join(tmpdir(),"asen-agent-question-"));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,"agents.json");}
async function runningAgent(t:import("node:test").TestContext,id="child-1"){const file=await fixture(t),{store}=await PersistentAgentStore.open(file,clock());await store.enqueue(req(id),owner);await store.running(id);return {file,store,id};}

/** The shared lifecycle union does not model the question channel yet, so store projections are read through local casts. */
type WaitingRecord=Omit<PublicAgentRecord,"state"|"pendingQuestion"> & {state:string;pendingQuestion?:AgentPendingQuestion};
const asWaiting=(record:PublicAgentRecord|undefined):WaitingRecord|undefined=>record as unknown as WaitingRecord|undefined;
const questionOf=(record:PublicAgentRecord|undefined):AgentPendingQuestion|undefined=>asWaiting(record)?.pendingQuestion;
const stateOf=(record:PublicAgentRecord|undefined):string=>String(asWaiting(record)?.state);
const journal=async(store:PersistentAgentStore,id:string):Promise<string[]>=>(await store.history(id,SESSION,PROJECT)).map(event=>String(event.state));

/** Reaps one short-lived child process and returns its now-dead pid, the durable stand-in for lost ownership. */
function exitedPid():number{
 const child=spawnSync(process.execPath,["-e","process.exit(0)"],{timeout:30000});
 assert.equal(child.status,0,`${child.error?.message??""}\n${child.stderr}`);
 const pid=child.pid!;assert.ok(pid>0,"the fixture child reported a pid");
 for(let attempt=0;attempt<200;attempt++){
  try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code!=="EPERM")return pid;}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
 }
 throw new Error("the fixture child process was still observable after exiting");
}

test("askQuestion parks a running child in waiting with one durable pending question",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Should I reuse the existing store helper?"),true);
 const entry=await store.get(id,SESSION,PROJECT);
 assert.equal(stateOf(entry?.record),"waiting");
 const question=questionOf(entry?.record);
 assert.ok(question,"the waiting record carries its pending question");
 assert.equal(question.text,"Should I reuse the existing store helper?");
 assert.equal(typeof question.id,"string");assert.ok(question.id.length>0&&question.id!==id,"the question has its own identity");
 assert.ok(Number.isSafeInteger(question.askedAt)&&question.askedAt>0,"the question records when it was asked");
 assert.equal(questionOf(entry!.record)!.askedAt,Date.parse((await store.history(id,SESSION,PROJECT)).at(-1)!.at));
 assert.deepEqual(await journal(store,id),["queued","running","waiting"]);
 const raw=JSON.parse(await readFile(file,"utf8"));
 assert.equal(raw.entries[0].record.state,"waiting");
 assert.equal(raw.entries[0].record.pendingQuestion.text,"Should I reuse the existing store helper?");
 assert.equal(asWaiting((await store.list(SESSION,PROJECT)).find(row=>row.id===id))!==undefined,true,"the waiting child stays listed in its own session");
});

test("askQuestion returns false for queued, already waiting or terminal children and leaves their records unchanged",async t=>{
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file,clock());
 await store.enqueue(req("queued-child"),owner);
 await store.enqueue(req("running-child"),owner);await store.running("running-child");
 await store.enqueue(req("terminal-child"),owner);await store.running("terminal-child");await store.failed("terminal-child","runner failed");
 assert.equal(await store.askQuestion("running-child",SESSION,PROJECT,"First question?"),true);
 assert.equal(await store.askQuestion("running-child",SESSION,PROJECT,"Second question?"),false,"a waiting child cannot stack a second question");
 assert.equal(await store.askQuestion("queued-child",SESSION,PROJECT,"Too early?"),false,"only a running child may ask");
 assert.equal(await store.askQuestion("terminal-child",SESSION,PROJECT,"Too late?"),false,"terminal work never reopens");
 assert.equal(await store.askQuestion("no-such-child",SESSION,PROJECT,"Unknown task?"),false,"an unknown task id is refused");
 assert.deepEqual(await journal(store,"running-child"),["queued","running","waiting"],"the refused second question wrote no event");
 assert.equal(questionOf((await store.get("running-child",SESSION,PROJECT))?.record)?.text,"First question?","the refused question replaced nothing");
 assert.deepEqual(await journal(store,"queued-child"),["queued"]);
 assert.deepEqual(await journal(store,"terminal-child"),["queued","running","failed"]);
 for(const id of ["queued-child","terminal-child"]){const entry=await store.get(id,SESSION,PROJECT);assert.equal(questionOf(entry?.record),undefined,`${id} keeps no pending question`);assert.notEqual(stateOf(entry?.record),"waiting");}
});

test("answerQuestion resumes the waiting child, clears its pending question and issues a fresh question identity",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Reuse the durable helper?"),true);
 const first=questionOf((await store.get(id,SESSION,PROJECT))!.record)!;
 assert.equal(await store.answerQuestion(id,SESSION,PROJECT,"Yes, reuse it."),true);
 const entry=await store.get(id,SESSION,PROJECT);
 assert.equal(stateOf(entry?.record),"running");
 assert.equal(questionOf(entry?.record),undefined,"answering clears the pending question");
 assert.deepEqual(await journal(store,id),["queued","running","waiting","running"]);
 const raw=JSON.parse(await readFile(file,"utf8"));
 assert.equal(raw.entries[0].record.state,"running");
 assert.equal(Object.hasOwn(raw.entries[0].record,"pendingQuestion"),false,"the cleared question is not persisted");
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Now commit the scoped change?"),true);
 const second=questionOf((await store.get(id,SESSION,PROJECT))!.record)!;
 assert.ok(second.id&&second.id!==first.id,"each question gets a distinct identity");
 assert.equal(second.text,"Now commit the scoped change?");
});

test("answerQuestion returns false for children that are not waiting",async t=>{
 const file=await fixture(t),{store}=await PersistentAgentStore.open(file,clock());
 await store.enqueue(req("running-child"),owner);await store.running("running-child");
 assert.equal(await store.answerQuestion("running-child",SESSION,PROJECT,"Nothing was asked."),false,"a running child has no question to answer");
 assert.deepEqual(await journal(store,"running-child"),["queued","running"]);
 assert.equal(await store.askQuestion("running-child",SESSION,PROJECT,"Is the fallback acceptable?"),true);
 assert.equal(await store.answerQuestion("running-child",SESSION,PROJECT,"First answer."),true);
 assert.equal(await store.answerQuestion("running-child",SESSION,PROJECT,"Duplicate answer."),false,"one reply settles one question");
 assert.deepEqual(await journal(store,"running-child"),["queued","running","waiting","running"],"the duplicate reply wrote no event");
 assert.equal(questionOf((await store.get("running-child",SESSION,PROJECT))?.record),undefined);
 await store.enqueue(req("done-child"),owner);await store.running("done-child");await store.failed("done-child","runner failed");
 assert.equal(await store.answerQuestion("done-child",SESSION,PROJECT,"Late reply."),false,"terminal work never reopens");
 assert.deepEqual(await journal(store,"done-child"),["queued","running","failed"]);
});

test("the question channel is bound to the owning session and project",async t=>{
 const {store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,"other-session",PROJECT,"Foreign session?"),false);
 assert.equal(await store.askQuestion(id,SESSION,"/other-project","Foreign project?"),false);
 assert.equal(stateOf((await store.get(id,SESSION,PROJECT))?.record),"running","a refused question leaves the child running");
 assert.equal(questionOf((await store.get(id,SESSION,PROJECT))?.record),undefined);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Which path is authoritative?"),true);
 assert.equal(await store.answerQuestion(id,"other-session",PROJECT,"Foreign reply."),false);
 assert.equal(await store.answerQuestion(id,SESSION,"/other-project","Foreign reply."),false);
 assert.equal(stateOf((await store.get(id,SESSION,PROJECT))?.record),"waiting","a foreign reply leaves the child waiting");
 assert.equal(questionOf((await store.get(id,SESSION,PROJECT))?.record)?.text,"Which path is authoritative?");
 assert.equal(await store.answerQuestion(id,SESSION,PROJECT,"The persisted store is authoritative."),true);
 assert.equal(stateOf((await store.get(id,SESSION,PROJECT))?.record),"running");
 assert.deepEqual(await journal(store,id),["queued","running","waiting","running"]);
});

test("the owning session can cancel a waiting child and the question never returns",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Which surface may I write?"),true);
 await store.cancelled(id,"Cancelled by the owning Pi session");
 const entry=await store.get(id,SESSION,PROJECT);
 assert.equal(stateOf(entry?.record),"cancelled");
 assert.equal(questionOf(entry?.record),undefined,"cancellation drops the pending question");
 assert.deepEqual(await journal(store,id),["queued","running","waiting","cancelled"]);
 const raw=JSON.parse(await readFile(file,"utf8"));
 assert.equal(raw.entries[0].record.state,"cancelled");
 assert.equal(Object.hasOwn(raw.entries[0].record,"pendingQuestion"),false);
 assert.equal(await store.answerQuestion(id,SESSION,PROJECT,"Too late."),false,"a cancelled child cannot be answered");
});

test("process death while waiting recovers the child as interrupted without its question",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Is the fallback acceptable?"),true);
 const stale=JSON.parse(await readFile(file,"utf8"));stale.entries[0].request.ownerProcessId=exitedPid();
 await writeFile(file,`${JSON.stringify(stale)}\n`,{mode:0o600});
 const {store:recovered}=await PersistentAgentStore.open(file,clock(Date.parse("2026-10-10T12:00:00.000Z")));
 const entry=await recovered.get(id,SESSION,PROJECT);
 assert.equal(stateOf(entry?.record),"interrupted","a waiting child that lost its owner process is quarantined for review");
 assert.equal(questionOf(entry?.record),undefined);
 assert.match(entry?.record.summary??"",/question/i);
 assert.deepEqual(await journal(recovered,id),["queued","running","waiting","interrupted"]);
 assert.equal(await recovered.answerQuestion(id,SESSION,PROJECT,"Late reply."),false,"interrupted work requires a new authorized dispatch");
});

test("waiting state and its pending question survive a store reopen and event replay",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Which path is authoritative?"),true);
 const {store:reopened}=await PersistentAgentStore.open(file,clock(Date.parse("2026-10-10T11:00:00.000Z")));
 const entry=await reopened.get(id,SESSION,PROJECT);
 assert.equal(stateOf(entry?.record),"waiting");
 assert.equal(questionOf(entry?.record)?.text,"Which path is authoritative?");
 assert.equal(asWaiting(entry?.record)?.state,"waiting");
 assert.deepEqual(await journal(reopened,id),["queued","running","waiting"],"replay adds no event while the owner process is alive");
 assert.deepEqual((await reopened.list(SESSION,PROJECT)).map(stateOf),["waiting"]);
 assert.equal(await reopened.answerQuestion(id,SESSION,PROJECT,"Reuse the durable helper."),true);
 assert.equal(stateOf((await reopened.get(id,SESSION,PROJECT))?.record),"running");
 const {store:third}=await PersistentAgentStore.open(file,clock(Date.parse("2026-10-10T12:00:00.000Z")));
 assert.equal(stateOf((await third.get(id,SESSION,PROJECT))?.record),"running");
 assert.deepEqual(await journal(third,id),["queued","running","waiting","running"]);
});

test("the durable whitelist accepts waiting only with a well-formed pending question",async t=>{
 const {file,store,id}=await runningAgent(t);
 assert.equal(await store.askQuestion(id,SESSION,PROJECT,"Keep the legacy parser?"),true);
 const raw=await readFile(file,"utf8"),key=await readFile(`${file}.receipt-key`);
 assert.doesNotThrow(()=>parseAgentStore(raw,key));
 const orphan=JSON.parse(raw);delete orphan.entries[0].record.pendingQuestion;
 assert.throws(()=>parseAgentStore(JSON.stringify(orphan),key),/Invalid ASEN agent store/,"waiting without a question is not durable");
 const stranded=JSON.parse(raw);stranded.entries[0].record.state="running";
 assert.throws(()=>parseAgentStore(JSON.stringify(stranded),key),/Invalid ASEN agent store/,"a pending question outside waiting is not durable");
 const malformed=JSON.parse(raw);delete malformed.entries[0].record.pendingQuestion.text;
 assert.throws(()=>parseAgentStore(JSON.stringify(malformed),key),/Invalid ASEN agent store/,"a half-recorded question is not durable");
 const replay=JSON.parse(raw);
 const events=replay.entries[0].events,at=new Date(Date.parse(events.at(-1).at)+1000).toISOString();
 events.push({id,revision:events.length+1,state:"failed",at});
 replay.entries[0].record.state="failed";replay.entries[0].record.updatedAt=at;delete replay.entries[0].record.pendingQuestion;
 assert.throws(()=>parseAgentStore(JSON.stringify(replay),key),/Invalid ASEN agent store/,"waiting can only resume, be cancelled or be interrupted");
});
