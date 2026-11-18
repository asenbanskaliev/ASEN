import test from "node:test";
import assert from "node:assert/strict";
import {createT11GitObservationCache} from "../src/runtime/ui/t11-git-observation.js";
import {renderAsenPanelSection,type AsenPanelSnapshot} from "../src/runtime/ui/ide-panel.js";

const empty:AsenPanelSnapshot={todos:[],agents:[],jobs:[]};
test("T11: el sondeo sin Git conserva la última consulta, marcada como antigua",()=>{
 const cache=createT11GitObservationCache();
 cache.remember("sesión-a","/proyecto-a",{branch:"rama-segura",files:3});
 const inspected=cache.restore("sesión-a","/proyecto-a",empty);
 assert.deepEqual(inspected.changes,{branch:"rama-segura",files:3,lastInspected:true});
 assert.match(renderAsenPanelSection(inspected,"CHANGES",100).join("\n"),
  /rama-segura.*3 files.*última consulta \(puede haber cambiado\)/u);
 const fresh=cache.restore("sesión-a","/proyecto-a",{...empty,changes:{branch:"rama-reciente",files:0}});
 assert.deepEqual(fresh.changes,{branch:"rama-reciente",files:0});
 assert.doesNotMatch(renderAsenPanelSection(fresh,"CHANGES",100).join("\n"),/última consulta/u);
});
test("T11: una consulta Git fallida no revive la última lectura",()=>{
 const cache=createT11GitObservationCache();
 cache.remember("sesión-a","/proyecto-a",{branch:"anterior",files:2});
 cache.remember("sesión-a","/proyecto-a",undefined);
 assert.equal(cache.restore("sesión-a","/proyecto-a",empty).changes,undefined);
 cache.remember("sesión-a","/proyecto-a",{branch:"nueva",files:1});
 assert.equal(cache.restore("sesión-a","/proyecto-a",{...empty,activityUnavailable:true}).changes,undefined);
 assert.equal(cache.restore("sesión-a","/proyecto-a",empty).changes,undefined);
});
test("T11: no se comparten ramas entre proyectos, sesiones ni tras el cierre",()=>{
 const cache=createT11GitObservationCache();
 cache.remember("sesión-a","/proyecto-a",{branch:"privada",files:5});
 assert.equal(cache.restore("sesión-b","/proyecto-a",empty).changes,undefined);
 assert.equal(cache.restore("sesión-a","/proyecto-a",empty).changes,undefined);
 cache.remember("sesión-a","/proyecto-a",{branch:"privada",files:5});
 assert.equal(cache.restore("sesión-a","/proyecto-b",empty).changes,undefined);
 cache.remember("sesión-a","/proyecto-a",{branch:"otra",files:1});
 cache.clear();
 assert.equal(cache.restore("sesión-a","/proyecto-a",empty).changes,undefined);
});
