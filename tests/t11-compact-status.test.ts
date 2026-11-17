import test from "node:test";
import assert from "node:assert/strict";
import {visibleWidth} from "../src/runtime/responsive-layout.js";
import {projectHostStatus} from "../src/runtime/ui/host-status-projection.js";
import {renderAsenT11CompactStatus} from "../src/runtime/ui/t11-compact-status.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";
const sample=(more:Partial<AsenPanelSnapshot>={}):AsenPanelSnapshot=>({todos:[],agents:[],jobs:[],...more});
const active=projectHostStatus({model:{provider:"provider",id:"verified"},thinkingLevel:"high",getContextUsage:()=>({tokens:950,contextWindow:1000,percent:95})});
test("T11 barra estrecha conserva la alerta y el acceso a /asen-panel",()=>{
 const input=sample({hostStatus:active,permission:"YOLO",changes:{branch:"feature/cambios",files:3}});
 for(const width of [1,2,12,20,21,24,40,50,80,120,139]){
  const line=renderAsenT11CompactStatus(input,width,{headerAtTop:true});
  assert.ok(visibleWidth(line)<=width,width+": "+line);
  assert.doesNotMatch(line,/\x1b|\n/);
  if(width>=21)assert.match(line,/\/asen-panel$/);
  if(width>=24)assert.match(line,/! ctx 95%/);
 }
 assert.match(renderAsenT11CompactStatus(input,80,{headerAtTop:true}),/modo YOLO/);
 assert.match(renderAsenT11CompactStatus(input,139,{headerAtTop:true}),/modelo provider\/verified/);
 assert.doesNotMatch(renderAsenT11CompactStatus(input,139),/\$0|coste\/uso 0/);
});
test("T11 barra no inventa respuesta, modelos, costes ni actividad de agentes",()=>{
 const empty=renderAsenT11CompactStatus(sample(),80);
 assert.equal(empty,"ASEN · /asen-panel");
 const unknown=renderAsenT11CompactStatus(sample({
  hostStatus:projectHostStatus(),model:"modelo/obsoleto",cost:0,contextPercent:95
 }),80,{headerAtTop:true});
 assert.match(unknown,/modelo \?/);
 assert.match(unknown,/ctx \?/);
 assert.doesNotMatch(unknown,/obsoleto|95%|\$|respuesta|bloqueos|coste\/uso 0/);
 assert.match(unknown,/coste\/uso \?/);
});
test("T11 barra prioriza bloqueos observados sin conceder permisos ni acciones",()=>{
 const todo={current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number];
 const agent={state:"interrupted"} as AsenPanelSnapshot["agents"][number];
 const input=sample({todos:[todo],agents:[agent],hostStatus:active,permission:"super-yolo"});
 const text=renderAsenT11CompactStatus(input,50,{headerAtTop:true});
 assert.match(text,/! 2 bloqueos/);
 assert.match(text,/! ctx 95%/);
 assert.match(text,/\/asen-panel$/);
 assert.doesNotMatch(text,/aprobado|aceptado|ejecutado/i);
});
test("T11 barra se protege frente a controles y cadenas maliciosas",()=>{
 const snapshot=sample({hostStatus:active,changes:{branch:"\x1b[2J\u202esecreto\nfeature".repeat(50),files:2}});
 const result=renderAsenT11CompactStatus(snapshot,139,{headerAtTop:false});
 assert.ok(visibleWidth(result)<=139);
 assert.doesNotMatch(result,/\x1b|\n|\u202e/);
 assert.match(result,/\/asen-panel$/);
 for(const width of [0,-1,NaN,1001,1.5])assert.throws(()=>renderAsenT11CompactStatus(snapshot,width),/width/);
});
test("T11 el modo oculto puede retirar la sugerencia de panel, sin barra duplicada",()=>{
 const line=renderAsenT11CompactStatus(sample({hostStatus:active}),80,{panelCommand:false});
 assert.doesNotMatch(line,/\/asen-panel/);
 assert.equal((line.match(/ctx/g)??[]).length,1);
});
