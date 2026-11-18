import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 dockerBehaviorArguments,isGithubHostedSandboxRun,runDockerBehaviorCases,verifyExternalBehaviorCases,
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
  {root,target:"../prohibido.mjs",fn:"sumEvenNumbers",image:digest,cases},
  {root,target:"inexistente.mjs",fn:"sumEvenNumbers",image:digest,cases}
 ]){
  assert.equal(runDockerBehaviorCases(input).verified,false);
 }
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
