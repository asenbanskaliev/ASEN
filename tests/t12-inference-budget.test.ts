import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
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

test("T12 inference budget rejects invalid labels, limits and non-absolute roots",async()=>{
 await assert.rejects(()=>reserveInferenceCall("../credential",{limit:3,directory:tmpdir()}),/label/);
 await assert.rejects(()=>reserveInferenceCall("invalid-limit",{limit:6,directory:tmpdir()}),/budget/);
 await assert.rejects(()=>reserveInferenceCall("relative-root",{limit:3,directory:"relative"}),/absolute/);
});
