import test from "node:test";
import assert from "node:assert/strict";
import {deriveOddFacts,planOddRoute,type OddRoutingRequest} from "../src/flow/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {materializeExecutablePlan} from "../src/orchestration/executable-plan.js";

const project="asen/e3-proyecto";
const revision="a".repeat(40);
const candidate={id:"e3-candidato",repository:project,revision,createdAt:"2026-11-23T00:00:00.000Z"};
const instruction="Aplicar un cambio limitado y verificar su seguridad";
const request=(item:number,review:"none"|"ordinary"|"dual_explicit"="none"):OddRoutingRequest=>({
 taskIdentity:"E3-riesgo-"+item,repositoryIdentity:project,intent:"implementation",
 scope:{kind:"known",expectedPaths:["src/e3.ts"]},
 writes:[{path:"src/e3.ts",changeKind:"behavior"}],
 riskOperations:[],
 namedRisks:[{item:item as 1|2|3|4|5|6,reason:"Riesgo específico "+item}],
 session:{estimatedMinutes:25,continuation:false},
 testing:{kind:"required"},review:{kind:review,estimatedMinutes:12},
 unresolvedDecisions:[]
});
function prepared(item:number,review:"none"|"ordinary"|"dual_explicit"="none"){
 const facts=deriveOddFacts(request(item,review));
 const decision=planOddRoute(facts);
 const plan=buildOrchestrationPlan({
  taskId:decision.taskIdentity,repository:project,prompt:instruction,
  candidate,writeSurfaces:["src/e3.ts"]
 },decision);
 return {decision,plan};
}

for(const item of [1,2,3,4,5,6]){
 test("E3: el riesgo nombrado "+item+" exige Verifier detrás del Worker",()=>{
  const {decision,plan}=prepared(item);
  assert.equal(decision.verification,"independent");
  const executable=materializeExecutablePlan(plan,instruction);
  const worker=executable.tasks.find(task=>task.role==="worker");
  const verifier=executable.tasks.find(task=>task.role==="verifier");
  assert.ok(worker&&verifier);
  assert.deepEqual(verifier.dependsOn,[worker.id]);
  assert.equal(verifier.candidateRevision,revision);
  assert.ok(executable.topologicalOrder.indexOf(worker.id)<executable.topologicalOrder.indexOf(verifier.id));
  assert.equal(verifier.execution,"not_started");
  assert.equal(verifier.authorization,"required_before_dispatch");
 });
}

test("E3: un plan manipulado sin Verifier o con dos queda bloqueado",()=>{
 const {plan}=prepared(2);
 const without={...plan,agents:plan.agents.filter(agent=>agent.role!=="verifier")};
 assert.throws(()=>materializeExecutablePlan(without,instruction),/exactamente un Verifier/u);
 const verifier=plan.agents.find(agent=>agent.role==="verifier");
 assert.ok(verifier);
 assert.throws(()=>materializeExecutablePlan({...plan,agents:[...plan.agents,verifier]},instruction),
  /exactamente un Verifier/u);
});

test("E3: la revisión doble debe preceder al Verifier, sin aceptación automática",()=>{
 const {plan}=prepared(4,"dual_explicit");
 const executable=materializeExecutablePlan(plan,instruction);
 const worker=executable.tasks.find(task=>task.role==="worker");
 const judges=executable.tasks.filter(task=>task.role==="reviewer");
 const verifier=executable.tasks.find(task=>task.role==="verifier");
 assert.ok(worker&&verifier);
 assert.equal(judges.length,2);
 assert.deepEqual(new Set(verifier.dependsOn),new Set([worker.id,...judges.map(judge=>judge.id)]));
 for(const judge of judges){
  assert.deepEqual(judge.dependsOn,[worker.id]);
  assert.ok(executable.topologicalOrder.indexOf(judge.id)<executable.topologicalOrder.indexOf(verifier.id));
 }
 assert.equal(executable.authorization,"required_before_dispatch");
});

test("E3: el Verifier de otro candidato no sirve para el cambio autorizado",()=>{
 const {plan}=prepared(5);
 const modified=plan.agents.map(agent=>agent.role==="verifier"
  ?{...agent,candidate:{...candidate,revision:"b".repeat(40)}}:agent);
 assert.throws(()=>materializeExecutablePlan({...plan,agents:modified},instruction),
  /mismo candidato/u);
});

test("E3: una verificación sin Writer sigue permitida como tarea de lectura",()=>{
 const req:OddRoutingRequest={...request(1),taskIdentity:"E3-solo-verificacion",
  intent:"verification",writes:[],namedRisks:[],review:{kind:"none",estimatedMinutes:0}};
 const decision=planOddRoute(deriveOddFacts(req));
 assert.equal(decision.route,"verify");
 const plan=buildOrchestrationPlan({taskId:decision.taskIdentity,repository:project,prompt:instruction,candidate},decision);
 const executable=materializeExecutablePlan(plan,instruction);
 assert.equal(executable.tasks.filter(t=>t.role==="worker").length,0);
 assert.equal(executable.tasks.filter(t=>t.role==="verifier").length,1);
});
