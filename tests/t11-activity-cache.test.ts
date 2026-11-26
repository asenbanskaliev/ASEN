import test from "node:test";
import assert from "node:assert/strict";
import {createT11ActivityCache} from "../src/runtime/ui/t11-activity-cache.js";
import {derivePanelReview} from "../src/runtime/ui/ide-panel.js";
import {projectHostStatus} from "../src/runtime/ui/host-status-projection.js";
import {renderAsenT11CompactStatus} from "../src/runtime/ui/t11-compact-status.js";
import type {AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

test("T11: solo proyecta actividad de sesión y proyecto observados",()=>{
 const cache=createT11ActivityCache();
 const item={current:{state:"blocked",reason:"requiere revisión"}} as AsenPanelSnapshot["todos"][number];
 const activity:Pick<AsenPanelSnapshot,"todos"|"agents"|"jobs">={todos:[item],agents:[],jobs:[]};
 cache.put("sesión-a","/proyecto-a",activity);
 assert.equal(cache.get("sesión-a","/proyecto-a")?.todos.length,1);
 assert.equal(cache.get("sesión-b","/proyecto-a"),undefined);
 assert.equal(cache.get("sesión-a","/proyecto-b"),undefined);
 assert.equal(cache.get("","/proyecto-a"),undefined);
 cache.put("sesión-b","/proyecto-a",{todos:[],agents:[],jobs:[]});
 assert.equal(cache.get("sesión-a","/proyecto-a"),undefined,"no conservar datos de la sesión anterior");
 assert.equal(cache.get("sesión-b","/proyecto-a")?.todos.length,0);
 cache.clear();assert.equal(cache.get("sesión-b","/proyecto-a"),undefined);
});
test("T11: copia las listas para no mostrar cambios posteriores no observados",()=>{
 const cache=createT11ActivityCache();
 const todos:AsenPanelSnapshot["todos"][number][]=[];
 cache.put("sesión","/proyecto",{todos,agents:[],jobs:[]});
 todos.push({current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]);
 assert.equal(cache.get("sesión","/proyecto")?.todos.length,0);
 cache.put("","/proyecto",{todos,agents:[],jobs:[]});
 assert.equal(cache.get("sesión","/proyecto"),undefined);
});

test("T11: bloqueo observado se muestra en la barra sin mezclar proyectos",()=>{
 const cache=createT11ActivityCache();
 const observed={todos:[{current:{state:"blocked"}} as AsenPanelSnapshot["todos"][number]],
 agents:[{state:"interrupted"} as AsenPanelSnapshot["agents"][number]],jobs:[]};
 cache.put("uno","proyecto",observed);
 const project=(sessionId:string,projectId:string):AsenPanelSnapshot=>({
  todos:cache.get(sessionId,projectId)?.todos??[],
  agents:cache.get(sessionId,projectId)?.agents??[],
  jobs:cache.get(sessionId,projectId)?.jobs??[],
  hostStatus:projectHostStatus(),
 });
 assert.match(renderAsenT11CompactStatus(project("uno","proyecto"),80),/! 2 bloqueos/);
 assert.doesNotMatch(renderAsenT11CompactStatus(project("dos","proyecto"),80),/bloqueos/);
 assert.doesNotMatch(renderAsenT11CompactStatus(project("uno","otro"),80),/bloqueos/);
 cache.clear();
 assert.doesNotMatch(renderAsenT11CompactStatus(project("uno","proyecto"),80),/bloqueos/);
});

test("T11: revisiones pendientes solo desde tareas observadas, sin inventar resultados",()=>{
 const cache=createT11ActivityCache();
 const waiting={current:{state:"succeeded"}} as AsenPanelSnapshot["todos"][number];
 const blocked={current:{state:"blocked",reason:"Linked review result requires explicit user acceptance"}} as AsenPanelSnapshot["todos"][number];
 cache.put("sesion-activa","proyecto",{todos:[waiting,blocked],agents:[],jobs:[]});
 const current=cache.get("sesion-activa","proyecto")!;
 const state=derivePanelReview({...current,todosObserved:true});
 assert.deepEqual(state,{known:true,pending:2});
 const row=renderAsenT11CompactStatus({...current,hostStatus:projectHostStatus(),review:{pending:state.pending}},100);
 assert.match(row,/! 2 revisiones/);
 assert.doesNotMatch(row,/aceptad[oa]|PASS|\$0/iu);
 const other=cache.get("otra","proyecto");
 assert.equal(other,undefined,"ni tareas ni revisiones pueden cruzar sesiones");
 assert.deepEqual(derivePanelReview({todos:[],agents:[],jobs:[]}),{known:false,pending:0});
 cache.clear();assert.equal(cache.get("sesion-activa","proyecto"),undefined);
});
