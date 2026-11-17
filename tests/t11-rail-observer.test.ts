import test from "node:test";
import assert from "node:assert/strict";
import {createT11RailObserver} from "../src/runtime/ui/t11-rail-observer.js";
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
