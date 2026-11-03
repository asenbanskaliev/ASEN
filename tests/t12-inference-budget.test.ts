import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile,unlink} from "node:fs/promises";
import {spawnSync} from "node:child_process";
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
