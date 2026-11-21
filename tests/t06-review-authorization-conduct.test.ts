import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {runT06NativeIndependentReviews} from "../scripts/t06-native-independent-review.js";
import {T06_REVISION_MENSAJE} from "../src/runtime/agents/t06-auto-review-authority.js";

const modeloA="nvidia/revisor-ejemplo-a";
const modeloB="nvidia/revisor-ejemplo-b";
const autor="nvidia/modelo-escritor";
const sha="a".repeat(40);
const id="44700000001";

// Restablecer todas las variables para no contaminar otras pruebas.
async function conEntorno<T>(values:Record<string,string|undefined>,run:()=>Promise<T>):Promise<T>{
 const before=new Map(Object.keys(values).map(key=>[key,process.env[key]] as const));
 for(const [key,value] of Object.entries(values)){
  if(value===undefined)delete process.env[key];
  else process.env[key]=value;
 }
 try{return await run();}
 finally{for(const [key,value] of before){
  if(value===undefined)delete process.env[key];
  else process.env[key]=value;
 }}
}
const sinProveedor={NVIDIA_API_KEY:undefined,PI_EXECUTABLE:"/asen-prohibido-para-pruebas",
 ASEN_T06_REVIEW_MODEL_A:modeloA,ASEN_T06_REVIEW_MODEL_B:modeloB,
 ASEN_T06_REVIEW_REPLAY_MODE:"0"};

test("PRE-1 deniega la ruta automática sin permiso antes de leer archivos o iniciar Pi",async()=>{
 const valid={
  ...sinProveedor,ASEN_T06_GITHUB_REVIEW_MODE:"0",ASEN_T06_AUTO_REVIEW_ONLY:"1",
  ASEN_T06_COST_ACK:"true",ASEN_T06_SOURCE_SHA:"5bd752374f2db630a9d2ab0887e1025134a4e13f",
  ASEN_T06_SOURCE_RUN_ID:"44792916571",ASEN_T06_BEHAVIOR_RUN_ID:"44794317489",
  ASEN_T06_EXPECTED_SHA:sha,ASEN_T06_HEAD_COMMIT_MESSAGE:T06_REVISION_MENSAJE,
  ASEN_T06_REVIEW_MODEL_A:"nvidia/nemotron-3.5-bolt-e4b",
  ASEN_T06_REVIEW_MODEL_B:"nvidia/nemotron-3.5-super-vl-120b-a12b",
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_EVENT_NAME:"push",GITHUB_ACTOR:"asenbanskaliev",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:id,GITHUB_SHA:sha
 };
 // Rutas deliberadamente inexistentes: una autorización denegada debe abortar
 // antes de acceder a los archivos y antes de poder lanzar un proceso.
 for(const change of [
  {ASEN_T06_COST_ACK:"false"},
  {ASEN_T06_EXPECTED_SHA:"b".repeat(40)},
  {GITHUB_RUN_ATTEMPT:"2"},
  {ASEN_T06_SOURCE_RUN_ID:"0"},
  {ASEN_T06_REVIEW_MODEL_B:"nvidia/modelo-no-autorizado"}
 ]){
  await conEntorno({...valid,...change},async()=>{
   await assert.rejects(
    runT06NativeIndependentReviews(["/archivo-inexistente-a","/archivo-inexistente-b"],
     "/politica-inexistente",autor),
    /T06: revisión automática no autorizada por el propietario/u
   );
  });
 }
});

test("PRE-1 no consulta proveedor sin aprobaciones GitHub válidas",async()=>{
 const env={
  ...sinProveedor,ASEN_T06_GITHUB_REVIEW_MODE:"1",ASEN_T06_AUTO_REVIEW_ONLY:"0",
  ASEN_T06_COST_ACK:"true",ASEN_T06_EXPECTED_SHA:sha,
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_ACTOR:"asenbanskaliev",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:id,GITHUB_SHA:sha,
  GITHUB_TOKEN:"token-de-prueba-sin-acceso-real-0000"
 };
 const previousFetch=globalThis.fetch;
 let requested=0;
 const run={id:Number(id),event:"workflow_dispatch",head_sha:sha,
  head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
  repository:{full_name:"asenbanskaliev/ASEN"},actor:{login:"asenbanskaliev"}};
 const denial=[{state:"approved",environments:[{name:"asen-t06-writer-a"}],
  user:{login:"persona",type:"User"}}];
 try{
  globalThis.fetch=(async(input)=>{
   requested++;
   const value=String(input).endsWith("/approvals")?denial:run;
   return new Response(JSON.stringify(value),{status:200,headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  await conEntorno(env,async()=>{
   await assert.rejects(
    runT06NativeIndependentReviews(["/nunca-leer-a","/nunca-leer-b"],
     "/nunca-ejecutar",autor),
    /T06: revisores no autorizados/u
   );
  });
  assert.equal(requested,2,"Solo debe comprobar run y aprobaciones una vez");
 }finally{globalThis.fetch=previousFetch;}
});

test("PRE-1 vuelve a consultar GitHub y bloquea aprobación revocada antes de Pi",async()=>{
 const env={
  ...sinProveedor,ASEN_T06_GITHUB_REVIEW_MODE:"1",ASEN_T06_AUTO_REVIEW_ONLY:"0",
  ASEN_T06_COST_ACK:"true",ASEN_T06_EXPECTED_SHA:sha,
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_ACTOR:"asenbanskaliev",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_RUN_ID:id,GITHUB_SHA:sha,
  GITHUB_TOKEN:"token-de-prueba-sin-acceso-real-0000"
 };
 const temp=mkdtempSync(join(tmpdir(),"asen-t06-revocacion-"));
 const roots=[join(temp,"a"),join(temp,"b")];
 for(let i=0;i<2;i++){
  mkdirSync(roots[i]!,{recursive:true});
  writeFileSync(join(roots[i]!,i===0?"t06-writer-a.mjs":"t06-writer-b.mjs"),
   "export const resultado = 1;\\n");
 }
 const run={id:Number(id),event:"workflow_dispatch",head_sha:sha,
  head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
  repository:{full_name:"asenbanskaliev/ASEN"},actor:{login:"asenbanskaliev"}};
 const approved=["asen-t06-writer-a","asen-t06-writer-b",
  "asen-t06-reviewer-a","asen-t06-reviewer-b"].map(name=>({
   state:"approved",environments:[{name}],user:{login:"persona",type:"User"}
  }));
 let checks=0,requests=0;
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=(async(input)=>{
   requests++;
   let payload:unknown=run;
   if(String(input).endsWith("/approvals")){
    checks++;
    payload=checks===1?approved:approved.slice(0,3); // Revisor B revocado.
   }
   return new Response(JSON.stringify(payload),{status:200,
    headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  await conEntorno(env,async()=>{
   await assert.rejects(
    runT06NativeIndependentReviews(roots,temp,autor),
    /T06: revisores no autorizados/u
   );
  });
  assert.equal(checks,2,"Debe volver a comprobar aprobaciones justo antes del proveedor");
  assert.equal(requests,4,"Dos consultas iniciales y dos anteriores a Pi");
 }finally{
  globalThis.fetch=originalFetch;
  rmSync(temp,{force:true,recursive:true});
 }
});

test("PRE-1 niega la ruta manual si no existe consola interactiva",async()=>{
 if(process.stdin.isTTY&&process.stdout.isTTY)return;
 await conEntorno({...sinProveedor,ASEN_T06_GITHUB_REVIEW_MODE:"0",
  ASEN_T06_AUTO_REVIEW_ONLY:"0"},async()=>{
  await assert.rejects(
   runT06NativeIndependentReviews(["/nunca-leer-a","/nunca-leer-b"],
    "/nunca-ejecutar",autor),
   /T06 revisión exige consentimiento humano interactivo/u
  );
 });
});
