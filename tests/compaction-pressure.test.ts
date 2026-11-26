import assert from "node:assert/strict";
import test from "node:test";
import {projectCompactionPressure} from "../src/runtime/ui/compaction-pressure.js";

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
