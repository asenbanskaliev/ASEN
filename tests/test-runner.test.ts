import assert from "node:assert/strict";
import test from "node:test";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Test-only JavaScript runner is outside the runtime TypeScript package.
import {discoverTestFiles,planTestRuns} from "../scripts/test-plan.mjs";
// @ts-expect-error Test-only JavaScript runner is outside the runtime TypeScript package.
import {resolveWatchdogLimits,runChildWithWatchdog,runTestPlan} from "../scripts/run-tests.mjs";

class FakeClock {
 nowMs=0;
 nextId=1;
 timers=new Map<number,{at:number;callback:()=>void}>();
 now=()=>this.nowMs;
 setTimeout=(callback:()=>void,delay:number)=>{
  const id=this.nextId++;
  this.timers.set(id,{at:this.nowMs+delay,callback});
  return id;
 };
 clearTimeout=(id:number)=>{this.timers.delete(id);};
 advance(ms:number){
  const target=this.nowMs+ms;
  for(;;){
   const next=[...this.timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!next||next[1].at>target)break;
   this.nowMs=next[1].at;
   this.timers.delete(next[0]);
   next[1].callback();
  }
  this.nowMs=target;
 }
}

class FakeChild extends EventEmitter {
 pid=321;
 stdout=new PassThrough();
 stderr=new PassThrough();
 unrefCount=0;
 unref(){this.unrefCount++;}
}

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const limits=(chunkMs:number,overallMs=chunkMs*10)=>({chunkMs,overallMs,termGraceMs:5,killWaitMs:2});

test("Windows CI gives the serialized full suite a 40-minute watchdog budget",async()=>{
 const workflow=(await readFile(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8")).replace(/\r\n/gu,"\n");
 const step=workflow.match(/- name: Full test suite\n([\s\S]*?)(?=\n      - name:)/u)?.[1];
 assert.ok(step,"CI must retain an explicit full-suite step");
 assert.match(step,/ASEN_TEST_OVERALL_TIMEOUT_MS:\s*\$\{\{\s*matrix\.os\s*==\s*'windows-latest'\s*&&\s*'2400000'\s*\|\|\s*'1800000'\s*\}\}/u);
});

const processFiles=[
 "tests/ask-user-rpc.test.ts",
 "tests/gsp06-pi-free-probes.test.ts",
 "tests/ecosystem-baseline.test.ts",
 "tests/history-store.test.ts",
 "tests/memory-migrations.test.ts",
 "tests/memory-session-identity.test.ts",
 "tests/evidence-tdd.test.ts",
 "tests/execution-revision.test.ts",
 "tests/pi-native-skill-load.test.ts",
 "tests/pi-process-runner.test.ts",
 "tests/pi-session-recovery-e2e.test.ts",
 "tests/skill-registry-restart.test.ts",
 "tests/pi-agent-runtime.test.ts",
 "tests/spawn-contained.test.ts",
 "tests/lifecycle-tdd-completion.test.ts",
 "tests/workspace-attribution.test.ts",
];

test("Windows isolates strict lifecycle command witnesses from concurrent ordinary tests",()=>{
 const target="tests/lifecycle-tdd-completion.test.ts";
 const files=[...new Set([...processFiles,target,"tests/ordinary.test.ts"])];
 const runs=planTestRuns({platform:"win32",testFiles:files,nodeOptions:[]});
 const owners=runs.filter((run:{args:string[]})=>run.args.includes(target));
 assert.equal(owners.length,1);
 assert.ok(owners[0].args.includes("--test-concurrency=1"));
 assert.ok(owners[0].name.startsWith("process-heavy"));
});

test("Windows isolates the 40-writer workspace lock stress from ordinary filesystem load",()=>{
 const target="tests/workspace-attribution.test.ts",files=[...new Set([...processFiles,target,"tests/ordinary.test.ts"])];
 const owners=planTestRuns({platform:"win32",testFiles:files,nodeOptions:[]}).filter((run:{args:string[]})=>run.args.includes(target));
 assert.equal(owners.length,1);assert.ok(owners[0].args.includes("--test-concurrency=1"));assert.ok(owners[0].name.startsWith("process-heavy"));
});

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
  {name:"remaining-1",args:["--import","tsx","--test","--test-name-pattern=timeout","tests/a.test.ts","tests/z.test.ts"]},
  {name:"process-heavy-1",args:["--import","tsx","--test","--test-name-pattern=timeout","--test-concurrency=1",...processFiles.slice(0,4)]},
  {name:"process-heavy-2",args:["--import","tsx","--test","--test-name-pattern=timeout","--test-concurrency=1",...processFiles.slice(4,8)]},
  {name:"process-heavy-3",args:["--import","tsx","--test","--test-name-pattern=timeout","--test-concurrency=1",...processFiles.slice(8,12)]},
  {name:"process-heavy-4",args:["--import","tsx","--test","--test-name-pattern=timeout","--test-concurrency=1",...processFiles.slice(12)]},
 ]);
 assert.deepEqual(runs.flatMap(run=>run.args.filter(arg=>arg.endsWith(".test.ts"))).sort(),files.sort());
});

test("Windows splits ordinary and process-heavy test files into bounded chunks",()=>{
 const ordinary=Array.from({length:121},(_,index)=>`tests/ordinary-${String(index).padStart(3,"0")}.test.ts`);
 const files=[...ordinary,...processFiles];
 const runs=planTestRuns({platform:"win32",testFiles:files,nodeOptions:[]});
 const ordinaryRuns=runs.filter((run:{name:string})=>run.name.startsWith("remaining-"));
 const processRuns=runs.filter((run:{name:string})=>run.name.startsWith("process-heavy-"));
 assert.equal(ordinaryRuns.length,3);
 for(const run of ordinaryRuns){
  assert.match(run.name,/^remaining-\d+$/);
  assert.ok(run.args.filter((arg:string)=>arg.endsWith(".test.ts")).length<=50);
 }
 assert.equal(processRuns.length,4);
 for(const run of processRuns){
  assert.equal(run.args.includes("--test-concurrency=1"),true);
  assert.ok(run.args.filter((arg:string)=>arg.endsWith(".test.ts")).length<=4);
 }
 assert.deepEqual(runs.flatMap((run:{args:string[]})=>run.args.filter((arg:string)=>arg.endsWith(".test.ts"))).sort(),files.sort());
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

test("watchdog limits reject values above Node's maximum timer delay",()=>{
 const maximum="2147483647";
 const names=["ASEN_TEST_CHUNK_TIMEOUT_MS","ASEN_TEST_OVERALL_TIMEOUT_MS","ASEN_TEST_TERM_GRACE_MS","ASEN_TEST_KILL_WAIT_MS"];
 for(const name of names){
  assert.equal(Object.values(resolveWatchdogLimits({[name]:maximum})).includes(Number(maximum)),true);
  for(const value of ["2147483648",String(Number.MAX_SAFE_INTEGER)]){
   assert.throws(()=>resolveWatchdogLimits({[name]:value}),new RegExp(`${name}.*maximum`));
  }
 }
 const direct={args:["tests/a.test.ts"],name:"only",scope:"chunk",limitMs:1,termGraceMs:1,killWaitMs:1,spawnChild:()=>new FakeChild()};
 for(const name of ["limitMs","termGraceMs","killWaitMs"]){
  assert.throws(()=>runChildWithWatchdog({...direct,[name]:2_147_483_648}),/invalid test runner watchdog input/);
 }
});

test("watchdog override parsing accepts only positive integer milliseconds",()=>{
 assert.deepEqual(resolveWatchdogLimits({}),{
  chunkMs:600_000,
  overallMs:1_800_000,
  termGraceMs:5_000,
  killWaitMs:2_000,
 });
 assert.deepEqual(resolveWatchdogLimits({
  ASEN_TEST_CHUNK_TIMEOUT_MS:"11",
  ASEN_TEST_OVERALL_TIMEOUT_MS:"22",
  ASEN_TEST_TERM_GRACE_MS:"3",
  ASEN_TEST_KILL_WAIT_MS:"4",
 }),{chunkMs:11,overallMs:22,termGraceMs:3,killWaitMs:4});
 for(const value of ["","0","-1","1.5","NaN"," 2","2 "]){
  assert.throws(()=>resolveWatchdogLimits({ASEN_TEST_CHUNK_TIMEOUT_MS:value}),/ASEN_TEST_CHUNK_TIMEOUT_MS.*positive integer/);
 }
 assert.throws(()=>resolveWatchdogLimits(undefined),/runtime environment is required/i);
});

test("watchdog returns 124 after bounded TERM/KILL when a child never closes and disposes owned resources",async()=>{
 const clock=new FakeClock();
 const child=new FakeChild();
 const signals:string[]=[];
 const errors:string[]=[];
 const resultPromise=runTestPlan(
  [{name:"remaining",args:["--test","tests/a.test.ts","tests/nested/b.test.ts"]}],
  undefined,
  {clock,limits:limits(10),platform:"linux",stderr:(line:string)=>errors.push(line),
   spawnChild:()=>child,killProcess:(_pid:number,signal:string)=>{signals.push(signal);}},
 );
 clock.advance(10);
 assert.deepEqual(signals,["SIGTERM"]);
 assert.doesNotThrow(()=>child.emit("error",new Error("termination race one")));
 assert.doesNotThrow(()=>child.emit("error",new Error("termination race two")));
 clock.advance(5);
 assert.deepEqual(signals,["SIGTERM","SIGKILL"]);
 clock.advance(2);
 assert.deepEqual(await resultPromise,{code:124,signal:null});
 assert.equal(child.stdout.destroyed,true);
 assert.equal(child.stderr.destroyed,true);
 assert.equal(child.unrefCount,1);
 assert.equal(child.listenerCount("close"),1);
 assert.equal(child.listenerCount("error"),1);
 assert.doesNotThrow(()=>child.emit("error",new Error("after result")));
 child.emit("close",null,"SIGKILL");
 assert.equal(child.listenerCount("close"),0);
 assert.equal(child.listenerCount("error"),0);
 assert.equal(clock.timers.size,0);
 assert.deepEqual(errors,[
  "TEST_RUNNER_TIMEOUT owner=test-runner scope=chunk chunk=remaining members=tests/a.test.ts,tests/nested/b.test.ts elapsed_ms=17 limit_ms=10 cleanup=unconfirmed",
 ]);
});

test("earlier overall deadline wins in a later chunk and no subsequent chunk starts",async()=>{
 const clock=new FakeClock();
 const children:FakeChild[]=[];
 const chunks:string[]=[];
 const resultPromise=runTestPlan([
  {name:"first",args:["tests/first.test.ts"]},
  {name:"second",args:["tests/second.test.ts"]},
  {name:"never",args:["tests/never.test.ts"]},
 ],undefined,{clock,limits:limits(10,15),platform:"win32",stderr:()=>{},spawnChild:(_args:string[],context:{name:string})=>{
  chunks.push(context.name);
  const child=new FakeChild();
  children.push(child);
  return child;
 }});
 clock.advance(8);
 children[0]!.emit("close",0,null);
 await flush();
 assert.deepEqual(chunks,["first","second"]);
 clock.advance(7);
 clock.advance(5);
 clock.advance(2);
 assert.deepEqual(await resultPromise,{code:124,signal:null});
 assert.deepEqual(chunks,["first","second"]);
});

test("overall expiry after a completed chunk returns 124 without launching another",async()=>{
 const clock=new FakeClock();
 const calls:string[]=[];
 const errors:string[]=[];
 const result=await runTestPlan([
  {name:"first",args:["tests/first.test.ts"]},
  {name:"second",args:["tests/second.test.ts"]},
 ],async(_args:string[],context:{name:string})=>{calls.push(context.name);clock.advance(5);return {code:0,signal:null};},
 {clock,limits:limits(10,5),stderr:(line:string)=>errors.push(line)});
 assert.deepEqual(result,{code:124,signal:null});
 assert.deepEqual(calls,["first"]);
 assert.deepEqual(errors,["TEST_RUNNER_TIMEOUT owner=test-runner scope=overall chunk=first members=tests/first.test.ts elapsed_ms=5 limit_ms=5 cleanup=completed"]);
 for(const [elapsed,code] of [[4,0],[5,124]] as const){
  const finalClock=new FakeClock();
  const finalErrors:string[]=[];
  const finalResult=await runTestPlan([{name:"final",args:["tests/final.test.ts"]}],
   async()=>{finalClock.advance(elapsed);return {code:0,signal:null};},
   {clock:finalClock,limits:limits(10,5),stderr:(line:string)=>finalErrors.push(line)});
  assert.deepEqual(finalResult,{code,signal:null});
  assert.deepEqual(finalErrors,code===124?["TEST_RUNNER_TIMEOUT owner=test-runner scope=overall chunk=final members=tests/final.test.ts elapsed_ms=5 limit_ms=5 cleanup=completed"]:[]);
 }
});

test("synchronous close during termination leaves no grace timer",async()=>{
 const clock=new FakeClock();
 const child=new FakeChild();
 const done=runTestPlan([{name:"only",args:["tests/a.test.ts"]}],undefined,{clock,limits:limits(4),
  platform:"linux",spawnChild:()=>child,stderr:()=>{},killProcess:()=>child.emit("close",null,"SIGTERM")});
 clock.advance(4);
 assert.deepEqual(await done,{code:124,signal:null});
 assert.equal(clock.timers.size,0);
});

test("natural completion clears timers while spawn failures retain their error identity",async()=>{
 const clock=new FakeClock();
 const child=new FakeChild();
 const done=runTestPlan([{name:"only",args:["tests/a.test.ts"]}],undefined,
  {clock,limits:limits(10),spawnChild:()=>child,stderr:()=>{}});
 child.emit("close",0,null);
 assert.deepEqual(await done,{code:0,signal:null});
 assert.equal(clock.timers.size,0);
 assert.equal(child.unrefCount,0);
 const lateClock=new FakeClock();
 const lateChild=new FakeChild();
 const late=runTestPlan([{name:"late",args:["tests/late.test.ts"]}],undefined,
  {clock:lateClock,limits:limits(10),spawnChild:()=>lateChild,stderr:()=>{}});
 lateClock.nowMs=10;
 lateChild.emit("close",0,null);
 assert.deepEqual(await late,{code:124,signal:null});
 const failure=new Error("spawn failed");
 await assert.rejects(()=>runTestPlan([{name:"only",args:["tests/a.test.ts"]}],undefined,
  {clock:new FakeClock(),limits:limits(10),spawnChild:()=>{throw failure;},stderr:()=>{}}),error=>error===failure);
});

test("kill errors are contained and a late close cannot replace timeout 124",async()=>{
 for(const error of [Object.assign(new Error("gone"),{code:"ESRCH"}),new Error("denied")]){
  const clock=new FakeClock();
  const child=new FakeChild();
  const done=runTestPlan([{name:"only",args:["tests/a.test.ts"]}],undefined,
   {clock,limits:limits(4),platform:"linux",spawnChild:()=>child,stderr:()=>{},killProcess:()=>{throw error;}});
  clock.advance(4);
  clock.advance(5);
  child.emit("close",0,null);
  clock.advance(2);
  assert.deepEqual(await done,{code:124,signal:null});
  assert.equal(clock.timers.size,0);
 }
});
