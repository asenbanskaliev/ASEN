import test from "node:test";
import assert from "node:assert/strict";
import {combineT11LocalWithChild,createT11ChildExpiryController,createT11RailObserver,observeT11ChildAvailability,shouldObserveT11Surface} from "../src/runtime/ui/t11-rail-observer.js";
import {projectParallelAgentFlow} from "../src/runtime/ui/agent-flow-overview.js";
import {renderT11CompactFallback} from "../src/runtime/ui/m1-readonly-rail.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

const local:AsenPanelSnapshot={todos:[],agents:[],jobs:[]};

test("T11/T07: el modo compacto observa hijos y el oculto no",async()=>{
 const view={railActive:false,compactWidget:true,position:"auto" as const,preset:"neutral" as const};
 assert.equal(shouldObserveT11Surface(view),true);
 assert.equal(shouldObserveT11Surface({...view,position:"hidden"}),false);
 assert.equal(shouldObserveT11Surface({...view,position:"hidden",railActive:true}),false,
  "Ocultar el panel debe detener la lectura aunque quede un lateral anterior");
 assert.equal(shouldObserveT11Surface({...view,position:"right",compactWidget:false,railActive:true}),true,
  "La derecha visible conserva su lectura real");
 assert.equal(shouldObserveT11Surface({...view,position:"right",compactWidget:false,railActive:false}),false,
  "No simular un panel a la derecha si Pi no lo ha instalado");
 assert.equal(shouldObserveT11Surface({...view,preset:"light"}),false);
 assert.equal(shouldObserveT11Surface({...view,compactWidget:false}),false);
 assert.equal(shouldObserveT11Surface({...view,railActive:true}),true);
 let reads=0,updates=0,unavailable=0,current=true;
 const observer=createT11RailObserver({autoStart:false,
  active:()=>shouldObserveT11Surface(view),current:()=>current,
  read:async()=>{reads++;return local;},
  onSnapshot:()=>{updates++;},onUnavailable:()=>{unavailable++;}
 });
 await observer.refreshNow();
 assert.equal(reads,1);assert.equal(updates,1);assert.equal(unavailable,0);
 current=false;await observer.refreshNow();
 assert.equal(reads,1);assert.equal(updates,1);assert.equal(unavailable,0);
 observer.stop();
});

test("T11/T07: una lectura local no borra hijos recientes ni copia datos obsoletos",()=>{
 const prior:AsenPanelSnapshot={
  ...local,changes:{branch:"anterior",files:5},
  review:{pending:3},permission:"YOLO",
  agentFlow:{state:"observed",totalRecordedBatches:1,limited:false,
   overview:projectParallelAgentFlow([])}
 };
 const original=structuredClone(prior);
 const fresh=combineT11LocalWithChild(local,prior,true);
 assert.equal(fresh.agentFlow,prior.agentFlow);
 assert.equal(fresh.review,undefined);
 assert.equal(fresh.changes,undefined);
 assert.equal(fresh.permission,undefined);
 const expired=combineT11LocalWithChild(local,prior,false);
 assert.equal(expired.agentFlow,undefined);
 assert.equal(expired.agentFlowUnavailable,true);
 const broken=combineT11LocalWithChild(local,{...prior,agentFlowUnavailable:true},true);
 assert.equal(broken.agentFlow,undefined);
 assert.equal(broken.agentFlowUnavailable,true);
 assert.deepEqual(combineT11LocalWithChild(local,undefined,false),{...local,agentFlowUnavailable:true});
 assert.deepEqual(prior,original);
});

test("T11/T07: actividad nueva recupera el panel sin atribuir éxitos a hijos desconocidos",()=>{
 const previous:AsenPanelSnapshot={...local,activityUnavailable:true,
  agentFlowUnavailable:true,review:{pending:9}};
 const updated:AsenPanelSnapshot={
  todos:[{current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]],
  agents:[],jobs:[]
 };
 const result=combineT11LocalWithChild(updated,previous,true);
 assert.equal(result.todos.length,1);
 assert.equal(result.activityUnavailable,undefined);
 assert.equal(result.agentFlowUnavailable,true);
 assert.equal(result.review,undefined);
 assert.equal(result.agentFlow,undefined);
});

test("T11/T07: el resumen compacto muestra Workers observados y nunca convierte caducidad en cero",()=>{
 const changes={status:"clean" as const,changedPaths:[],outOfScopePaths:[],
  sourceVerified:true,headMatchesBase:true,acceptance:"not-accepted" as const,autoMerge:false as const};
 const flow=projectParallelAgentFlow([{
  batchId:"lote-pi",state:"prepared",supervisorClaimed:true,tasks:[
   {sourceTodoId:"a",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
    changes,childSession:{id:"sesion-a",agents:[{id:"pi-worker-a",role:"worker",state:"running"}]}},
   {sourceTodoId:"b",sourceTodoUnchanged:true,worktreePresent:true,handoffClaimed:true,
    changes,childSession:{id:"sesion-b",agents:[{id:"pi-worker-b",role:"worker",state:"queued"}]}}
  ]
 }]);
 const prior:AsenPanelSnapshot={...local,agentFlow:{
  state:"observed",totalRecordedBatches:1,limited:false,overview:flow
 }};
 const fresh=combineT11LocalWithChild(local,prior,true);
 const live=renderT11CompactFallback(fresh,139);
 assert.match(live,/1 child Workers observed/u);
 assert.match(live,/1 hijos en cola/u);
 const expired=combineT11LocalWithChild(local,prior,false);
 for(const width of [24,40,80,120,139]){
  const row=renderT11CompactFallback(expired,width);
  assert.ok(visibleWidth(row)<=width);
  assert.match(row,/\/asen-panel/u);
  if(width>=40)assert.match(row,/hijos no disponibles/u);
  assert.doesNotMatch(row,/child Workers observed|hijos en cola|0 child Workers/u);
 }
 const recovered=renderT11CompactFallback(fresh,139);
 assert.match(recovered,/1 child Workers observed/u);
 assert.doesNotMatch(recovered,/hijos no disponibles/u);
});

test("T11/T07: antes del primer sondeo el panel debe mostrar hijos desconocidos",()=>{
 for(const fresh of [false,true]){
  const pending=combineT11LocalWithChild(local,undefined,fresh);
  assert.equal(pending.agentFlowUnavailable,true);
  assert.equal(pending.agentFlow,undefined);
  for(const width of [24,40,50,80,120,139]){
   const row=renderT11CompactFallback(pending,width);
   assert.ok(visibleWidth(row)<=width,width+": "+row);
   assert.match(row,/\/asen-panel/u);
   assert.doesNotMatch(row,/No work|0 child Workers|0 hijos|PASS/u);
   if(width>=40)assert.match(row,/hijos no disponibles/u);
  }
 }
});

test("T11/T07: un diario comprobado y vacío sí puede mostrar ausencia de hijos",()=>{
 const none:AsenPanelSnapshot={...local,agentFlow:{
  state:"absent",totalRecordedBatches:0,limited:false,
  overview:projectParallelAgentFlow([])
 }};
 const observed=combineT11LocalWithChild(local,none,true);
 assert.equal(observed.agentFlow,none.agentFlow);
 assert.equal(observed.agentFlowUnavailable,undefined);
 const line=renderT11CompactFallback(observed,120);
 assert.doesNotMatch(line,/hijos no disponibles/u);
 const expired=combineT11LocalWithChild(local,none,false);
 assert.equal(expired.agentFlowUnavailable,true);
 assert.equal(expired.agentFlow,undefined);
});

test("T11/T07: el estado de hijos caduca sin esperar un nuevo turno de Pi",{
 timeout:10000
},async()=>{
 const sleep=(ms:number)=>new Promise<void>(done=>setTimeout(done,ms));
 let expiries=0;
 const timer=createT11ChildExpiryController(()=>{expiries++;},30);
 // Dos observaciones rápidas no permiten dos expiraciones del mismo estado.
 timer.renew();timer.renew();
 await sleep(150);
 assert.equal(expiries,1);
 // Una cancelación y un cierre no deben publicar cambios de otro propietario.
 timer.renew();timer.clear();
 await sleep(90);
 assert.equal(expiries,1);
 timer.renew();timer.stop();timer.renew();
 await sleep(90);
 assert.equal(expiries,1);
});

test("T11/T07: la caducidad no acepta plazos inválidos ni inventa estados",()=>{
 for(const bad of [0,-1,NaN,1.5,30001,Infinity])
  assert.throws(()=>createT11ChildExpiryController(()=>{},bad));
 const child=combineT11LocalWithChild(local,undefined,false);
 assert.equal(child.agentFlowUnavailable,true);
 assert.equal(child.agentFlow,undefined);
});

test("T11/T07: el panel distingue diario no observado de diario observado vacío",()=>{
 const original:AsenPanelSnapshot={...local,review:{pending:3}};
 const unknown=observeT11ChildAvailability(original);
 assert.equal(unknown.agentFlowUnavailable,true);
 assert.equal(unknown.agentFlow,undefined);
 assert.equal(original.agentFlowUnavailable,undefined,
  "La vista no puede modificar las evidencias originales");
 const notice=renderT11CompactFallback(unknown,80);
 assert.match(notice,/hijos no disponibles/u);
 const empty:AsenPanelSnapshot={...local,agentFlow:{
  state:"absent",totalRecordedBatches:0,limited:false,
  overview:projectParallelAgentFlow([])
 }};
 const observed=observeT11ChildAvailability(empty);
 assert.equal(observed,empty);
 assert.equal(observed.agentFlowUnavailable,undefined);
 const failed=observeT11ChildAvailability({...empty,agentFlowUnavailable:true});
 assert.equal(failed.agentFlowUnavailable,true,
  "Un fallo reciente prevalece sobre la lectura antigua");
 const unavailable=observeT11ChildAvailability({...local,activityUnavailable:true});
 assert.equal(unavailable.activityUnavailable,true);
 assert.equal(unavailable.agentFlowUnavailable,undefined,
  "El aviso total sigue teniendo prioridad");
});
