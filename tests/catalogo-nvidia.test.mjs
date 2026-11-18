import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 normalizarCatalogoNvidia,consultarCatalogoNvidia,autorizarConsultaCatalogoNvidia
} from "../scripts/catalogo-nvidia.mjs";

const CLAVE="nvapi-clave-falsa-solo-test-12345";
const models=[
 "meta/llama-3.3-70b-instruct",
 "nvidia/nemotron-3-nano-30b-a3b",
 "nvidia/nemotron-3-super-120b-a12b",
 "nvidia/nemotron-3.5-bolt-e4b",
 "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
];
const response=(ids=models)=>new Response(JSON.stringify({
 object:"list",secret:"no-debe-salir",
 data:ids.map(id=>({id,description:"NO CONSERVAR",billing:"NO CONSERVAR"}))
}),{status:200,headers:{"content-type":"application/json"}});

test("El catálogo usa exclusivamente GET, sin peticiones de generación",async()=>{
 const calls=[];
 const out=await consultarCatalogoNvidia({clave:CLAVE,fetchImpl:async(url,options)=>{
  calls.push({url,options});
  return response();
 }});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"https://integrate.api.nvidia.com/v1/models");
 assert.equal(calls[0].options.method,"GET");
 assert.equal(calls[0].options.redirect,"error");
 assert.equal(calls[0].options.headers.Authorization,"Bearer "+CLAVE);
 assert.equal(out.generacionSolicitudes,0);
 assert.equal(out.reintentos,0);
 assert.equal(out.completo,true);
 assert.equal(out.totalModelos,models.length);
 assert.deepEqual(out.modelos,[...models].sort());
 assert.deepEqual(out.modelosNemotron,[...models.filter(x=>/nemotron|bolt/u.test(x))].sort());
 assert.deepEqual(out.modelosAnterioresPresentes,models.slice(1,3));
 const body=JSON.stringify(out);
 assert.doesNotMatch(body,/CLAVE|clave-falsa|NO CONSERVAR|NO CONSERVAR|"secret"|"billing"|"description"/u);
});

test("Conserva los identificadores exactos y no inventa nombres",()=>{
 const ids=normalizarCatalogoNvidia({data:[
  {id:"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"},
  {id:"meta/llama-3.3-70b-instruct"}
 ]});
 assert.deepEqual(ids,["meta/llama-3.3-70b-instruct",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"]);
 assert.throws(()=>ids.push("inventado"));
});

test("Errores HTTP, catálogo vacío y JSON inválido nunca activan inferencia",async()=>{
 for(const bad of [
  new Response("privado",{status:401}),
  new Response("privado",{status:403}),
  new Response("privado",{status:429}),
  new Response("privado",{status:503}),
  new Response("no JSON",{status:200}),
  response(["id con espacios"]),
  new Response(JSON.stringify({data:[{id:"modelo"}, {id:"modelo"}]}),{status:200}),
  new Response(JSON.stringify({data:null}),{status:200})
 ]){
  let calls=0;
  const out=await consultarCatalogoNvidia({clave:CLAVE,fetchImpl:async()=>{
   calls++;
   return bad.clone();
  }});
  assert.equal(calls,1);
  assert.equal(out.completo,false);
  assert.equal(out.generacionSolicitudes,0);
  assert.deepEqual(out.modelos,[]);
  assert.doesNotMatch(JSON.stringify(out),/privado|no JSON/u);
 }
 const empty=await consultarCatalogoNvidia({clave:CLAVE,fetchImpl:async()=>response([])});
 assert.equal(empty.estado,"correcto");
 assert.deepEqual(empty.modelos,[]);
 assert.equal(empty.generacionSolicitudes,0);
});

test("Ante fallos de conexión no se repite ni se guarda el error original",async()=>{
 let calls=0;
 const out=await consultarCatalogoNvidia({clave:CLAVE,fetchImpl:async()=>{
  calls++;
  throw Error("Bearer "+CLAVE+" secreto-interno");
 }});
 assert.equal(calls,1);
 assert.equal(out.estado,"fallo-consulta");
 assert.equal(out.motivo,"fallo-de-conexion");
 assert.doesNotMatch(JSON.stringify(out),/Bearer|secreto-interno|nvapi/u);
});

test("No se guardan identificadores maliciosos ni respuestas desmesuradas",async()=>{
 for(const invalid of [
  "Bearer nvapi-123456789",
  "modelo\ncredencial",
  "<script>alert(1)</script>",
  "nvidia/"+"x".repeat(300),
  "modelo con espacios",
  "https://secret?token=abc"
 ]){
  assert.throws(()=>normalizarCatalogoNvidia({data:[{id:invalid}]}));
 }
 let calls=0;
 const huge=await consultarCatalogoNvidia({clave:CLAVE,fetchImpl:async()=>{
  calls++;
  return new Response("X".repeat(2_000_100),{status:200});
 }});
 assert.equal(calls,1);
 assert.equal(huge.motivo,"respuesta-demasiado-grande");
 assert.equal(huge.generacionSolicitudes,0);
});

test("La autorización no hereda sesiones ni admite un reintento",()=>{
 const sha="a".repeat(40);
 const ok={
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_EVENT_NAME:"workflow_dispatch",GITHUB_ACTOR:"asenbanskaliev",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:sha,ASEN_NVIDIA_EXPECTED_SHA:sha,
  ASEN_NVIDIA_SOLO_CATALOGO:"1",NVIDIA_API_KEY:CLAVE
 };
 assert.equal(autorizarConsultaCatalogoNvidia(ok),true);
 for(const k of Object.keys(ok)){
  assert.equal(autorizarConsultaCatalogoNvidia({...ok,[k]:"invalido"}),false,k);
  const copy={...ok};delete copy[k];
  assert.equal(autorizarConsultaCatalogoNvidia(copy),false,"falta "+k);
 }
});

test("Flujo manual protegido sin POST, reintentos, coste autorizado ni permisos de escritura",()=>{
 const yaml=readFileSync(new URL("../.github/workflows/catalogo-nvidia.yml",import.meta.url),"utf8");
 const parent=readFileSync(new URL("../.github/workflows/memory-openrouter-e2e.yml",import.meta.url),"utf8");
 const code=readFileSync(new URL("../scripts/catalogo-nvidia.mjs",import.meta.url),"utf8");
 assert.match(yaml,/^on:\s*\n  workflow_dispatch:/mu);
 assert.match(yaml,/^  workflow_call:/mu);
 assert.doesNotMatch(yaml,/^  (?:push|pull_request|schedule):/mu);
 assert.match(yaml,/github\.run_attempt == 1/u);
 assert.match(yaml,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 assert.match(yaml,/test "\$GITHUB_SHA" = "\$ASEN_NVIDIA_EXPECTED_SHA"/u);
 assert.match(yaml,/persist-credentials: false/u);
 assert.match(yaml,/node --test tests\/catalogo-nvidia\.test\.mjs/u);
 assert.match(yaml,/node scripts\/catalogo-nvidia\.mjs/u);
 assert.match(yaml,/secrets\.NVIDIA_API_KEY/u);
 assert.match(yaml,/if: always\(\)/u);
 assert.doesNotMatch(yaml,/contents: write|pull-requests: write|git push|git merge/u);
 assert.doesNotMatch(yaml,/coste_desconocido_autorizado/u);
 assert.doesNotMatch(code,/\/chat\/completions|method:\s*"POST"|max_tokens/u);
 assert.match(parent,/nvidia_catalogo/u);
 assert.match(parent,/uses: \.\/\.github\/workflows\/catalogo-nvidia\.yml/u);
 const section=parent.slice(
  parent.indexOf("  catalogo-nvidia-sin-generacion:"),
  parent.indexOf("  comprobar-nvidia:")
 );
 assert.ok(section.startsWith("  catalogo-nvidia-sin-generacion:"));
 assert.doesNotMatch(section,/coste_desconocido_autorizado/u);
 assert.match(section,/candidate_sha: \\$\\{\\{ inputs\\.candidate_sha \\$\\}\\}/u);
});
