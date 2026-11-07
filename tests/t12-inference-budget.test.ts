import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile,unlink} from "node:fs/promises";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error JavaScript-only budget helper.
import {reserveInferenceCall,inspectInferenceBudget,readInferenceBudgetReceipts} from "../scripts/t12-inference-budget.mjs";

test("T12 inference budget reserves bounded child calls exactly once",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-budget-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 assert.deepEqual(await reserveInferenceCall("provider-smoke",{limit:3,directory}),{call:1,limit:3});
 assert.deepEqual(await reserveInferenceCall("fixture-explorer",{limit:3,directory}),{call:2,limit:3});
 assert.deepEqual(await reserveInferenceCall("plan",{limit:3,directory}),{call:3,limit:3});
 await assert.rejects(()=>reserveInferenceCall("asen-explorer",{limit:3,directory}),/budget exhausted/);
 const reservations=await Promise.all([1,2,3].map(index=>readFile(join(directory,"asen-inference-budget",`${index}.json`),"utf8")));
 assert.deepEqual(reservations.map(value=>JSON.parse(value).call),[1,2,3]);
});

test("T12 five-call budget covers Explorer, Planner, two blind reviewers and Verifier",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-budget-five-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const labels=["explorer","plan","reviewer-judge-a","reviewer-judge-b","verifier"];
 for(const [index,label] of labels.entries())
  assert.deepEqual(await reserveInferenceCall(label,{limit:5,directory}),{call:index+1,limit:5});
 await assert.rejects(()=>reserveInferenceCall("unexpected-retry",{limit:5,directory}),/budget exhausted/);
});

test("T12 inference budget rejects invalid labels, limits and non-absolute roots",async()=>{
 await assert.rejects(()=>reserveInferenceCall("../credential",{limit:3,directory:tmpdir()}),/label/);
 await assert.rejects(()=>reserveInferenceCall("invalid-limit",{limit:6,directory:tmpdir()}),/budget/);
 await assert.rejects(()=>reserveInferenceCall("invalid-four",{limit:4,directory:tmpdir()}),/budget/);
 await assert.rejects(()=>reserveInferenceCall("relative-root",{limit:3,directory:"relative"}),/absolute/);
});

test("T12 budget is pinned across stages and cannot be silently escalated",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-policy-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("explorer",{limit:3,directory});
 await assert.rejects(()=>reserveInferenceCall("limit-escalation",{limit:5,directory}),/cannot change within one run/);
 assert.deepEqual(await reserveInferenceCall("planner",{limit:3,directory}),{call:2,limit:3});
 assert.deepEqual(JSON.parse(await readFile(join(directory,"asen-inference-budget","limit.json"),"utf8")),{schema:1,limit:3});
});
test("T12 concurrent stages allocate distinct calls under the same ceiling",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-concurrent-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const reservations=await Promise.all(["explorer","planner","review-a","review-b","verifier"].map(label=>
  reserveInferenceCall(label,{limit:5,directory})));
 assert.deepEqual(reservations.map((item:{call:number;limit:number})=>item.call).sort((a:number,b:number)=>a-b),[1,2,3,4,5]);
 await assert.rejects(()=>reserveInferenceCall("replay",{limit:5,directory}),/budget exhausted/);
});
test("T12 invalid manifest fails closed instead of resetting inference allowance",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-corruption-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("explorer",{limit:3,directory});
 await writeFile(join(directory,"asen-inference-budget","limit.json"),'{"limit":5}');
 await assert.rejects(()=>reserveInferenceCall("planner",{limit:3,directory}),/policy is malformed/);
});

test("T12 interprocess restart does not reset the spent inference ceiling",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-restart-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const script=fileURLToPath(new URL("../scripts/t12-inference-budget.mjs",import.meta.url));
 const env={...process.env,RUNNER_TEMP:directory,ASEN_MAX_INFERENCE_CALLS:"3",OLLAMA_API_KEY:"SYNTHETIC_DO_NOT_LOG"};
 const run=(label:string)=>spawnSync(process.execPath,[script,label],{env,encoding:"utf8",timeout:10000});
 for(const [i,label] of ["explorer","planner","verifier"].entries()){
  const child=run(label);
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,new RegExp("reserved "+(i+1)+"/3"));
  assert.doesNotMatch(child.stdout+child.stderr,/SYNTHETIC_DO_NOT_LOG/);
 }
 const restarted=run("duplicate");
 assert.notEqual(restarted.status,0);
 assert.match(restarted.stderr,/budget exhausted/);
 assert.deepEqual(await inspectInferenceBudget({directory}),{limit:3,reserved:3,remaining:0,authorization:"NOT_GRANTED"});
 const report=run("--report");
 assert.equal(report.status,0,report.stderr);
 assert.deepEqual(JSON.parse(report.stdout),{limit:3,reserved:3,remaining:0,authorization:"NOT_GRANTED"});
});
test("T12 budget inspection detects corrupted or deleted receipts after restart",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-damaged-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("explorer",{directory,limit:3});
 await reserveInferenceCall("planner",{directory,limit:3});
 const file=join(directory,"asen-inference-budget","1.json");
 await writeFile(file,"{incomplete");
 await assert.rejects(()=>inspectInferenceBudget({directory}),/reservation is malformed/);
 await writeFile(file,JSON.stringify({call:1,label:"explorer",limit:3}));
 await unlink(file);
 await assert.rejects(()=>inspectInferenceBudget({directory}),/history has a gap/);
});
test("T12 budget inspection does not spend calls and refuses over-limit receipts",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-status-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("explorer",{directory,limit:5});
 assert.deepEqual(await inspectInferenceBudget({directory}),{limit:5,reserved:1,remaining:4,authorization:"NOT_GRANTED"});
 await writeFile(join(directory,"asen-inference-budget","6.json"),JSON.stringify({call:6,label:"forbidden",limit:5}));
 await assert.rejects(()=>inspectInferenceBudget({directory}),/outside the declared limit/);
});

test("T12 consumed slot cannot be reused after a receipt is deleted",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-replay-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 assert.deepEqual(await reserveInferenceCall("first",{limit:3,directory}),{call:1,limit:3});
 const folder=join(directory,"asen-inference-budget");
 assert.deepEqual(JSON.parse(await readFile(join(folder,"1.claim"),"utf8")),{call:1,label:"first",limit:3});
 await unlink(join(folder,"1.json"));
 assert.deepEqual(await reserveInferenceCall("second",{limit:3,directory}),{call:2,limit:3},
  "A deleted receipt must never reopen the first claim");
 assert.deepEqual(await reserveInferenceCall("third",{limit:3,directory}),{call:3,limit:3});
 await assert.rejects(()=>reserveInferenceCall("replayed",{limit:3,directory}),/budget exhausted/);
 await assert.rejects(()=>inspectInferenceBudget({directory}),/history has a gap or incomplete receipt/);
});
test("T12 crash after claim but before receipt burns the abandoned slot",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-crash-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("initial",{limit:3,directory});
 const folder=join(directory,"asen-inference-budget");
 await writeFile(join(folder,"2.claim"),JSON.stringify({call:2,label:"interrupted",limit:3}));
 assert.deepEqual(await reserveInferenceCall("after-crash",{limit:3,directory}),{call:3,limit:3});
 await assert.rejects(()=>reserveInferenceCall("exceeded",{limit:3,directory}),/budget exhausted/);
 await assert.rejects(()=>inspectInferenceBudget({directory}),/history has a gap or incomplete receipt/);
});
test("T12 independent claim detects mutation of one receipt and cannot claim a green recovery",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-tamper-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("first",{limit:5,directory});
 const folder=join(directory,"asen-inference-budget");
 await writeFile(join(folder,"1.json"),JSON.stringify({call:1,label:"changed",limit:5}));
 await assert.rejects(()=>inspectInferenceBudget({directory}),/reservation is malformed/);
 assert.deepEqual(await reserveInferenceCall("later",{limit:5,directory}),{call:2,limit:5});
 await assert.rejects(()=>inspectInferenceBudget({directory}),/reservation is malformed/);
});
test("T12 claim-only entries outside the declared ceiling are rejected",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-outside-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("first",{limit:3,directory});
 const folder=join(directory,"asen-inference-budget");
 await writeFile(join(folder,"4.claim"),JSON.stringify({call:4,label:"outside",limit:3}));
 await assert.rejects(()=>inspectInferenceBudget({directory}),/outside the declared limit/);
});

test("T12 receipt reader binds each durable call number to its stage without consuming a call",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-stage-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("asen-dispatcher-explorer",{limit:5,directory});
 await reserveInferenceCall("real-plan",{limit:5,directory});
 assert.deepEqual(await readInferenceBudgetReceipts({directory}),[
  {call:1,label:"asen-dispatcher-explorer",limit:5},
  {call:2,label:"real-plan",limit:5},
 ]);
 assert.deepEqual(await inspectInferenceBudget({directory}),
  {limit:5,reserved:2,remaining:3,authorization:"NOT_GRANTED"});
});
test("T12 missing, changed, or mismatched claimed receipts cannot satisfy stage acceptance",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-claim-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("first",{limit:3,directory});
 const folder=join(directory,"asen-inference-budget");
 await writeFile(join(folder,"1.json"),JSON.stringify({call:1,label:"changed",limit:3})+"\n");
 await assert.rejects(()=>readInferenceBudgetReceipts({directory}),/malformed|differs/);
 await writeFile(join(folder,"1.json"),JSON.stringify({call:1,label:"first",limit:3})+"\n");
 await writeFile(join(folder,"1.claim"),JSON.stringify({call:1,label:"first",limit:3,extra:"tampered"})+"\n");
 await assert.rejects(()=>readInferenceBudgetReceipts({directory}),/malformed|differs/);
});

test("T12 many independent Pi-stage processes race for five calls and cannot exceed the ceiling",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-process-race-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const script=fileURLToPath(new URL("../scripts/t12-inference-budget.mjs",import.meta.url));
 const env={...process.env,RUNNER_TEMP:directory,ASEN_MAX_INFERENCE_CALLS:"5",
  OLLAMA_API_KEY:"SYNTHETIC_CONCURRENCY_SECRET"};
 const launches=Array.from({length:12},(_,i)=>new Promise<{status:number|null;out:string}>(resolve=>{
  const child=spawn(process.execPath,[script,"race-"+i],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let out="";
  child.stdout?.on("data",(data:Buffer)=>{out+=data.toString("utf8").slice(0,1000);});
  child.stderr?.on("data",(data:Buffer)=>{out+=data.toString("utf8").slice(0,1000);});
  child.once("error",error=>resolve({status:-1,out:String(error.name)}));
  child.once("close",status=>resolve({status,out}));
 }));
 const results=await Promise.all(launches);
 const winners=results.filter(row=>row.status===0);
 const failures=results.filter(row=>row.status!==0);
 assert.equal(winners.length,5,JSON.stringify(results));
 assert.equal(failures.length,7);
 for(const row of failures)assert.match(row.out,/budget exhausted/);
 assert.equal(results.some(row=>row.out.includes("SYNTHETIC_CONCURRENCY_SECRET")),false);
 const receipts=await readInferenceBudgetReceipts({directory});
 assert.equal(receipts.length,5);
 assert.deepEqual(receipts.map((item:{call:number})=>item.call),[1,2,3,4,5]);
 assert.equal(new Set(receipts.map((item:{label:string})=>item.label)).size,5);
 assert.deepEqual(await inspectInferenceBudget({directory}),
  {limit:5,reserved:5,remaining:0,authorization:"NOT_GRANTED"});
 await assert.rejects(()=>reserveInferenceCall("post-race",{directory,limit:5}),/budget exhausted/);
});


test("T12 strict five-call stages cannot skip, replay or impersonate earlier model calls",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-strict-five-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const reserve=(label:string)=>reserveInferenceCall(label,{limit:5,directory,strictOrder:true});
 await assert.rejects(()=>reserve("real-plan"),/duplicated or out of order/);
 await assert.rejects(()=>reserve("provider-connectivity"),/unapproved inference stage label/);
 assert.deepEqual(await inspectInferenceBudget({directory}),{
  limit:5,reserved:0,remaining:5,authorization:"NOT_GRANTED",
 });
 const labels=["asen-dispatcher-explorer","real-plan","real-judge-a","real-judge-b","real-verifier"];
 for(const [index,label] of labels.entries()){
  assert.deepEqual(await reserve(label),{call:index+1,limit:5});
  await assert.rejects(()=>reserve(label),/duplicated or out of order/);
  if(index+1<labels.length)await assert.rejects(()=>reserve(labels[index+1+1]??"unapproved"),/duplicated or out of order|unapproved/);
 }
 assert.deepEqual(JSON.parse(await readFile(join(directory,"asen-inference-budget","limit.json"),"utf8")),
  {schema:2,limit:5,strict:true});
 assert.deepEqual((await readInferenceBudgetReceipts({directory})).map((item:{label:string})=>item.label),labels);
 await assert.rejects(()=>reserve("real-verifier"),/duplicated or out of order/);
 await assert.rejects(()=>reserveInferenceCall("sixth",{limit:5,directory,strictOrder:false}),/stage-order policy/);
});

test("T12 strict three-call mode preserves connectivity then Explorer then Planner order",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-strict-three-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const reserve=(label:string)=>reserveInferenceCall(label,{limit:3,directory,strictOrder:true});
 await assert.rejects(()=>reserve("asen-dispatcher-explorer"),/out of order/);
 assert.deepEqual(await reserve("provider-connectivity"),{call:1,limit:3});
 await assert.rejects(()=>reserve("real-plan"),/out of order/);
 assert.deepEqual(await reserve("asen-dispatcher-explorer"),{call:2,limit:3});
 assert.deepEqual(await reserve("real-plan"),{call:3,limit:3});
 assert.deepEqual((await readInferenceBudgetReceipts({directory})).map((row:{label:string})=>row.label),
  ["provider-connectivity","asen-dispatcher-explorer","real-plan"]);
 await assert.rejects(()=>reserve("real-judge-a"),/unapproved inference stage label/);
});

test("T12 a corrupted or interrupted strict claim blocks the next inference stage",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-strict-corrupt-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("asen-dispatcher-explorer",{limit:5,directory,strictOrder:true});
 const folder=join(directory,"asen-inference-budget");
 await unlink(join(folder,"1.json"));
 await assert.rejects(()=>reserveInferenceCall("real-plan",{limit:5,directory,strictOrder:true}),
  /gap or incomplete receipt/);
 await assert.rejects(()=>inspectInferenceBudget({directory}),/gap or incomplete receipt/);
});

test("T12 stage-order policy is immutable even if a process changes its environment",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-mode-drift-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("asan-test",{limit:3,directory,strictOrder:false});
 await assert.rejects(()=>reserveInferenceCall("asen-dispatcher-explorer",{limit:3,directory,strictOrder:true}),
  /stage-order policy cannot change/);
 await assert.rejects(()=>reserveInferenceCall("asana",{limit:5,directory,strictOrder:false}),
  /budget cannot change/);
});

test("T12 concurrent independent strict processes can claim the same first stage only once",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-strict-race-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const script=fileURLToPath(new URL("../scripts/t12-inference-budget.mjs",import.meta.url));
 const env={...process.env,ASEN_MAX_INFERENCE_CALLS:"5",RUNNER_TEMP:directory,
  ASEN_STRICT_INFERENCE_ORDER:"1",OLLAMA_API_KEY:"STRICT_SYNTHETIC_SECRET_DO_NOT_LOG"};
 const attempts=Array.from({length:4},()=>new Promise<{code:number|null;message:string}>(resolve=>{
  const child=spawn(process.execPath,[script,"asen-dispatcher-explorer"],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let message="";
  child.stdout?.on("data",(data:Buffer)=>{message+=data.toString("utf8").slice(0,800);});
  child.stderr?.on("data",(data:Buffer)=>{message+=data.toString("utf8").slice(0,800);});
  child.once("error",err=>resolve({code:-1,message:err.name}));
  child.once("close",code=>resolve({code,message}));
 }));
 const results=await Promise.all(attempts);
 assert.equal(results.filter(item=>item.code===0).length,1,JSON.stringify(results));
 assert.equal(results.filter(item=>item.code!==0).length,3,JSON.stringify(results));
 assert.equal(results.some(item=>item.message.includes("STRICT_SYNTHETIC_SECRET_DO_NOT_LOG")),false);
 assert.deepEqual((await readInferenceBudgetReceipts({directory})).map((row:{label:string})=>row.label),
  ["asen-dispatcher-explorer"]);
 const next=spawnSync(process.execPath,[script,"real-plan"],{env,encoding:"utf8"});
 assert.equal(next.status,0,next.stderr);
 const replay=spawnSync(process.execPath,[script,"asen-dispatcher-explorer"],{env,encoding:"utf8"});
 assert.notEqual(replay.status,0);
 assert.match(replay.stderr,/duplicated or out of order/);
 assert.deepEqual(await inspectInferenceBudget({directory}),
  {limit:5,reserved:2,remaining:3,authorization:"NOT_GRANTED"});
});

test("T12 GitHub rerun cannot replenish a strict provider-call budget after attempt one",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-rerun-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const script=fileURLToPath(new URL("../scripts/t12-inference-budget.mjs",import.meta.url));
 const env={...process.env,RUNNER_TEMP:directory,ASEN_MAX_INFERENCE_CALLS:"5",
  ASEN_STRICT_INFERENCE_ORDER:"1",GITHUB_ACTIONS:"true",GITHUB_RUN_ATTEMPT:"2",
  OLLAMA_API_KEY:"SYNTHETIC_RERUN_SECRET_NOT_TO_LOG"};
 const rejected=spawnSync(process.execPath,[script,"asen-dispatcher-explorer"],{env,encoding:"utf8"});
 assert.notEqual(rejected.status,0);
 assert.match(rejected.stderr,/real-provider rerun is not authorized/);
 assert.equal((rejected.stdout+rejected.stderr).includes("SYNTHETIC_RERUN_SECRET_NOT_TO_LOG"),false);
 await assert.rejects(()=>inspectInferenceBudget({directory}),/ENOENT/,
  "Second attempt cannot create even an initial inference budget");
 const first=spawnSync(process.execPath,[script,"asen-dispatcher-explorer"],{
  env:{...env,GITHUB_RUN_ATTEMPT:"1"},encoding:"utf8",
 });
 assert.equal(first.status,0,first.stderr);
 const again=spawnSync(process.execPath,[script,"real-plan"],{env,encoding:"utf8"});
 assert.notEqual(again.status,0);
 assert.match(again.stderr,/real-provider rerun is not authorized/);
 assert.deepEqual(await inspectInferenceBudget({directory}),
  {limit:5,reserved:1,remaining:4,authorization:"NOT_GRANTED"});
});
