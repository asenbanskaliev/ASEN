import assert from "node:assert/strict";
import test from "node:test";
import {Dispatcher,type AgentRunner} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {routeOdd} from "../src/flow/odd.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";

const candidate={id:"candidate",repository:"repo",revision:"sha",createdAt:"now"};

test("orchestrated writer cannot execute until its mutation evidence is complete",async()=>{
 const plan=buildOrchestrationPlan(
  {taskId:"task",repository:"repo",prompt:"change behavior",codeChange:true,behaviorChange:true,filesTouched:4,writeSurfaces:["src"],candidate},
  routeOdd({filesTouched:4})
 );
 const worker=plan.agents.find(agent=>agent.role==="worker");
 assert.ok(worker);
 let ran=false;
 const runner:AgentRunner={run:async request=>{ran=true;return{id:request.id,ok:true,output:"ok"}}};
 const evidence=new EvidenceStore();
 const dispatcher=new Dispatcher(runner,evidence);
 await assert.rejects(()=>dispatcher.dispatch(worker),/route-decision evidence/);
 assert.equal(ran,false);

 evidence.add(candidate,{id:"route",kind:"route-decision",status:"pass",summary:"route",createdAt:"now"});
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
  routeOdd({filesTouched:4})
 );
 const worker=plan.agents.find(agent=>agent.role==="worker");
 assert.ok(worker);
 const old={...candidate,revision:"old"};
 const evidence=new EvidenceStore();
 for(const [id,kind] of [["route","route-decision"],["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(old,{id,kind,status:"pass",summary:"old",createdAt:"now"});
 const runner:AgentRunner={run:async request=>({id:request.id,ok:true,output:"bad"})};
 await assert.rejects(()=>new Dispatcher(runner,evidence).dispatch(worker),/route-decision evidence/);
});
