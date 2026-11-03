import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error JavaScript-only budget helper.
import {reserveInferenceCall} from "../scripts/t12-inference-budget.mjs";

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
 assert.deepEqual(reservations.map(item=>item.call).sort((a:number,b:number)=>a-b),[1,2,3,4,5]);
 await assert.rejects(()=>reserveInferenceCall("replay",{limit:5,directory}),/budget exhausted/);
});
test("T12 invalid manifest fails closed instead of resetting inference allowance",async t=>{
 const directory=await mkdtemp(join(tmpdir(),"asen-inference-corruption-"));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await reserveInferenceCall("explorer",{limit:3,directory});
 await writeFile(join(directory,"asen-inference-budget","limit.json"),'{"limit":5}');
 await assert.rejects(()=>reserveInferenceCall("planner",{limit:3,directory}),/policy is malformed/);
});
