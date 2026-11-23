import test from "node:test";
import assert from "node:assert/strict";
import {deriveOddFacts,planOddRoute,type OddRoutingRequest} from "../src/flow/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {materializeExecutablePlan} from "../src/orchestration/executable-plan.js";
import {inspectRiskVerifierBinding,type BoundRiskPlanTask} from "../src/runtime/lifecycle/plan-risk-verifier-binding.js";

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

for(const kind of ["ordinary","dual_explicit"] as const){
 test("E3: la revisión "+kind+" rechaza candidatos ajenos antes de guardar el plan",()=>{
  const {plan}=prepared(4,kind);
  const reviewers=plan.agents.filter(agent=>agent.role==="reviewer");
  assert.equal(reviewers.length,kind==="dual_explicit"?2:1);
  for(const target of reviewers){
   for(const change of [
    {revision:"b".repeat(40)},
    {id:"otro-candidato"},
    {repository:"otro/repositorio"}
   ]){
    const modified=plan.agents.map(agent=>agent===target
     ?{...agent,candidate:{...candidate,...change}}:agent);
    assert.throws(()=>materializeExecutablePlan({...plan,agents:modified},instruction),
     /Reviewer independiente debe revisar el mismo candidato/u);
   }
  }
 });
}

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

function binding(item:number,review:"none"|"ordinary"|"dual_explicit"="none"){
 const {plan}=prepared(item,review);
 const graph=materializeExecutablePlan(plan,instruction,"{}");
 const rows:BoundRiskPlanTask[]=graph.tasks.map(task=>({
  taskId:"todo:"+task.id,requestId:"asen-plan:"+task.id,
  description:task.instruction,
  dependsOn:task.dependsOn.map(dep=>"todo:"+dep),
  plan:{role:task.role,skillPaths:[...task.skillPaths],
   ...(task.skillSelection?{skillSelection:task.skillSelection}:{}),
   ...(task.candidate?{candidate:task.candidate}:{}),
   ...(task.candidateRevision?{candidateRevision:task.candidateRevision}:{})},
  current:{state:"planned"}
 }));
 const worker=rows.find(row=>row.plan?.role==="worker");
 assert.ok(worker);
 return {rows,scope:{taskIdentity:graph.taskId,writerTodoId:worker.taskId,
  candidateRevision:revision,reviewerCount:review==="dual_explicit"?2:review==="ordinary"?1:0}};
}
for(const item of [1,2,3,4,5,6]){
 test("E3: el ejecutor verifica la vinculación guardada del riesgo "+item,()=>{
  const {rows,scope}=binding(item);
  assert.equal(inspectRiskVerifierBinding(rows,scope),undefined);
  const without=rows.filter(row=>row.plan?.role!=="verifier");
  assert.match(inspectRiskVerifierBinding(without,scope)??"",/Verifier independiente obligatorio/u);
 });
}
test("E3: un Verifier duplicado, omitido o ya consumido impide pedir permiso Writer",()=>{
 const {rows,scope}=binding(2);
 const verifier=rows.find(row=>row.plan?.role==="verifier");
 assert.ok(verifier);
 assert.match(inspectRiskVerifierBinding([...rows,{...verifier,taskId:"otro-verifier"}],scope)??"",/Verifier independiente obligatorio/u);
 assert.match(inspectRiskVerifierBinding(rows.map(row=>row===verifier?
  {...row,current:{state:"done"}}:row),scope)??"",/Verifier independiente obligatorio/u);
 assert.match(inspectRiskVerifierBinding(rows.map(row=>row===verifier?
  {...row,plan:{...row.plan!,candidateRevision:"b".repeat(40)}}:row),scope)??"",/Verifier independiente obligatorio/u);
});

test("E3: no autorizar Writer con Verifier sin instrucción",()=>{
 const {rows,scope}=binding(2);
 const verifier=rows.find(row=>row.plan?.role==="verifier");
 assert.ok(verifier);
 for(const description of [undefined,"","   "]){
  const altered=rows.map(row=>{
   if(row!==verifier)return row;
   if(description===undefined){
    const withoutDescription={...row};
    delete withoutDescription.description;
    return withoutDescription;
   }
   return {...row,description};
  });
  assert.match(inspectRiskVerifierBinding(altered,scope)??"",
   /Verifier independiente obligatorio/u);
 }
 assert.equal(inspectRiskVerifierBinding(rows,scope),undefined);
});

test("E3: dos revisores obligatorios y Verifier dependiente de ambos",()=>{
 const {rows,scope}=binding(3,"dual_explicit");
 assert.equal(inspectRiskVerifierBinding(rows,scope),undefined);
 const second=rows.find(row=>row.requestId?.endsWith(":reviewer:2"));
 const verifier=rows.find(row=>row.plan?.role==="verifier");
 assert.ok(second&&verifier);
 assert.match(inspectRiskVerifierBinding(rows.filter(row=>row!==second),scope)??"",/revisión independiente/u);
 assert.match(inspectRiskVerifierBinding(rows.map(row=>row===verifier?
  {...row,dependsOn:[scope.writerTodoId]}:row),scope)??"",/no depende exactamente/u);
 assert.match(inspectRiskVerifierBinding(rows.map(row=>row===second?
  {...row,plan:{...row.plan!,candidateRevision:"c".repeat(40)}}:row),scope)??"",/revisión independiente/u);
});

test("E3: no se admite reutilizar la identidad de un Writer de otro plan",()=>{
 const {rows,scope}=binding(6);
 assert.match(inspectRiskVerifierBinding(rows,{...scope,writerTodoId:"otro-todo"})??"",/Writer del plan guardado/u);
 assert.match(inspectRiskVerifierBinding(rows,{...scope,candidateRevision:"no-valid"})??"",/Identidad del plan independiente inválida/u);
});

test("E3: revalidar bajo el bloqueo tras reclamar Writer no exige que siga planned",()=>{
 const {rows,scope}=binding(1);
 const worker=rows.find(row=>row.taskId===scope.writerTodoId);
 assert.ok(worker);
 assert.equal(inspectRiskVerifierBinding(rows.map(row=>row===worker?
  {...row,current:{state:"running"}}:row),scope),undefined);
 assert.match(inspectRiskVerifierBinding(rows.map(row=>row===worker?
  {...row,current:{state:"blocked"}}:row),scope)??"",/Writer del plan guardado/u);
});
