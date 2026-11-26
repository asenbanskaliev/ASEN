import assert from "node:assert/strict";
import test from "node:test";
import {createCompactionPressureObserver,projectCompactionPressure} from "../src/runtime/ui/compaction-pressure.js";
import {projectHostStatus} from "../src/runtime/ui/host-status-projection.js";
import {renderAsenStatusLine} from "../src/runtime/ui/ide-panel.js";
import {renderAsenT11CompactStatus} from "../src/runtime/ui/t11-compact-status.js";
import {SettingsManager} from "@earendil-works/pi-coding-agent";

const model={provider:"proveedor",id:"modelo"};
const usage={tokens:40_000,contextWindow:100_000};
test("G02 distingue ocupación de ventana y presión de compactación",()=>{
 assert.deepEqual(projectCompactionPressure({settings:{compaction:{reserveTokens:20_000}},model,usage}),
  {state:"available",usedTokens:40_000,windowTokens:100_000,reserveTokens:20_000,thresholdTokens:80_000,
   remainingTokens:40_000,percent:50,atOrAboveThreshold:false});
 const defaults=projectCompactionPressure({settings:{},model,usage});
 assert.equal(defaults.state,"available");if(defaults.state==="available")assert.equal(defaults.thresholdTokens,83_616);
});
test("G02 aplica la excepción exacta del modelo y no confunde retención con reserva",()=>{
 const settings={compaction:{reserveTokens:20_000,keepRecentTokens:3_000,modelOverrides:{
  "proveedor/modelo":{reserveTokens:50_000,keepRecentTokens:5_000},"otro/modelo":{reserveTokens:1_000}}}};
 const result=projectCompactionPressure({settings,model,usage});
 assert.equal(result.state,"available");if(result.state==="available"){assert.equal(result.thresholdTokens,50_000);assert.equal(result.percent,80);}
 const other=projectCompactionPressure({settings,model:{provider:"tercero",id:"modelo"},usage});
 assert.equal(other.state,"available");if(other.state==="available")assert.equal(other.reserveTokens,20_000);
 assert.deepEqual(projectCompactionPressure({settings,usage}),{state:"unknown",reason:"model"});
});
test("G02 distingue límite alcanzado, exceso y reserva cero",()=>{
 for(const tokens of [80_000,90_000]){
  const r=projectCompactionPressure({settings:{compaction:{reserveTokens:20_000}},usage:{...usage,tokens}});
  assert.equal(r.state,"available");if(r.state==="available"){assert.equal(r.percent,100);assert.equal(r.remainingTokens,0);assert.equal(r.atOrAboveThreshold,true);}
 }
 const r=projectCompactionPressure({settings:{compaction:{reserveTokens:0}},usage:{...usage,tokens:0}});
 assert.equal(r.state,"available");if(r.state==="available"){assert.equal(r.thresholdTokens,100_000);assert.equal(r.percent,0);}
});
test("G02 falla de forma informativa si no existe configuración verificable",()=>{
 assert.deepEqual(projectCompactionPressure({settings:{compaction:{enabled:false}},usage:null}),{state:"off"});
 for(const settings of [null,undefined,[],{compaction:null},{compaction:{enabled:"sí"}},{compaction:{reserveTokens:-1}},
  {compaction:{reserveTokens:1.5}},{compaction:{keepRecentTokens:NaN}},
  {compaction:{reserveTokens:-1,modelOverrides:{"proveedor/modelo":{reserveTokens:10}}}},
  {compaction:{modelOverrides:{"proveedor/modelo":null}}}]){
  assert.deepEqual(projectCompactionPressure({settings,model,usage}),{state:"unknown",reason:"settings"});
 }
 for(const reserveTokens of [100_000,101_000])assert.deepEqual(projectCompactionPressure({settings:{compaction:{reserveTokens}},usage}),{state:"unknown",reason:"threshold"});
 for(const bad of [null,{tokens:1,contextWindow:0},{tokens:-1,contextWindow:100},{tokens:Infinity,contextWindow:100},{tokens:1,contextWindow:10.5}]){
  assert.deepEqual(projectCompactionPressure({settings:{},usage:bad}),{state:"unknown",reason:"usage"});
 }
 assert.deepEqual(projectCompactionPressure({settings:{get compaction(){throw Error("No disponible");}},usage}),{state:"unknown",reason:"settings"});
});

test("G02 coincide con la reserva efectiva del SDK Pi instalado",()=>{
 const settings={compaction:{reserveTokens:20_000,keepRecentTokens:3_000,modelOverrides:{
  "proveedor/modelo":{reserveTokens:50_000}}}};
 const manager=SettingsManager.inMemory(settings);
 for(const current of [model,{provider:"otro",id:"modelo"}]){
  const expected=manager.getCompactionSettings(current);
  const pressure=projectCompactionPressure({settings,model:current,usage});
  assert.equal(pressure.state,"available");
  if(pressure.state==="available")assert.equal(pressure.reserveTokens,expected.reserveTokens);
 }
});
test("G02 observa una sola vez el contexto y separa presión de ocupación",()=>{
 let calls=0,reads=0;
 let settings:unknown={compaction:{reserveTokens:50_000}},current:unknown={...usage,percent:40};
 const host={model,getContextUsage(){calls++;assert.equal(this,host);return current;}};
 const read=()=>{reads++;return settings;};
 const snapshot=()=>({todos:[],agents:[],jobs:[],hostStatus:projectHostStatus(host,undefined,read)});
 const first=snapshot();
 assert.equal(calls,1);assert.equal(reads,1);
 assert.deepEqual(first.hostStatus.context,{percent:40,state:"normal"});
 assert.equal(first.hostStatus.compactionPressure?.state,"available");
 for(const render of [renderAsenStatusLine,renderAsenT11CompactStatus]){
  const line=render(first,139);
  assert.match(line,/ctx 40%/u);assert.match(line,/compact\. 80%/u);
 }
 current={tokens:50_000,contextWindow:100_000,percent:50};
 assert.match(renderAsenT11CompactStatus(snapshot(),139),/! compact\. 100%/u);
 settings={compaction:{enabled:false}};
 assert.match(renderAsenT11CompactStatus(snapshot(),139),/compact\. desact\./u);
 settings={};current={tokens:null,contextWindow:100_000,percent:null};
 assert.match(renderAsenT11CompactStatus(snapshot(),139),/compact\. \?/u);
 assert.deepEqual(projectHostStatus(host,undefined,()=>{throw Error("secreto");}).compactionPressure,{state:"unknown",reason:"settings"});
 assert.equal(projectHostStatus(host).compactionPressure,undefined);
});

test("G02 actualiza el estado al cambiar ajustes en ambos sentidos sin iniciar modelos",()=>{
 type FakeTimer={callback:()=>void;delay:number;cancelled:boolean};
 const timers:FakeTimer[]=[];let pressure:ReturnType<typeof projectCompactionPressure>|undefined=projectCompactionPressure({settings:{},model,usage}),refreshes=0;
 const schedule=(callback:()=>void,delay:number)=>{
  const timer:FakeTimer={callback,delay,cancelled:false};timers.push(timer);
  return timer as unknown as ReturnType<typeof setTimeout>;
 };
 const cancel=(timer:ReturnType<typeof setTimeout>)=>{(timer as unknown as FakeTimer).cancelled=true;};
 const observer=createCompactionPressureObserver({
  read:()=>pressure,initial:pressure,current:()=>true,onChange:()=>{refreshes++;},
  intervalMs:5000,schedule,cancel
 });
 assert.equal(timers[0]?.delay,5000);
 const tick=()=>{const timer=timers.shift();assert.ok(timer);if(!timer.cancelled)timer.callback();};
 pressure={state:"off"};tick();assert.equal(refreshes,1);
 pressure=undefined;tick();assert.equal(refreshes,2);
 pressure=projectCompactionPressure({settings:{},model,usage});tick();assert.equal(refreshes,3);
 observer.stop();assert.equal(timers[0]?.cancelled,true);
});
test("G02 reconcilia el primer sondeo con el estado publicado antes de la espera",()=>{
 type FakeTimer={callback:()=>void;delay:number;cancelled:boolean};
 const timers:FakeTimer[]=[];let refreshes=0;
 const schedule=(callback:()=>void,delay:number)=>{
  const timer:FakeTimer={callback,delay,cancelled:false};timers.push(timer);
  return timer as unknown as ReturnType<typeof setTimeout>;
 };
 const cancel=(timer:ReturnType<typeof setTimeout>)=>{(timer as unknown as FakeTimer).cancelled=true;};
 const published=projectCompactionPressure({settings:{},model,usage});
 const current=projectCompactionPressure({settings:{compaction:{enabled:false}},model,usage});
 const observer=createCompactionPressureObserver({
  read:()=>current,initial:published,current:()=>true,onChange:()=>{refreshes++;},schedule,cancel
 });
 assert.equal(refreshes,1);
 observer.stop();assert.equal(timers[0]?.cancelled,true);
});


test("G02 sincroniza el último estado publicado antes del siguiente sondeo",()=>{
 let reading:ReturnType<typeof projectCompactionPressure>={state:"off"},changes=0;
 let pending:(()=>void)|undefined;
 const observer=createCompactionPressureObserver({initial:{state:"off"},read:()=>reading,current:()=>true,onChange:()=>{changes++;},
  schedule:callback=>{pending=callback;return 1 as unknown as ReturnType<typeof setTimeout>;},cancel:()=>{}});
 // Simula una publicación intermedia de presión disponible antes del siguiente sondeo.
 assert.equal(observer.synchronize({state:"available",usedTokens:1,windowTokens:10,reserveTokens:2,thresholdTokens:8,remainingTokens:7,percent:12.5,atOrAboveThreshold:false}),true);
 // La configuración vuelve a desactivada antes del siguiente sondeo.
 reading={state:"off"};pending?.();
 assert.equal(changes,1);
 observer.stop();
 assert.equal(observer.synchronize({state:"off"}),false,"un observador detenido no puede reutilizarse");
});


test("G02 reemplaza el observador cuando se cancela su contexto y sigue con el nuevo",()=>{
 type FakeTimer={callback:()=>void;cancelled:boolean};
 let previous:(()=>void)|undefined,next:(()=>void)|undefined,oldSchedules=0,newSchedules=0,oldCurrent=true,newCurrent=true,changes=0;
 const scheduleOld=(callback:()=>void)=>{oldSchedules++;previous=callback;return {callback,cancelled:false} as unknown as ReturnType<typeof setTimeout>;};
 const scheduleNew=(callback:()=>void)=>{newSchedules++;next=callback;return {callback,cancelled:false} as unknown as ReturnType<typeof setTimeout>;};
 const cancel=(_timer:ReturnType<typeof setTimeout>)=>{};
 const old=createCompactionPressureObserver({initial:{state:"off"},read:()=>({state:"off"}),current:()=>oldCurrent,onChange:()=>{},schedule:scheduleOld,cancel});
 oldCurrent=false;previous?.();
 assert.equal(oldSchedules,1,"el contexto cancelado no programa más sondeos");
 old.stop();
 const resumed=createCompactionPressureObserver({initial:{state:"off"},read:()=>({state:"available",usedTokens:1,windowTokens:10,reserveTokens:2,thresholdTokens:8,remainingTokens:7,percent:12.5,atOrAboveThreshold:false}),current:()=>newCurrent,onChange:()=>{changes++;},schedule:scheduleNew,cancel});
 assert.equal(newSchedules,1,"el contexto nuevo instala un observador");
 next?.();assert.equal(changes,1);
 newCurrent=false;next?.();resumed.stop();
});
