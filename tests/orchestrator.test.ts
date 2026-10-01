import assert from "node:assert/strict";
import test from "node:test";
import {routeOdd} from "../src/flow/odd.js";
import * as oddRouting from "../src/flow/odd-routing.js";
import {
  buildOrchestrationPlan,
  claimedOrchestrationRouteContext,
} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";

const candidate={id:"c",repository:"r",revision:"sha",createdAt:"now"};
const orchestrated=(taskId="t",repository="r")=>issueOddDecision({
 taskId,repository,paths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],
});
const invokeWithUnknownDecision=(input:Parameters<typeof buildOrchestrationPlan>[0],decision:unknown)=>
 Reflect.apply(buildOrchestrationPlan,undefined,[input,decision]);

test("orchestration uses one writer and read-only reviewer/verifier",()=>{
 const decision=orchestrated();
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",writeSurfaces:["src"],candidate},decision);
 assert.deepEqual(p.agents.map(a=>a.role),["explorer","worker","reviewer","verifier"]);
 assert.equal(p.agents.filter(a=>a.writeSurfaces?.length).length,1);
 assert.equal(p.decision,decision);
 assert.equal(Object.isFrozen(p.decision),true);
 assert.equal(JSON.stringify(p).match(/evidenceToken|authority|verdict|mutationCallback/giu),null);
});

test("verification intent creates only verifier",()=>{
 const decision=issueOddDecision({taskId:"t",repository:"r",intent:"verification"});
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p"},decision);
 assert.deepEqual(p.agents.map(a=>a.role),["verifier"]);
});

test("incident routing preserves its existing non-admitted worker role",()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"incident",repository:"r",prompt:"diagnose",codeChange:true,behaviorChange:true,filesTouched:99,candidate},
  issueOddDecision({taskId:"incident",repository:"r",intent:"incident"}),
 );
 assert.deepEqual(plan.agents.map(agent=>agent.role),["explorer","worker","reviewer","verifier"]);
 assert.equal(plan.agents.find(agent=>agent.role==="worker")?.writeSurfaces,undefined);
});

test("orchestration derives mandatory skills from original high-risk behavior facts",()=>{
 const fixture={
  taskId:"t",repository:"r",paths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],
  writes:[{path:"src/a.ts",changeKind:"behavior" as const}],riskOperations:["security_boundary" as const],
 };
 const expected=["asen-phase-protocol","asen-work-unit","asen-safe-change","asen-apply","asen-odd","asen-tdd","asen-review"];
 const understated=buildOrchestrationPlan(
  {taskId:"t",repository:"r",prompt:"p",codeChange:false,behaviorChange:false,filesTouched:0,writeSurfaces:["src"],candidate},
  issueOddDecision(fixture),
 );
 const omitted=buildOrchestrationPlan(
  {taskId:"t",repository:"r",prompt:"p",writeSurfaces:["src"],candidate},
  issueOddDecision(fixture),
 );
 assert.deepEqual(understated.skills,expected);
 assert.deepEqual(omitted.skills,expected);
});

test("obsolete caller skill facts are never observed",()=>{
 let reads=0;
 const input={taskId:"getters",repository:"r",prompt:"p",writeSurfaces:["src"],candidate};
 for(const field of ["codeChange","behaviorChange","filesTouched"] as const){
  Object.defineProperty(input,field,{enumerable:true,get(){reads++;throw new Error("obsolete getter invoked");}});
 }
 const plan=buildOrchestrationPlan(input,issueOddDecision({
  taskId:"getters",repository:"r",paths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],
  writes:[{path:"src/a.ts",changeKind:"behavior"}],
 }));
 assert.equal(reads,0);
 const context=plan.agents.find(agent=>agent.role==="worker")?.skillContext;
 assert.equal(context?.taskId,"getters:worker");
 assert.equal(context?.repository,"r");
 assert.equal(context?.candidateId,"c");
 assert.equal(context?.candidateRevision,"sha");
 assert.equal(context?.codeChange,true);
 assert.equal(context?.behaviorChange,true);
 assert.equal(context?.filesTouched,4);
 assert.equal(context?.risk,"medium");
});

test("declared write kinds preserve exact code and behavior skill predicates",()=>{
 const cases=["schema","security","migration"] as const;
 for(const changeKind of cases){
  const taskId=`kind-${changeKind}`;
  const plan=buildOrchestrationPlan(
   {taskId,repository:"r",prompt:"p"},
   issueOddDecision({taskId,repository:"r",paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind}]}),
  );
  assert.equal(plan.skills.includes("asen-safe-change"),true);
  assert.equal(plan.skills.includes("asen-tdd"),false);
 }
 const docs=buildOrchestrationPlan(
  {taskId:"docs",repository:"r",prompt:"p",skillPhase:"apply"},
  issueOddDecision({taskId:"docs",repository:"r",paths:["docs/a.md"],writes:[{path:"docs/a.md",changeKind:"documentation"}]}),
 );
 assert.deepEqual(docs.skills,["asen-phase-protocol","asen-work-unit","asen-safe-change","asen-apply"]);
 assert.equal(docs.skills.includes("asen-tdd"),false);
});

test("unknown declared scope remains a bounded clarification plan",()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"unknown",repository:"r",prompt:"p",codeChange:true,behaviorChange:true,filesTouched:99,writeSurfaces:["src"],candidate},
  issueOddDecision({taskId:"unknown",repository:"r",scope:{kind:"unknown",reason:"needs mapping"},testingRequired:false}),
 );
 assert.equal(plan.decision.route,"plan");
 assert.deepEqual(plan.agents,[]);
 assert.equal(plan.skills.includes("asen-odd"),true);
 assert.equal(plan.skills.includes("asen-review"),true);
 assert.equal(plan.skills.includes("asen-tdd"),false);
});

test("writer is bound to the exact orchestration candidate",()=>{
 const decision=issueOddDecision({
  taskId:"t",repository:"r",paths:["src/a.ts","src/b.ts","src/c.ts","src/d.ts"],
  writes:[{path:"src/a.ts",changeKind:"configuration"}],
 });
 const p=buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:false,filesTouched:0,writeSurfaces:["src"],candidate},decision);
 const worker=p.agents.find(a=>a.role==="worker");
 assert.deepEqual(worker?.candidate,candidate);
 assert.equal(worker?.skillContext?.codeChange,true);
});

test("successful orchestration exposes immutable exact claimed context", () => {
 const decision = orchestrated();
 assert.throws(() => claimedOrchestrationRouteContext(decision), /not genuinely claimed/);
 assert.throws(() => claimedOrchestrationRouteContext({ route: "direct" }), /not genuinely claimed/);

 buildOrchestrationPlan(
  { taskId: "t", repository: "r", prompt: "p", candidate },
  decision,
 );
 const context = claimedOrchestrationRouteContext(decision);
 assert.deepEqual(context.candidate, { id: "c", repository: "r", revision: "sha" });
 assert.equal(context.facts.taskIdentity, "t");
 assert.ok(Object.isFrozen(context));
 assert.ok(Object.isFrozen(context.candidate));
 assert.ok(Object.isFrozen(context.facts));
 assert.equal(JSON.stringify(context).match(/authority|readiness|verdict|callback/giu), null);
 assert.throws(() => claimedOrchestrationRouteContext({ ...decision }), /not genuinely claimed/);
 assert.throws(
  () => buildOrchestrationPlan(
   { taskId: "t", repository: "r", prompt: "p", candidate: { ...candidate, id: "other" } },
   decision,
  ),
  /already been claimed/,
 );
 assert.deepEqual(claimedOrchestrationRouteContext(decision).candidate, context.candidate);
 assert.equal(Object.keys(oddRouting).some(key => /bind.*candidate/iu.test(key)), false);
});

test("candidate-less orchestration has no claimed route context", () => {
 const decision = issueOddDecision({ taskId: "candidate-less", repository: "r" });
 buildOrchestrationPlan({ taskId: "candidate-less", repository: "r", prompt: "p" }, decision);
 assert.throws(
  () => claimedOrchestrationRouteContext(decision),
  /no successful candidate-bound orchestration plan/,
 );
});

test("writer orchestration fails closed without candidate and burns the decision",()=>{
 const decision=orchestrated();
 assert.throws(()=>buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,filesTouched:4,writeSurfaces:["src"]},decision),/exact candidate/);
 assert.throws(()=>buildOrchestrationPlan({taskId:"t",repository:"r",prompt:"p",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},decision),/already been claimed/);
});

test("writer orchestration refuses a non-apply phase before issuing authority",()=>{
 assert.throws(()=>buildOrchestrationPlan({taskId:"task",repository:"r",prompt:"write",skillPhase:"explore",writeSurfaces:["src"],candidate},orchestrated("task")),/apply phase/);
});

test("failed orchestration has no claimed route context", () => {
 const decision = orchestrated("failed-context");
 assert.throws(
  () => buildOrchestrationPlan({
   taskId: "failed-context",
   repository: "r",
   prompt: "write",
   skillPhase: "explore",
   writeSurfaces: ["src"],
   candidate,
  }, decision),
  /apply phase/,
 );
 assert.throws(
  () => claimedOrchestrationRouteContext(decision),
  /no successful candidate-bound orchestration plan/,
 );
});

test("orchestration passes exact selected SKILL.md paths to delegated agents",()=>{
 const p=buildOrchestrationPlan(
  {taskId:"phase",repository:"r",prompt:"implement",skillPhase:"apply",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  orchestrated("phase")
 );
 const explorer=p.agents.find(a=>a.role==="explorer");
 const worker=p.agents.find(a=>a.role==="worker");
 const reviewer=p.agents.find(a=>a.role==="reviewer");
 const verifier=p.agents.find(a=>a.role==="verifier");
 assert.deepEqual(worker?.skillPaths,[
  "skills/asen-phase-protocol/SKILL.md",
  "skills/asen-work-unit/SKILL.md",
  "skills/asen-safe-change/SKILL.md",
  "skills/asen-apply/SKILL.md",
  "skills/asen-odd/SKILL.md"
 ]);
 assert.ok(explorer?.skillPaths?.includes("skills/asen-explore/SKILL.md"));
 assert.equal(explorer?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
 assert.ok(reviewer?.skillPaths?.includes("skills/asen-adversarial-review/SKILL.md"));
 assert.equal(reviewer?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
 assert.ok(verifier?.skillPaths?.includes("skills/asen-verify/SKILL.md"));
 assert.equal(verifier?.skillPaths?.includes("skills/asen-apply/SKILL.md"),false);
});

test("delegated role contexts are independently issued and task-bound",()=>{
 const p=buildOrchestrationPlan({taskId:"phase",repository:"r",prompt:"implement",skillPhase:"apply",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},orchestrated("phase"));
 assert.equal(p.agents.find(a=>a.role==="explorer")?.skillContext?.taskId,"phase:explore");
 assert.equal(p.agents.find(a=>a.role==="worker")?.skillContext?.taskId,"phase:worker");
 assert.equal(p.agents.find(a=>a.role==="reviewer")?.skillContext?.taskId,"phase:review");
 assert.equal(p.agents.find(a=>a.role==="verifier")?.skillContext?.taskId,"phase:verify");
});

test("rejects legacy, manual, and cloned route decisions",()=>{
 const input={taskId:"legacy",repository:"r",prompt:"p"};
 assert.throws(()=>invokeWithUnknownDecision(input,routeOdd({filesTouched:4})),/not issued here/);
 assert.throws(()=>invokeWithUnknownDecision(input,{route:"direct",risk:"low",verification:"structural",reasons:[]}),/not issued here/);
 const genuine=issueOddDecision({taskId:"legacy",repository:"r"});
 assert.throws(()=>invokeWithUnknownDecision(input,{...genuine}),/not issued here/);
 const plan=buildOrchestrationPlan(input,genuine);
 assert.equal(plan.decision,genuine);
});

test("a genuine decision builds exactly one plan",()=>{
 const decision=issueOddDecision({taskId:"once",repository:"r"});
 buildOrchestrationPlan({taskId:"once",repository:"r",prompt:"p"},decision);
 assert.throws(()=>buildOrchestrationPlan({taskId:"once",repository:"r",prompt:"p"},decision),/already been claimed/);
});

test("cross-task first attempt burns the genuine decision",()=>{
 const decision=issueOddDecision({taskId:"expected",repository:"r"});
 assert.throws(()=>buildOrchestrationPlan({taskId:"other",repository:"r",prompt:"p"},decision),/task mismatch/);
 assert.throws(()=>buildOrchestrationPlan({taskId:"expected",repository:"r",prompt:"p"},decision),/already been claimed/);
});

test("cross-repository first attempt burns the genuine decision",()=>{
 const decision=issueOddDecision({taskId:"task",repository:"expected"});
 assert.throws(()=>buildOrchestrationPlan({taskId:"task",repository:"other",prompt:"p"},decision),/repository mismatch/);
 assert.throws(()=>buildOrchestrationPlan({taskId:"task",repository:"expected",prompt:"p"},decision),/already been claimed/);
});
