import assert from "node:assert/strict";
import test from "node:test";
import {Dispatcher,type AgentRunner} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {admitRouteEvidence} from "./helpers/route-evidence.js";

const candidate={id:"candidate",repository:"repo",revision:"sha",createdAt:"now"};
const decisionFor=(taskId:string,repository="repo")=>issueOddDecision({
 taskId,repository,
 paths:["src/a.ts","src/b.ts"],
 writes:[{path:"src/a.ts",changeKind:"behavior"},{path:"src/b.ts",changeKind:"behavior"}],
});

test("orchestrated writer cannot execute until its mutation evidence is complete",async()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"task",repository:"repo",prompt:"change behavior",codeChange:true,behaviorChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  decisionFor("task")
 );
 const worker=plan.agents.find(agent=>agent.role==="worker");
 assert.ok(worker);
 let ran=false;
 const runner:AgentRunner={run:async request=>{ran=true;return{id:request.id,ok:true,output:"ok"}}};
 const evidence=new EvidenceStore();
 const dispatcher=new Dispatcher(runner,evidence);
 await assert.rejects(()=>dispatcher.dispatch(worker),/requires passing .* evidence for mutation/);
 assert.equal(ran,false);

 assert.ok(plan.routeEvidence);
 evidence.addRouteDecision(candidate,plan.routeEvidence,{id:"route",summary:"route",createdAt:"now"});
 evidence.add(candidate,{id:"unit",kind:"work-unit",status:"pass",summary:"unit",createdAt:"now"});
 evidence.add(candidate,{id:"scope",kind:"scope",status:"pass",summary:"scope",createdAt:"now"});
 evidence.add(candidate,{id:"rollback",kind:"rollback",status:"pass",summary:"rollback",createdAt:"now"});

 const result=await dispatcher.dispatch(worker);
 assert.equal(result.ok,true);
 assert.equal(ran,true);
});

test("orchestrated writer cannot use evidence from another revision",async()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"task",repository:"repo",prompt:"change code",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  decisionFor("task")
 );
 const worker=plan.agents.find(agent=>agent.role==="worker");
 assert.ok(worker);
 const old={...candidate,revision:"old"};
 const evidence=new EvidenceStore();
 admitRouteEvidence(evidence,old,{id:"route",summary:"old",createdAt:"now"},"old-route");
 for(const [id,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(old,{id,kind,status:"pass",summary:"old",createdAt:"now"});
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,evidence).dispatch(worker),/requires passing .* evidence for mutation/);
});

test("orchestrated writer skill context cannot be downgraded after planning",()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"task",repository:"repo",prompt:"change code",codeChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  decisionFor("task")
 );
 const worker=plan.agents.find(agent=>agent.role==="worker");
 assert.ok(worker?.skillContext);
 assert.equal(Object.isFrozen(worker.skillContext),true);
 assert.throws(()=>{(worker.skillContext as {codeChange?:boolean}).codeChange=false;},TypeError);
 assert.equal(worker.skillContext.codeChange,true);
});

test("writer cannot reuse another task's issued skill context",async()=>{
 const first=buildOrchestrationPlan(
  {taskId:"first",repository:"repo",prompt:"change code",codeChange:true,writeSurfaces:["src"],candidate},
  decisionFor("first")
 );
 const second=buildOrchestrationPlan(
  {taskId:"second",repository:"repo",prompt:"change code",codeChange:true,writeSurfaces:["src"],candidate},
  decisionFor("second")
 );
 const firstWorker=first.agents.find(agent=>agent.role==="worker");
 const secondWorker=second.agents.find(agent=>agent.role==="worker");
 assert.ok(firstWorker?.skillContext&&secondWorker);
 const evidence=new EvidenceStore();
 for(const [id,kind] of [["unit-cross","work-unit"],["scope-cross","scope"],["rollback-cross","rollback"]] as const)
  evidence.add(candidate,{id,kind,status:"pass",summary:"ok",createdAt:"now"});
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"bad"})};
 await assert.rejects(
  ()=>new Dispatcher(runner,evidence).dispatch({...secondWorker,skillContext:firstWorker.skillContext!}),
  /does not match task\/candidate/
 );
});

test("read-only agents cannot exchange their phase authorities",async()=>{
 const plan=buildOrchestrationPlan({taskId:"roles",repository:"repo",prompt:"inspect",candidate},decisionFor("roles"));
 const explorer=plan.agents.find(agent=>agent.role==="explorer");
 const reviewer=plan.agents.find(agent=>agent.role==="reviewer");
 assert.ok(explorer?.skillContext&&explorer.skillPaths&&reviewer?.skillContext);
 const paths=explorer.skillPaths;
 let ran=false;
 const runner:AgentRunner={run:async request=>{ran=true;return{id:request.id,ok:true,output:"bad"}}};
 await assert.rejects(()=>new Dispatcher(runner,new EvidenceStore()).dispatch({...reviewer,skillContext:explorer.skillContext!,skillPaths:paths}),/does not match agent role/);
 assert.equal(ran,false);
});

test("read-only agent authority cannot cross tasks or revisions",async()=>{
 const first=buildOrchestrationPlan({taskId:"first",repository:"repo",prompt:"inspect",candidate},decisionFor("first"));
 const next={...candidate,revision:"next"};
 const second=buildOrchestrationPlan({taskId:"second",repository:"repo",prompt:"inspect",candidate:next},decisionFor("second"));
 const old=first.agents.find(agent=>agent.role==="explorer"),explorer=second.agents.find(agent=>agent.role==="explorer");
 assert.ok(old?.skillContext&&old.skillPaths&&explorer);
 let ran=false;
 const dispatcher=new Dispatcher({run:async r=>{ran=true;return{id:r.id,ok:true,output:"unexpected"}}},new EvidenceStore());
 await assert.rejects(()=>dispatcher.dispatch({...explorer,skillContext:old.skillContext!,skillPaths:old.skillPaths!}),/task\/candidate/);
 const {candidate:omitted,...withoutCandidate}=explorer;
 await assert.rejects(()=>dispatcher.dispatch(withoutCandidate),/task\/candidate/);
 assert.equal(ran,false);
});
