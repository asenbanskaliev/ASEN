import assert from "node:assert/strict";
import test from "node:test";
import {projectParallelAgentFlow} from "../src/runtime/ui/agent-flow-overview.js";
import {renderAsenWorkRow,type AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";
import {renderAsenT11CompactStatus} from "../src/runtime/ui/t11-compact-status.js";
import {renderT11CompactFallback} from "../src/runtime/ui/m1-readonly-rail.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const cleanChanges={
 status:"clean" as const,changedPaths:[],outOfScopePaths:[],
 headMatchesBase:true,sourceVerified:true,
 acceptance:"not-accepted" as const,autoMerge:false as const
};
const overview=projectParallelAgentFlow([{
 batchId:"prueba-de-lectura",state:"prepared",supervisorClaimed:true,tasks:[
  {sourceTodoId:"activo",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:true,changes:cleanChanges,
   childSession:{id:"pi-sesion-activa",agents:[{id:"agente-vivo",role:"worker",state:"running"}]}},
  {sourceTodoId:"bloqueado",sourceTodoUnchanged:true,worktreePresent:true,
   handoffClaimed:true,changes:cleanChanges,
   childSession:{id:"pi-sesion-fallida",agents:[{id:"agente-fallido",role:"worker",state:"failed"}]}}
 ]
}]);
const observed:AsenPanelSnapshot={
 todos:[],agents:[],jobs:[],
 agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,overview}
};

test("T11/T07: con dos Workers se muestra primero el bloqueo en el modo estrecho",()=>{
 assert.equal(overview.stages.blocked,1);
 assert.equal(overview.stages["running-observed"],1);
 const before=structuredClone(observed);
 for(const width of [40,50,80,120,139]){
  const row=renderT11CompactFallback(observed,width);
  assert.ok(visibleWidth(row)<=width,width+": "+row);
  assert.match(row,/\/asen-panel$/u);
  assert.match(row,/child tasks blocked/u,
   "Un Worker fallido no debe ocultarse detrás del Worker activo");
  assert.equal(row.includes("child Workers observed")&&width===40,false);
 }
 const wide=renderAsenWorkRow(observed,139)??"";
 assert.ok(wide.indexOf("child tasks blocked")<wide.indexOf("child Workers observed"));
 assert.deepEqual(observed,before,"La presentación no modifica el estado Pi");
});

test("T11/T07: la barra de Pi cuenta solo bloqueos hijos comprobados",()=>{
 for(const width of [40,50,80,120,139]){
  const line=renderAsenT11CompactStatus(observed,width);
  assert.match(line,/! 1 bloqueos/u);
  assert.ok(visibleWidth(line)<=width);
  if(width>=50)assert.match(line,/\/asen-panel$/u);
 }
 const unavailable:AsenPanelSnapshot={...observed,agentFlowUnavailable:true};
 for(const data of [
  unavailable,
  {...observed,activityUnavailable:true} satisfies AsenPanelSnapshot
 ]){
  const compact=renderAsenT11CompactStatus(data,80);
  assert.doesNotMatch(compact,/! 1 bloqueos/u,
   "Un Worker de un diario ya no disponible no es un bloqueo actualizado");
  assert.match(compact,/! (?:hijos|actividad) no disponible/u);
 }
});

test("T11/T07: la lectura vacía no inventa un bloqueo",()=>{
 const empty:AsenPanelSnapshot={todos:[],agents:[],jobs:[],
  agentFlow:{state:"observed",totalRecordedBatches:0,limited:false,
   overview:projectParallelAgentFlow([])}
 };
 assert.doesNotMatch(renderAsenT11CompactStatus(empty,80),/bloqueos/u);
 assert.equal(empty.agentFlow?.overview.acceptance,"not-accepted");
 assert.equal(overview.acceptance,"not-accepted");
 assert.equal(overview.autoMerge,false);
});
