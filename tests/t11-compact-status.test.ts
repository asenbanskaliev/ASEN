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
 assert.doesNotMatch(unknown,/obsoleto|95%|\$|bloqueos|coste\/uso 0/);
 assert.match(unknown,/respuesta \?/,"el modelo respondedor ausente debe quedar desconocido");
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

test("T11: un error de lectura advierte indisponibilidad en vez de conservar bloqueos antiguos",()=>{
 const before=sample({hostStatus:projectHostStatus(),todos:[
  {current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]
 ]});
 assert.match(renderAsenT11CompactStatus(before,80),/! 1 bloqueos/);
 const unavailable=renderAsenT11CompactStatus(sample({hostStatus:projectHostStatus()}),80,{
  activityUnavailable:true
 });
 assert.match(unavailable,/! actividad no disponible/);
 assert.doesNotMatch(unavailable,/bloqueos|revisiones|aceptad[oa]|PASS/u);
 assert.match(unavailable,/\/asen-panel$/);
 for(const width of [12,24,40])assert.ok(visibleWidth(renderAsenT11CompactStatus(sample(),width,{
  activityUnavailable:true
 }))<=width);
});

test("T11: en terminal pequeña se ve antes el bloqueo de un Worker que el contexto alto",()=>{
 const todo={current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number];
 const input=sample({todos:[todo],hostStatus:active});
 const narrow=renderAsenT11CompactStatus(input,28);
 assert.match(narrow,/! 1 bloqueos/);
 assert.match(narrow,/\/asen-panel$/);
 assert.doesNotMatch(narrow,/ctx 95%/);
 const wide=renderAsenT11CompactStatus(input,100);
 assert.match(wide,/^! 1 bloqueos · ! ctx 95%/);
});

test("T11: el estado no muestra contadores antiguos cuando la lectura falla y se recupera",()=>{
 const oldTodo={current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number];
 const oldAgent={state:"interrupted"} as AsenPanelSnapshot["agents"][number];
 const stale=sample({todos:[oldTodo],agents:[oldAgent],review:{pending:3},hostStatus:active,activityUnavailable:true});
 for(const width of [24,40,80,139]){
  const line=renderAsenT11CompactStatus(stale,width);
  assert.ok(visibleWidth(line)<=width);
  assert.doesNotMatch(line,/bloqueos|revisiones/u);
  if(width>=40)assert.match(line,/actividad no disponible/u);
 }
 const forced=renderAsenT11CompactStatus({...stale,activityUnavailable:false},139,{activityUnavailable:true});
 assert.match(forced,/actividad no disponible/u);
 assert.doesNotMatch(forced,/bloqueos|revisiones/u);
 const fresh=renderAsenT11CompactStatus({...stale,activityUnavailable:false},139);
 assert.match(fresh,/! 2 bloqueos/u);
 assert.match(fresh,/! 3 revisiones/u);
 assert.doesNotMatch(fresh,/actividad no disponible/u);
});

test("T11 nunca oculta la pérdida de datos para mostrar el modelo",()=>{
 const snapshot=sample({hostStatus:projectHostStatus({model:{provider:"p",id:"m"}})});
 const line=renderAsenT11CompactStatus(snapshot,35,{activityUnavailable:true,headerAtTop:true});
 assert.match(line,/^! actividad/u);
 assert.match(line,/\/asen-panel$/u);
 assert.doesNotMatch(line,/modelo p\/m|PASS/u);
 assert.ok(visibleWidth(line)<=35);
});

test("T11/T07: un fallo del diario hijo aparece como desconocido, no como cero Workers",()=>{
 const observed=sample({hostStatus:active,agentFlowUnavailable:true});
 for(const width of [40,50,80,120,139]){
  const line=renderAsenT11CompactStatus(observed,width,{panelCommand:true});
  assert.match(line,/! hijos no disponibles/u);
  assert.match(line,/\/asen-panel$/u);
  assert.doesNotMatch(line,/0 (?:hijos|Workers)|agentes confirmados|PASS/u);
  assert.ok(visibleWidth(line)<=width);
 }
 // El mismo aviso debe llegar cuando el lector del panel lo suministra
 // explícitamente: el host puede no tener aún un snapshot de los hijos.
 const line=renderAsenT11CompactStatus(sample(),80,{agentFlowUnavailable:true});
 assert.match(line,/! hijos no disponibles/u);
 const recovered=renderAsenT11CompactStatus(sample({hostStatus:active}),80);
 assert.doesNotMatch(recovered,/hijos no disponibles/u);
});
test("T11/T07: un fallo de lectura total prevalece sobre el aviso parcial de hijos",()=>{
 const old=sample({
  todos:[{current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]],
  agents:[{state:"interrupted"} as AsenPanelSnapshot["agents"][number]],
  review:{pending:8},agentFlowUnavailable:true,activityUnavailable:true,
  hostStatus:active
 });
 const row=renderAsenT11CompactStatus(old,80,{agentFlowUnavailable:true});
 assert.match(row,/^! actividad no disponible/u);
 assert.doesNotMatch(row,/! hijos no disponibles|bloqueos|8 revisiones|PASS/u);
 const recovered=renderAsenT11CompactStatus({...old,activityUnavailable:false,agentFlowUnavailable:false},139);
 assert.match(recovered,/! 2 bloqueos/u);
 assert.doesNotMatch(recovered,/actividad no disponible|hijos no disponibles/u);
});

test("T11/T07: el ancho limitado conserva avisos, contexto y modo antes que el coste",()=>{
 const input=sample({hostStatus:projectHostStatus({
  model:{provider:"p",id:"m"},thinkingLevel:"high",
  getContextUsage:()=>({tokens:80,contextWindow:100,percent:80})
 }),permission:"YOLO",agentFlowUnavailable:true});
 const row=renderAsenT11CompactStatus(input,100);
 assert.match(row,/^! hijos no disponibles · ! ctx 80% · modo YOLO/u);
 assert.match(row,/\/asen-panel$/u);
 assert.doesNotMatch(row,/coste\/uso|aceptado|PASS/iu);
 assert.ok(visibleWidth(row)<=100);
 assert.match(renderAsenT11CompactStatus(input,160),/coste\/uso \?/u);
});

test("T11: aviso de hijos desconocidos gana espacio ante revisión en 44 columnas",()=>{
 const row=renderAsenT11CompactStatus(sample({
  todos:[{current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]],
  review:{pending:1},agentFlowUnavailable:true
 }),44);
 assert.match(row,/! 1 bloqueos/u);
 assert.match(row,/! hijos \?/u);
 assert.match(row,/\/asen-panel$/u);
 assert.doesNotMatch(row,/! 1 revisiones/u);
 assert.ok(visibleWidth(row)<=44);
});
