/** Prueba nativa en GitHub Actions: SIN modelos, credenciales ni Writer.
 * No se descubre en el npm test local ni habilita T06/T08.
 */
import assert from "node:assert/strict";
import {spawnSync,execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {isGithubHostedSandboxRun,runDockerBehaviorCases,
 type TrustedBehaviorCase} from "../src/runtime/agents/generated-code-docker-sandbox.js";

assert.equal(isGithubHostedSandboxRun(),true,
 "Solo se permiten contenedores en el trabajo de GitHub Actions de esta PR");
const expectedSha=process.env.ASEN_EXPECTED_SHA;
assert.match(expectedSha??"",/^[a-f0-9]{40}$/u);
assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),expectedSha);
const image=process.env.ASEN_DOCKER_NODE_IMAGE??"";
assert.match(image,/^node@sha256:[a-f0-9]{64}$/u);

const minimalDockerArgs=[
 "run","--rm","--pull=never","--network=none","--read-only",
 "--cap-drop=ALL","--security-opt=no-new-privileges",
 "--pids-limit=32","--memory=128m","--cpus=1","--user=65534:65534",
 "--entrypoint=/usr/local/bin/node",image,"--input-type=module","--eval"
];
const networkProbe=[
 "import {networkInterfaces} from 'node:os';",
 "const others=Object.keys(networkInterfaces()).filter(name=>name!=='lo');",
 "if(others.length!==0)process.exit(4);",
 "try{await fetch('https://example.com',{signal:AbortSignal.timeout(1500)});",
 "process.exit(5);}catch{process.stdout.write('SIN_RED_VERIFICADA\\n')}"
].join("");
const probe=spawnSync("/usr/bin/docker",[...minimalDockerArgs,networkProbe],{
 encoding:"utf8",timeout:10_000,maxBuffer:4096,
 env:{PATH:"/usr/bin:/bin"},stdio:["ignore","pipe","pipe"]
});
assert.equal(probe.error,undefined,"Docker debe estar disponible");
assert.equal(probe.status,0,"La prueba de red del contenedor debe finalizar");
assert.equal(probe.signal,null);
assert.equal(probe.stdout,"SIN_RED_VERIFICADA\n",
 "El contenedor debe tener solo loopback y ningún acceso exterior");

const root=mkdtempSync(join(tmpdir(),"asen-docker-gh-"));
const target="candidate.mjs";
const cases:readonly TrustedBehaviorCase[]=[
 {id:"vacio",input:[],expected:{kind:"value",value:0}},
 {id:"positivos",input:[2,4,7],expected:{kind:"value",value:6}},
 {id:"negativos",input:[-8,3,2],expected:{kind:"value",value:-6}},
 {id:"decimal-invalido",input:[2,1.5],expected:{kind:"throws",name:"TypeError"}},
 {id:"cadena-invalida",input:["2"],expected:{kind:"throws",name:"TypeError"}}
];
try{
 const good=`export function sumEvenNumbers(numbers){
  if(!Array.isArray(numbers)||!numbers.every(Number.isSafeInteger))
    throw new TypeError('solo enteros');
  return numbers.filter(n=>n%2===0).reduce((sum,n)=>sum+n,0);
}`;
 writeFileSync(join(root,target),good);
 const verified=runDockerBehaviorCases({root,target,fn:"sumEvenNumbers",image,cases});
 assert.deepEqual(verified,{
  verified:true,completed:cases.length,reason:"casos-externos-superados"
 },"Los casos correctos deben completarse dentro del contenedor");

 // Una función ordinaria congelada sigue siendo invocable y verificable.
 const frozen=good+"\nObject.freeze(sumEvenNumbers);";
 writeFileSync(join(root,target),frozen);
 assert.deepEqual(runDockerBehaviorCases({root,target,fn:"sumEvenNumbers",image,cases}),
  {verified:true,completed:cases.length,reason:"casos-externos-superados"},
  "Una función normal congelada no es una clase y no debe rechazarse");

 // Prueba de regresión: la entrada NO debe conservar constructores del
 // proceso privilegiado. Con el antiguo f(p.input), retornaría 999.
 const escapeCandidate=`export function sumEvenNumbers(numbers){
  try {
   const leaked=numbers.constructor.constructor('return typeof process')();
   return leaked==='object'?999:0;
  } catch(error) { return error?.name==='EvalError'?0:999; }
 }`;
 writeFileSync(join(root,target),escapeCandidate);
 const isolated=runDockerBehaviorCases({root,target,fn:"sumEvenNumbers",image,cases:[
  {id:"prototipo-a",input:[1],expected:{kind:"value",value:0}},
  {id:"prototipo-b",input:[2],expected:{kind:"value",value:0}}
 ]});
 assert.deepEqual(isolated,{verified:true,completed:2,reason:"casos-externos-superados"},
  "La prueba Docker debe impedir recuperar el proceso desde el prototipo de la entrada");

 const bypasses=[
  `export function sumEvenNumbers(){
    process.stdout.write('{"kind":"value","value":0}\\n');
    process.exit(0);
  }`,
  `export function sumEvenNumbers(){
    return (()=>{})['constructor']('return process')().exit(0);
  }`,
  `export function sumEvenNumbers(){
    return 0;
  }`
 ];
 for(const [index,source] of bypasses.entries()){
  writeFileSync(join(root,target),source);
  const rejected=runDockerBehaviorCases({root,target,fn:"sumEvenNumbers",image,cases});
  assert.equal(rejected.verified,false,
   "Ninguna salida 0 falsa, constructor o implementación incorrecta puede aprobar");
  assert.equal(rejected.reason,"asercion-no-superada",
   "La prueba adversarial "+index+" debe ejecutar el candidato y fallar por resultado, no por sintaxis o Docker");
 }
 // El error de infraestructura por export ausente NO es un TypeError del candidato.
 // En versiones anteriores, dos casos que esperaban TypeError podían dar PASS.
 for(const invalid of [
  "export function otraFuncion(){throw new TypeError('candidato');}",
  "export const sumEvenNumbers=123;",
  "export class sumEvenNumbers { constructor(){ throw new TypeError('constructor no invocado'); } }"
 ]){
  writeFileSync(join(root,target),invalid);
  const required:readonly TrustedBehaviorCase[]=[
   {id:"primera",input:[1],expected:{kind:"throws",name:"TypeError"}},
   {id:"segunda",input:[2],expected:{kind:"throws",name:"TypeError"}}
  ];
  assert.deepEqual(runDockerBehaviorCases({root,target,fn:"sumEvenNumbers",image,cases:required}),
   {verified:false,completed:0,reason:"exportacion-rechazada"},
   "El controlador debe acreditar que rechazó el export");
 }
 assert.deepEqual(runDockerBehaviorCases({root,target:"candidato-ausente.mjs",fn:"sumEvenNumbers",image,cases}),
  {verified:false,completed:0,reason:"origen-ausente"},
  "El origen ausente se detecta antes de iniciar Docker");
 console.log("PRUEBA_GITHUB_DOCKER_OK: red aislada y cinco casos externos verificados");
 console.log("BLOQUEO_T06_T08: permanece vigente; sin proveedores, Writer ni permisos");
}finally{
 rmSync(root,{recursive:true,force:true});
}
