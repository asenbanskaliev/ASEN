import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MODELOS_NVIDIA_COMPROBACION,comprobarNvidia,
 autorizarComprobacionNvidia,clasificarEstadoNvidia
} from "../scripts/comprobar-nvidia.mjs";

const catalogo=()=>new Response(JSON.stringify({
 data:MODELOS_NVIDIA_COMPROBACION.map(id=>({id}))
}),{status:200,headers:{"content-type":"application/json"}});
const respuesta=(id)=>new Response(JSON.stringify({
 model:id,choices:[{index:0,message:{role:"assistant",content:"CLAVE NO COPIAR AL REPORTE"}}]
}),{status:200,headers:{"content-type":"application/json"}});

test("NVIDIA: dos modelos exactos y una sola petición POST corta por cada uno",async()=>{
 const llamadas=[];
 const clave="nvapi-CLAVE_DE_PRUEBAS_123";
 const result=await comprobarNvidia({clave,fetchImpl:async(url,options)=>{
  llamadas.push({url,options});
  if(options.method==="GET")return catalogo();
  const id=JSON.parse(options.body).model;
  return respuesta(id);
 }});
 assert.equal(result.completo,true);
 assert.equal(result.catalogo.estado,"correcto");
 assert.equal(llamadas.length,3);
 assert.equal(llamadas.filter(x=>x.options.method==="GET").length,1);
 assert.equal(llamadas.filter(x=>x.options.method==="POST").length,2);
 assert.deepEqual(llamadas.filter(x=>x.options.method==="POST").map(x=>JSON.parse(x.options.body).model),MODELOS_NVIDIA_COMPROBACION);
 for(const l of llamadas){
  assert.equal(l.options.redirect,"error");
  assert.equal(l.options.headers.Authorization,"Bearer "+clave);
 }
 for(const l of llamadas.filter(x=>x.options.method==="POST")){
  const body=JSON.parse(l.options.body);
  assert.equal(body.stream,false);
  assert.equal(body.max_tokens,32);
  assert.deepEqual(Object.keys(body).sort(),["max_tokens","messages","model","stream"]);
  assert.equal(body.messages.length,1);
 }
 const content=JSON.stringify(result);
 assert.doesNotMatch(content,/nvapi-|CLAVE NO COPIAR|Responde solo OK/u);
 assert.equal(result.reintentos,0);
 assert.deepEqual(result.modelos.map(x=>x.estado),["responde","responde"]);
});

test("NVIDIA: sin catálogo válido no hay ni una sola petición de inferencia",async()=>{
 for(const response of [
  new Response(JSON.stringify({}),{status:200}),
  new Response("no autorizado",{status:401}),
  new Response("unavailable",{status:503}),
  new Response("texto inválido",{status:200}),
  new Response(JSON.stringify({data:[{id:11}]}),{status:200})
 ]){
  let requests=0;
  const r=await comprobarNvidia({clave:"nvapi-CLAVE_DE_PRUEBAS_123",fetchImpl:async()=>{
   requests++;
   return response.clone();
  }});
  assert.equal(requests,1);
  assert.equal(r.completo,false);
  assert.ok(r.modelos.every(x=>x.respondio===false));
 }
});

test("NVIDIA: no consulta un modelo ausente del catálogo ni repite otro",async()=>{
 const llamadas=[];
 const selected=MODELOS_NVIDIA_COMPROBACION[0];
 const result=await comprobarNvidia({clave:"nvapi-CLAVE_DE_PRUEBAS_123",fetchImpl:async(url,options)=>{
  llamadas.push(options.method);
  return options.method==="GET"?
   new Response(JSON.stringify({data:[{id:selected}]}),{status:200}):
   new Response("saturado",{status:429});
 }});
 assert.deepEqual(llamadas,["GET","POST"]);
 assert.equal(result.completo,false);
 assert.equal(result.modelos[0].motivo,"limite-de-peticiones");
 assert.equal(result.modelos[1].motivo,"modelo-no-listado");
});

test("NVIDIA: un 200 sin texto de asistente no demuestra que el modelo funcione",async()=>{
 let calls=0;
 const result=await comprobarNvidia({clave:"nvapi-CLAVE_DE_PRUEBAS_123",fetchImpl:async(url,options)=>{
  calls++;
  if(options.method==="GET")return catalogo();
  return new Response(JSON.stringify({choices:[{message:{role:"assistant",content:" "}}]}),{status:200});
 }});
 assert.equal(calls,3);
 assert.equal(result.completo,false);
 assert.ok(result.modelos.every(x=>x.estado==="error-formato"&&x.respondio===false));
});

test("NVIDIA: fallos HTTP clasificados sin publicar respuestas ni reintentar",async()=>{
 for(const [status,motivo] of [
  [401,"clave-no-autorizada"],[403,"acceso-denegado"],
  [404,"modelo-o-ruta-no-disponible"],[429,"limite-de-peticiones"],
  [503,"servicio-saturado"],[500,"fallo-del-servidor"]
 ]){
  const methods=[];
  const r=await comprobarNvidia({clave:"nvapi-CLAVE_DE_PRUEBAS_123",fetchImpl:async(url,options)=>{
   methods.push(options.method);
   if(options.method==="GET")return catalogo();
   return new Response("UN SECRETO EN ERROR",{status});
  }});
  assert.deepEqual(methods,["GET","POST","POST"]);
  assert.ok(r.modelos.every(x=>x.motivo===motivo));
  assert.doesNotMatch(JSON.stringify(r),/UN SECRETO/u);
  assert.equal(clasificarEstadoNvidia(status),motivo);
 }
});

test("NVIDIA: fallo de red no repite peticiones ni contiene mensajes privados",async()=>{
 let times=0;
 const r=await comprobarNvidia({clave:"nvapi-CLAVE_DE_PRUEBAS_123",fetchImpl:async()=>{
  times++;
  throw new Error("Bearer nvapi-privada: conexión interna");
 }});
 assert.equal(times,1);
 assert.equal(r.catalogo.motivo,"fallo-de-conexion");
 assert.doesNotMatch(JSON.stringify(r),/nvapi|Bearer|interna/u);
});

test("NVIDIA: denegar en cualquier cambio de coste, rama, SHA, usuario o intento",()=>{
 const sha="a".repeat(40);
 const good={
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_ACTOR:"asenbanskaliev",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:sha,ASEN_NVIDIA_EXPECTED_SHA:sha,
  ASEN_NVIDIA_COST_ACK:"true",NVIDIA_API_KEY:"nvapi-CLAVE_DE_PRUEBAS_123"
 };
 assert.equal(autorizarComprobacionNvidia(good),true);
 for(const key of Object.keys(good)){
  assert.equal(autorizarComprobacionNvidia({...good,[key]:"otro"}),false,key);
  const no={...good};delete no[key];
  assert.equal(autorizarComprobacionNvidia(no),false,"falta "+key);
 }
});

test("NVIDIA: workflow manual y reutilizable sin disparos automáticos ni permisos de escritura",()=>{
 const yaml=readFileSync(new URL("../.github/workflows/comprobar-nvidia.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
 const parent=readFileSync(new URL("../.github/workflows/memory-openrouter-e2e.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
 assert.match(yaml,/^on:\n  workflow_dispatch:/mu);
 assert.match(yaml,/^  workflow_call:/mu);
 assert.doesNotMatch(yaml,/^  (?:push|pull_request|schedule):/mu);
 assert.match(yaml,/github\.run_attempt == 1/u);
 assert.match(yaml,/coste_desconocido_autorizado == true/u);
 assert.match(yaml,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 assert.match(yaml,/persist-credentials: false/u);
 assert.match(yaml,/node --test tests\/comprobar-nvidia.test.mjs/u);
 assert.match(yaml,/node scripts\/comprobar-nvidia.mjs/u);
 assert.match(yaml,/secrets\.NVIDIA_API_KEY/u);
 assert.doesNotMatch(yaml,/contents: write|pull-requests: write|git push|git merge/u);
 const secretAt=yaml.indexOf("NVIDIA_API_KEY: \$");
 const runnerAt=yaml.indexOf("node scripts/comprobar-nvidia.mjs");
 assert.ok(secretAt>=0&&runnerAt>secretAt);
 assert.match(parent,/nvidia_diagnostico/u);
 assert.match(parent,/uses: \.\/\.github\/workflows\/comprobar-nvidia.yml/u);
 assert.match(parent,/cost_acknowledged|coste_desconocido_autorizado/u);
});
