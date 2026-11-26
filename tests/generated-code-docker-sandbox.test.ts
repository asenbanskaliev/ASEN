import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 dockerBehaviorArguments,isGithubHostedSandboxRun,isGithubHostedT06OwnerReplayRun,
 isGithubHostedT06ManualSandboxRun,isGithubHostedT08SandboxRun,
 runDockerBehaviorCases,verifyExternalBehaviorCases,
 type ContainerObservation,type TrustedBehaviorCase
} from "../src/runtime/agents/generated-code-docker-sandbox.js";

const digest="node@sha256:"+"a".repeat(64);
const cases:readonly TrustedBehaviorCase[]=[
 {id:"suma-vacia",input:[],expected:{kind:"value",value:0}},
 {id:"suma-pares",input:[-6,3,8],expected:{kind:"value",value:2}},
 {id:"rechaza-decimal",input:[2,1.5],expected:{kind:"throws",name:"TypeError"}}
];
const observe=(record:unknown,status:number|null=0):ContainerObservation=>({
 status,signal:null,stdout:JSON.stringify(record)+"\n"
});
const good=cases.map(item=>observe(item.expected));

test("el padre verifica todas las respuestas, no una afirmación de PASS del candidato",()=>{
 assert.deepEqual(verifyExternalBehaviorCases(cases,good),
  {verified:true,completed:3,reason:"casos-externos-superados"});
 assert.equal(verifyExternalBehaviorCases([],[]).verified,false);
 assert.deepEqual(verifyExternalBehaviorCases(cases,good.slice(0,2)),
  {verified:false,completed:0,reason:"faltan-observaciones"});
 assert.equal(verifyExternalBehaviorCases(
  [cases[0]!,cases[0]!],[good[0]!,good[0]!] ).verified,false,
  "No debe aceptar identificadores repetidos");
});

test("salida 0 prematura, error o señal nunca acreditan aserciones",()=>{
 for(const observation of [
  {status:0,signal:null,stdout:""},
  {status:0,signal:null,stdout:"PASS\n"},
  {status:0,signal:null,stdout:'{"kind":"value","value":0}\nOTRO\n'},
  {status:0,signal:null,stdout:"{}\n"},
  {status:1,signal:null,stdout:good[0]!.stdout},
  {status:0,signal:"SIGTERM",stdout:good[0]!.stdout},
  {status:null,signal:null,stdout:good[0]!.stdout,error:"timeout"}
 ] satisfies ContainerObservation[]){
  const outcome=verifyExternalBehaviorCases(cases,[observation,...good.slice(1)]);
  assert.equal(outcome.verified,false,JSON.stringify(observation));
  assert.equal(outcome.completed,0);
 }
});

test("una respuesta parcial correcta seguida de una falsa tampoco pasa",()=>{
 const outcome=verifyExternalBehaviorCases(cases,[
  good[0]!,observe({kind:"value",value:0}),good[2]!
 ]);
 assert.deepEqual(outcome,{verified:false,completed:1,reason:"asercion-no-superada"});
});

test("la orden al contenedor exige red desactivada, imagen local y privilegios mínimos",()=>{
 const args=dockerBehaviorArguments(digest,"/tmp/solo-candidato.mjs",
  "sumEvenNumbers",[2,4]);
 for(const part of ["--pull=never","--network=none","--read-only","--cap-drop=ALL",
  "--security-opt=no-new-privileges","--user=65534:65534",
  "--pids-limit=32","--memory=128m","--cpus=1"]){
  assert.ok(args.includes(part),part);
 }
 assert.equal(args.includes("--privileged"),false);
 assert.ok(args.some(arg=>arg.includes("readonly")&&arg.includes("candidate.mjs")));
 assert.equal(args.includes(digest),true);
 assert.equal(args.join(" ").includes("NVIDIA_API_KEY"),false);
 for(const image of ["node:latest","node:24","otro@sha256:"+"a".repeat(64)]){
  assert.throws(()=>dockerBehaviorArguments(image,"/tmp/a.mjs","sumEvenNumbers",[]));
 }
});

test("el código generado no recibe objetos del proceso que controla la prueba",()=>{
 const args=dockerBehaviorArguments(digest,"/tmp/solo-candidato.mjs","sumEvenNumbers",[2]);
 const script=args[args.indexOf("--eval")+1]??"";
 assert.match(script,/runInContext/u);
 assert.match(script,/f\(safeInput\)/u);
 assert.equal(script.includes("f(p.input)"),false);
 assert.match(script,/Function\.prototype\.toString/u);
 assert.doesNotMatch(script,/prototype'\)\?\.writable/u);
});

test("no ejecuta contenido sin imagen fijada, casos completos o archivo real",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-prueba-sin-modelos-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const target="t06-writer-a.mjs";
 writeFileSync(join(root,target),
  "export function sumEvenNumbers(x){return 0;}\n");
 for(const input of [
  {root,target,fn:"sumEvenNumbers",image:"node:latest",cases},
  {root,target,fn:"sumEvenNumbers",image:digest,cases:[]},
  {root,target:"../prohibido.mjs",fn:"sumEvenNumbers",image:digest,cases}
 ]){
  assert.deepEqual(runDockerBehaviorCases(input),
   {verified:false,completed:0,reason:"configuracion-invalida"});
 }
 // El test local prueba exclusivamente que no se puede ejecutar Docker.
 // La prueba de archivo ausente se hace en el trabajo aislado GitHub.
 const outcome=runDockerBehaviorCases({root,target:"inexistente.mjs",
  fn:"sumEvenNumbers",image:digest,cases});
 const authorized=process.platform==="linux"&&
  (isGithubHostedSandboxRun()||isGithubHostedT06ManualSandboxRun()||
   isGithubHostedT06OwnerReplayRun()||isGithubHostedT08SandboxRun());
 assert.deepEqual(outcome,{verified:false,completed:0,
  reason:authorized?"origen-ausente":"solo-github-actions"});
});

test("Docker solo se habilita en GitHub Actions de la PR y rama autorizadas",()=>{
 const valid:Record<string,string>={
  ASEN_DOCKER_TESTS_CI:"1",GITHUB_ACTIONS:"true",
  RUNNER_ENVIRONMENT:"github-hosted",RUNNER_OS:"Linux",
  GITHUB_REPOSITORY:"asenbanskaliev/ASEN",
  GITHUB_EVENT_NAME:"pull_request",
  GITHUB_HEAD_REF:"feat/flujo-de-agentes-20261115"
 };
 assert.equal(isGithubHostedSandboxRun({}),false);
 assert.equal(isGithubHostedSandboxRun(valid),true);
 for(const key of Object.keys(valid)){
  assert.equal(isGithubHostedSandboxRun({...valid,[key]:"no"}),
   false,"Una variable alterada debe impedir Docker: "+key);
  const without={...valid};delete without[key];
  assert.equal(isGithubHostedSandboxRun(without),false,
   "Una variable ausente debe impedir Docker: "+key);
 }
});

test("T08: un export rechazado debe venir del controlador y no de Docker",()=>{
 const rejected={status:73,signal:null,stdout:"ASEN_EXPORT_RECHAZADO\n"} satisfies ContainerObservation;
 assert.deepEqual(verifyExternalBehaviorCases(cases,[rejected,...good.slice(1)]),
  {verified:false,completed:0,reason:"exportacion-rechazada"});
 for(const incomplete of [
  {status:125,signal:null,stdout:"ASEN_EXPORT_RECHAZADO\n"},
  {status:73,signal:null,stdout:""},
  {status:73,signal:"SIGTERM",stdout:"ASEN_EXPORT_RECHAZADO\n"},
  {status:null,signal:null,stdout:"",error:"proceso-no-disponible",errorCode:"ENOENT"}
 ] satisfies ContainerObservation[]){
  const verdict=verifyExternalBehaviorCases(cases,[incomplete,...good.slice(1)]);
  assert.equal(verdict.verified,false);
  assert.notEqual(verdict.reason,"exportacion-rechazada");
 }
 const timeout={status:null,signal:"SIGTERM",stdout:"",
  error:"proceso-no-disponible",errorCode:"ETIMEDOUT"} satisfies ContainerObservation;
 assert.deepEqual(verifyExternalBehaviorCases(cases,[timeout,...good.slice(1)]),
  {verified:false,completed:0,reason:"tiempo-agotado"});
});

test("el fallo del arranque Docker no equivale a un export rechazado",()=>{
 const unavailable:ContainerObservation={status:null,signal:null,stdout:"",error:"proceso-no-disponible"};
 assert.deepEqual(verifyExternalBehaviorCases(cases,[unavailable,...good.slice(1)]),
  {verified:false,completed:0,reason:"lanzamiento-docker-fallido"});
 assert.deepEqual(verifyExternalBehaviorCases(cases,[{status:1,signal:null,stdout:""},...good.slice(1)]),
  {verified:false,completed:0,reason:"proceso-incompleto"});
});

test("T08: el exceso de salida no es un fallo de arranque Docker",()=>{
 const overflow:ContainerObservation={status:null,signal:"SIGTERM",stdout:"",
  error:"proceso-no-disponible",errorCode:"ENOBUFS"};
 assert.deepEqual(verifyExternalBehaviorCases(cases,[good[0]!,overflow,good[2]!]),
  {verified:false,completed:1,reason:"salida-excesiva"});
});

test("T06 replay solo admite SHA, run original, primer push y propietario",()=>{
 const valid={
  ASEN_DOCKER_TESTS_CI:"1",ASEN_T06_ISOLATED_REPLAY:"1",
  ASEN_T06_OWNER_OFFLINE_REPLAY:"1",
  GITHUB_ACTIONS:"true",RUNNER_ENVIRONMENT:"github-hosted",RUNNER_OS:"Linux",
  GITHUB_REPOSITORY:"asenbanskaliev/ASEN",GITHUB_EVENT_NAME:"push",
  GITHUB_ACTOR:"asenbanskaliev",
  GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:"a".repeat(40),
  ASEN_T06_VERIFIER_SHA:"a".repeat(40),ASEN_EXPECTED_SHA:"5bd752374f2db630a9d2ab0887e1025134a4e13f",
  ASEN_T06_SOURCE_RUN_ID:"44792916571",
  ASEN_T06_HEAD_COMMIT_MESSAGE:"ci(asen): verificar T06 sin NVIDIA"
 };
 assert.equal(isGithubHostedT06OwnerReplayRun(valid),true);
 for(const key of Object.keys(valid)){
  assert.equal(isGithubHostedT06OwnerReplayRun({...valid,[key]:"no"}),false,key);
  const without:Record<string,string>={...valid};delete without[key];
  assert.equal(isGithubHostedT06OwnerReplayRun(without),false,key);
 }
});
