import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
// @ts-expect-error CI-only JavaScript wrapper is outside the runtime package.
import {main} from "../.github/scripts/run-retained-ecosystem-source-witness.mjs";

test("retained witness rejects missing and blank source before dispatch",async()=>{
 for(const env of [{},{ECOSYSTEM_BASELINE_REPOSITORY:""},{ECOSYSTEM_BASELINE_REPOSITORY:"  \t"}]){
  let called=false;
  await assert.rejects(main({env,run:()=>{called=true;}}),/ECOSYSTEM_BASELINE_REPOSITORY/);
  assert.equal(called,false);
 }
});

test("retained witness preserves completed exits and signals with bounded runner",async()=>{
 for(const result of [{code:0,signal:null},{code:2,signal:null},{code:124,signal:null},{code:null,signal:"SIGTERM"}]){
  const actual=await main({env:{ECOSYSTEM_BASELINE_REPOSITORY:"/retained.git"},
   run:async(runs:unknown[],runner:unknown,options:{limits:{chunkMs:number;overallMs:number}})=>{
    assert.deepEqual(runs,[{name:"retained-source",args:["--import","tsx","--test","tests/ecosystem-baseline.test.ts"]}]);
    assert.equal(runner,undefined);
    assert.equal(options.limits.chunkMs,600_000);
    assert.equal(options.limits.overallMs,600_000);
    return result;
   }});
  assert.deepEqual(actual,result);
 }
});

test("import guard never dispatches or validates ambient source",()=>{
 const result=spawnSync(process.execPath,["--input-type=module","-e",
  "delete process.env.ECOSYSTEM_BASELINE_REPOSITORY; await import('./.github/scripts/run-retained-ecosystem-source-witness.mjs');"],
 {encoding:"utf8",timeout:10_000});
 assert.equal(result.error,undefined);
 assert.equal(result.status,0,result.stderr);
});
