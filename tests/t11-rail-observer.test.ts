import test from "node:test";
import assert from "node:assert/strict";
import {createT11RailObserver,unavailableT11RailSnapshot} from "../src/runtime/ui/t11-rail-observer.js";
import {renderAsenPanel,renderAsenPanelSection,renderAsenWorkRow} from "../src/runtime/ui/ide-panel.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";
const data:AsenPanelSnapshot={todos:[],agents:[],jobs:[]};
test("T11: observar solo si el lateral existe y la sesión sigue siendo la misma",async()=>{
 let visible=false,current=true,reads=0,applies=0,unknown=0;
 const o=createT11RailObserver({autoStart:false,active:()=>visible,current:()=>current,
  read:async()=>{reads++;return data;},
  onSnapshot:()=>{applies++;},onUnavailable:()=>{unknown++;}
 });
 await o.refreshNow();assert.equal(reads,0);
 visible=true;await o.refreshNow();assert.equal(reads,1);assert.equal(applies,1);
 current=false;await o.refreshNow();assert.equal(reads,1);
 current=true;await o.refreshNow();assert.equal(reads,1,"Una sesión antigua no puede volver a observar");
 assert.equal(unknown,0);
});
test("T11: detener mientras se lee descarta el resultado tardío",async()=>{
 let resolve!: (value:AsenPanelSnapshot)=>void;
 let began!:()=>void;const started=new Promise<void>(done=>{began=done;});
 let observed=0;
 const o=createT11RailObserver({autoStart:false,active:()=>true,current:()=>true,
  read:()=>{began();return new Promise(done=>{resolve=done;});},
  onSnapshot:()=>{observed++;},onUnavailable:()=>{observed++;}
 });
 const pending=o.refreshNow();
 await started;await o.refreshNow();
 o.stop();resolve(data);await pending;
 assert.equal(observed,0);
 await o.refreshNow();assert.equal(observed,0);
});
test("T11: lectura fallida borra el estado anterior y no publica datos de otra sesión",async()=>{
 let current=true,unknown=0,applies=0,reads=0;
 const o=createT11RailObserver({autoStart:false,active:()=>true,current:()=>current,
  read:async()=>{reads++;throw Error("datos privados, no mostrarlos");},
  onSnapshot:()=>{applies++;},onUnavailable:()=>{unknown++;}
 });
 await o.refreshNow();assert.equal(unknown,1);assert.equal(applies,0);
 current=false;await o.refreshNow();
 assert.equal(reads,1);assert.equal(unknown,1);
 o.stop();
});
test("T11: errores en el control de sesión no se convierten en permisos de lectura",async()=>{
 let reads=0;
 const o=createT11RailObserver({autoStart:false,active:()=>true,
  current:()=>{throw Error("sesión perdida");},read:async()=>{reads++;return data;},
  onSnapshot:()=>{assert.fail("Se publicó la lectura no autorizada");},onUnavailable:()=>{}
 });
 await o.refreshNow();assert.equal(reads,0);o.stop();
});

test("T11: un fallo del sondeo no vuelve a publicar cero tareas ni revisiones antiguas",async()=>{
 const previous:AsenPanelSnapshot={
  todos:[{title:"Tarea de otro instante",current:{state:"blocked",reason:"Esperando permiso"}} as AsenPanelSnapshot["todos"][number]],
  agents:[{id:"agente-anterior",role:"worker",state:"running",
   updatedAt:"2026-11-17T00:00:00.000Z"} as AsenPanelSnapshot["agents"][number]],
  jobs:[],todosObserved:true,review:{pending:2},
 };
 const recovered:AsenPanelSnapshot={todos:[],agents:[],jobs:[],todosObserved:true,review:{pending:0}};
 let visible:AsenPanelSnapshot|undefined,fail=false;
 const observer=createT11RailObserver({autoStart:false,active:()=>true,current:()=>true,
  read:async()=>{if(fail)throw Error("No divulgar datos del origen");return visible?recovered:previous;},
  onSnapshot:snapshot=>{visible=snapshot;},
  onUnavailable:()=>{visible=unavailableT11RailSnapshot();}
 });
 await observer.refreshNow();
 assert.match(renderAsenPanel(visible!,80).join("\n"),/2 needs review/u);
 fail=true;await observer.refreshNow();
 const unavailable=visible!;
 assert.equal(unavailable.activityUnavailable,true);
 assert.equal(unavailable.agentFlowUnavailable,true);
 assert.equal(unavailable.todos.length,0);
 assert.equal(unavailable.agents.length,0);
 const body=renderAsenPanel(unavailable,100).join("\n");
 assert.match(body,/TODOS · unavailable|JOBS · unavailable/u);
 assert.match(body,/REVIEW · unverified/u);
 assert.match(renderAsenPanelSection(unavailable,"REVIEW",100).join("\n"),/Actividad no disponible/u);
 assert.match(renderAsenWorkRow(unavailable,100)??"",/actividad no disponible/u);
 assert.doesNotMatch(body,/Tarea de otro instante|Esperando permiso|2 needs review|0\/0/u);
 fail=false;await observer.refreshNow();
 assert.equal(visible?.activityUnavailable,undefined);
 assert.equal(visible?.review?.pending,0);
 assert.doesNotMatch(renderAsenPanel(visible!,100).join("\n"),/Actividad no disponible|2 needs review/u);
 observer.stop();
});

test("T11: sesión caducada con lateral oculto detiene el observador sin reactivarlo",async()=>{
 let active=false,current=false,reads=0,applies=0;
 const observer=createT11RailObserver({autoStart:false,
  active:()=>active,current:()=>current,
  read:async()=>{reads++;return data;},
  onSnapshot:()=>{applies++;},onUnavailable:()=>{applies++;}
 });
 await observer.refreshNow();
 current=true;active=true;
 await observer.refreshNow();
 assert.equal(reads,0,"Una sesión caducada no debe poder reactivar el sondeo");
 assert.equal(applies,0);
 observer.stop();
});
test("T11: intervalos inválidos no permiten sondeos sin límite",()=>{
 for(const intervalMs of [Number.NaN,Infinity,-Infinity,-1]){
  assert.throws(()=>createT11RailObserver({intervalMs,autoStart:false,
   active:()=>true,current:()=>true,read:async()=>data,
   onSnapshot:()=>{},onUnavailable:()=>{}
  }),/intervalo de observación no válido/u);
 }
});
