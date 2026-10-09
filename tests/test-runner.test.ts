import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Test-only JavaScript runner is outside the runtime TypeScript package.
import {discoverTestFiles,planTestRuns} from "../scripts/test-plan.mjs";
// @ts-expect-error Test-only JavaScript runner is outside the runtime TypeScript package.
import {runTestPlan} from "../scripts/run-tests.mjs";

const processFiles=[
 "tests/ask-user-rpc.test.ts",
 "tests/gsp06-pi-free-probes.test.ts",
 "tests/evidence-tdd.test.ts",
 "tests/execution-revision.test.ts",
 "tests/pi-native-skill-load.test.ts",
 "tests/pi-process-runner.test.ts",
 "tests/pi-session-recovery-e2e.test.ts",
 "tests/spawn-contained.test.ts",
];

test("discovers every test recursively once in deterministic repository-relative order",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-test-plan-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,"tests","nested"),{recursive:true});
 await Promise.all([
  writeFile(join(root,"tests","z.test.ts"),""),
  writeFile(join(root,"tests","nested","a.test.ts"),""),
  writeFile(join(root,"tests","nested","not-a-test.ts"),""),
 ]);
 assert.deepEqual(await discoverTestFiles(root),[
  "tests/nested/a.test.ts",
  "tests/z.test.ts",
 ]);
});

test("Windows separates the exact process-heavy files into a serial second run",()=>{
 const files=["tests/z.test.ts",...processFiles,"tests/a.test.ts"];
 const runs=planTestRuns({platform:"win32",testFiles:files,nodeOptions:["--test-name-pattern=timeout"]});
 assert.deepEqual(runs,[
  {name:"remaining",args:["--import","tsx","--test","--test-name-pattern=timeout","tests/a.test.ts","tests/z.test.ts"]},
  {name:"process-heavy",args:["--import","tsx","--test","--test-name-pattern=timeout","--test-concurrency=1",...processFiles]},
 ]);
 assert.deepEqual(runs.flatMap(run=>run.args.filter(arg=>arg.endsWith(".test.ts"))).sort(),files.sort());
});

test("the checked-in Windows plan selects every existing test exactly once",async()=>{
 const files=await discoverTestFiles(process.cwd());
 const planned:string[]=planTestRuns({platform:"win32",testFiles:files,nodeOptions:[]})
  .flatMap((run:{args:string[]})=>run.args.filter((arg:string)=>arg.endsWith(".test.ts")));
 assert.deepEqual([...planned].sort(),files);
 assert.equal(new Set(planned).size,files.length);
});

test("importing the runner does not execute its main entry point",async()=>{
 await import(`../scripts/run-tests.mjs?import-only=${Date.now()}`);
});

test("non-Windows keeps one default-concurrency run and forwards options before files",()=>{
 assert.deepEqual(planTestRuns({
  platform:"linux",
  testFiles:["tests/z.test.ts","tests/a.test.ts"],
  nodeOptions:["--test-reporter=spec"],
 }),[{name:"all",args:["--import","tsx","--test","--test-reporter=spec","tests/a.test.ts","tests/z.test.ts"]}]);
});

test("planning fails closed for no tests, duplicate inputs, or an incomplete Windows process set",()=>{
 assert.throws(()=>planTestRuns({platform:"linux",testFiles:[],nodeOptions:[]}),/no test files/i);
 assert.throws(()=>planTestRuns({platform:"linux",testFiles:["tests/a.test.ts","tests/a.test.ts"],nodeOptions:[]}),/duplicate test file/i);
 assert.throws(()=>planTestRuns({platform:"win32",testFiles:[...processFiles.slice(1),"tests/a.test.ts"],nodeOptions:[]}),/missing Windows process test/i);
});

test("orchestration is sequential and stops at the first nonzero result",async()=>{
 const calls:string[][]=[];
 const result=await runTestPlan([
  {name:"first",args:["first"]},
  {name:"second",args:["second"]},
  {name:"never",args:["never"]},
 ],async (args:string[])=>{calls.push(args);return calls.length===2?{code:7,signal:null}:{code:0,signal:null};});
 assert.deepEqual(calls,[["first"],["second"]]);
 assert.deepEqual(result,{code:7,signal:null});
});

test("orchestration propagates spawn errors and terminating signals",async()=>{
 const failure=new Error("spawn failed");
 await assert.rejects(()=>runTestPlan([{name:"only",args:[]}],async()=>{throw failure;}),error=>error===failure);
 assert.deepEqual(
  await runTestPlan([{name:"only",args:[]}],async()=>({code:null,signal:"SIGTERM"})),
  {code:null,signal:"SIGTERM"},
 );
});
