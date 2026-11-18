import test from "node:test";
import assert from "node:assert/strict";
import {combineT11LocalWithChild,createT11RailObserver,shouldObserveT11Surface} from "../src/runtime/ui/t11-rail-observer.js";
import {projectParallelAgentFlow} from "../src/runtime/ui/agent-flow-overview.js";
import {renderT11CompactFallback} from "../src/runtime/ui/m1-readonly-rail.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

const local:AsenPanelSnapshot={todos:[],agents:[],jobs:[]};

test("T11/T07: el modo compacto observa hijos y el oculto no",async()=>{
 const view={railActive:false,compactWidget:true,position:"auto" as const,preset:"neutral" as const};
 assert.equal(shouldObserveT11Surface(view),true);
 assert.equal(shouldObserveT11Surface({...view,position:"hidden"}),false);
 assert.equal(shouldObserveT11Surface({...view,preset:"light"}),false);
 assert.equal(shouldObserveT11Surface({...view,compactWidget:false}),false);
 assert.equal(shouldObserveT11Surface({...view,railActive:true}),true);
 let reads=0,updates=0,current=true;
 const observer=createT11RailObserver({autoStart:false,
  active:()=>shouldObserveT11Surface(view),current:()=>current,
  read:async()=>{reads++;return local;},
  onSnapshot:()=>{updates++;},onUnavailable:()=>{assert.fail("No debía fallar");}
 });
 await observer.refreshNow();
 assert.equal(reads,1);assert.equal(updates,1);
 current=false;await observer.refreshNow();
 assert.equal(reads,1);assert.equal(updates,1);
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
 assert.deepEqual(combineT11LocalWithChild(local,undefined,false),local);
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
