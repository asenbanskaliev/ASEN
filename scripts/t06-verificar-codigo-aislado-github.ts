/** T06: ejecutar exclusivamente en Docker los archivos Pi entregados por
 * el trabajo previo, con las credenciales NVIDIA ausentes del trabajo actual. */
import assert from "node:assert/strict";
import {spawnSync,execFileSync} from "node:child_process";
import {existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {validateT06Handoff} from "../src/runtime/agents/t06-behavior-handoff.js";
import {isGithubHostedT06ManualSandboxRun,isGithubHostedT06OwnerReplayRun,runDockerBehaviorCases,
 type TrustedBehaviorCase} from "../src/runtime/agents/generated-code-docker-sandbox.js";

const sha=process.env.ASEN_EXPECTED_SHA??"";
const image=process.env.ASEN_DOCKER_NODE_IMAGE??"";
const sourceRoot=process.env.ASEN_T06_ISOLATED_DIR??"";
const outputDir=process.env.ASEN_T06_SANDBOX_REPORT_DIR??"";
const names=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const tests:Readonly<Record<string,readonly TrustedBehaviorCase[]>>={
 "t06-writer-a.mjs":[
  {id:"a-vacio",input:[],expected:{kind:"value",value:0}},
  {id:"a-pares",input:[2,4,7],expected:{kind:"value",value:6}},
  {id:"a-negativos",input:[-8,3,2],expected:{kind:"value",value:-6}},
  {id:"a-impares",input:[1,3,-5],expected:{kind:"value",value:0}},
  {id:"a-cero",input:[0,-2,5],expected:{kind:"value",value:-2}},
  {id:"a-decimal",input:[2,1.5],expected:{kind:"throws",name:"TypeError"}},
  {id:"a-texto",input:["2"],expected:{kind:"throws",name:"TypeError"}},
  {id:"a-no-lista",input:null,expected:{kind:"throws",name:"TypeError"}},
  {id:"a-mezcla",input:[2,null],expected:{kind:"throws",name:"TypeError"}}
 ],
 "t06-writer-b.mjs":[
  {id:"b-vacio",input:[],expected:{kind:"value",value:[]}},
  {id:"b-orden",input:[" B ","a","b"," A ",""],expected:{kind:"value",value:["a","b"]}},
  {id:"b-duplicados",input:["Pedro","pedro",""],expected:{kind:"value",value:["pedro"]}},
  {id:"b-espacios",input:["  ","x"],expected:{kind:"value",value:["x"]}},
  {id:"b-invalido",input:["X",17],expected:{kind:"throws",name:"TypeError"}},
  {id:"b-no-lista",input:null,expected:{kind:"throws",name:"TypeError"}},
  {id:"b-objeto",input:{a:"x"},expected:{kind:"throws",name:"TypeError"}},
  {id:"b-nulo",input:[null],expected:{kind:"throws",name:"TypeError"}}
 ]
};
const readJson=(path:string,maxBytes:number):unknown=>{
 const stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>maxBytes)
  throw Error("T06: registro de origen no fiable");
 return JSON.parse(readFileSync(path,"utf8")) as unknown;
};
const reportDir=resolve(outputDir);
let record={
 schema:"asen.t06.isolated-behavior/v1",
 sha,status:"blocked",reasons:[] as string[],
 isolated:true,networkDisabled:false,providerSecretsAbsent:false,
 writers:[] as {name:string;verified:boolean;completed:number;reason:string}[],
 behaviorVerified:false,providerUsageVerified:false,billingVerified:false,
 independentlyReviewed:false,accepted:false,globalFull:false
};
try{
 assert.equal(isGithubHostedT06ManualSandboxRun()||isGithubHostedT06OwnerReplayRun(),true);
 assert.match(sha,/^[a-f0-9]{40}$/u);
 assert.match(image,/^node@sha256:[a-f0-9]{64}$/u);
 assert.ok(sourceRoot.startsWith("/")&&outputDir.startsWith("/"));
 assert.equal(process.env.NVIDIA_API_KEY,undefined);
 assert.equal(process.env.OPENROUTER_API_KEY,undefined);
 assert.equal(process.env.GITHUB_TOKEN,undefined);
 record.providerSecretsAbsent=true;
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{
  encoding:"utf8",timeout:12000
 }).trim(),process.env.ASEN_T06_OWNER_OFFLINE_REPLAY==="1"?
  process.env.ASEN_T06_VERIFIER_SHA:sha);
 const root=realpathSync(sourceRoot);
 const candidate=join(root,"t06-codigo-aislado");
 const manifest=readJson(join(candidate,"manifiesto.json"),5000);
 const report=readJson(join(root,"t06-dual-native-evidence.json"),100_000);
 const files:Record<string,Buffer>={};
 for(const name of names){
  const file=join(candidate,name),stat=lstatSync(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>=1&&stat.size<=10_000);
  assert.equal(realpathSync(file),file);
  files[name]=readFileSync(file);
 }
 assert.equal(validateT06Handoff({report,manifest,expectedSha:sha,files}),true,
  "Las fuentes deben coincidir exactamente con los dos recibos Pi");
 const args=[
  "run","--rm","--pull=never","--network=none","--read-only",
  "--cap-drop=ALL","--security-opt=no-new-privileges","--pids-limit=32",
  "--memory=128m","--cpus=1","--user=65534:65534",
  "--entrypoint=/usr/local/bin/node",image,"--input-type=module","--eval",
  "import {networkInterfaces} from 'node:os';"+
  "if(Object.keys(networkInterfaces()).some(x=>x!=='lo'))process.exit(15);"+
  "try{await fetch('https://example.com',{signal:AbortSignal.timeout(1500)});"+
  "process.exit(16)}catch{process.stdout.write('SIN_RED_VERIFICADA\\n')}"
 ];
 const probe=spawnSync("/usr/bin/docker",args,{
  encoding:"utf8",timeout:12_000,maxBuffer:4096,env:{PATH:"/usr/bin:/bin"},
  stdio:["ignore","pipe","pipe"]
 });
 assert.equal(probe.status,0,"Aislamiento de red no comprobado");
 assert.equal(probe.signal,null);
 assert.equal(probe.stdout,"SIN_RED_VERIFICADA\n");
 record.networkDisabled=true;
 record.writers=names.map((name,i)=>{
  const verdict=runDockerBehaviorCases({
   root:candidate,target:name,fn:i===0?"sumEvenNumbers":"normalizeNames",
   image,cases:tests[name]!
  });
  return {name,verified:verdict.verified,completed:verdict.completed,
   reason:verdict.reason};
 });
 record.behaviorVerified=record.writers.length===2&&
  record.writers.every(x=>x.verified===true);
 record.status=record.behaviorVerified?"candidate-behavior-passed":"blocked";
 if(!record.behaviorVerified)record.reasons.push("al-menos-un-archivo-no-supero-los-casos-externos");
}catch{
 record.status="blocked";
 record.reasons.push("origen-aislamiento-o-pruebas-no-verificados");
}finally{
 if(outputDir.startsWith("/")&&!existsSync(reportDir))
  mkdirSync(reportDir,{recursive:true,mode:0o700});
 if(outputDir.startsWith("/")&&existsSync(reportDir))
  writeFileSync(join(reportDir,"t06-veredicto-aislado.json"),
   JSON.stringify(record,null,2)+"\n",{flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({status:record.status,
  networkDisabled:record.networkDisabled,
  writers:record.writers,globalFull:false})+"\n");
}
if(!record.behaviorVerified)process.exitCode=1;
