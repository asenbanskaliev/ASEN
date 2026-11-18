import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {stageT06BehaviorSources,validateT06Handoff} from
 "../src/runtime/agents/t06-behavior-handoff.js";
import {isGithubHostedT06ManualSandboxRun} from
 "../src/runtime/agents/generated-code-docker-sandbox.js";

const names=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const bytes:Record<string,Buffer>={
 "t06-writer-a.mjs":Buffer.from("export function sumEvenNumbers(x){return 0}\n"),
 "t06-writer-b.mjs":Buffer.from("export function normalizeNames(x){return []}\n")
};
const digest=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
const sha="a".repeat(40);
const report=(hashes:Record<string,Buffer>=bytes,sourceSha=sha)=>({
 schema:"asen.t06.native-dual-writer/v1",sha:sourceSha,
 staticOnly:true,result:"PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED",
 generatedCodeExecuted:false,behaviorVerified:false,accepted:false,globalFull:false,
 workers:names.map((name,i)=>({
  worker:"t06-writer-"+(i===0?"a":"b"),scope:name,
  fileSha256:digest(hashes[name]!),writeOnlyVerified:true,behaviorVerified:false,
  syntaxOk:true,exactScope:true,attributionVerified:true,writeToolObserved:true,
  writeStarts:1,writeSuccesses:1,writeFailures:0
 }))
});
const manifest=(hashes:Record<string,Buffer>=bytes,sourceSha=sha)=>({
 schema:"asen.t06.behavior-handoff/v1",sha:sourceSha,
 files:names.map(name=>({name,sha256:digest(hashes[name]!)})),
 behaviorVerified:false,acceptance:"not-accepted",globalFull:false
});

test("T06 acepta solo bytes de ambos Writers con huellas Pi idénticas",()=>{
 assert.equal(validateT06Handoff({report:report(),manifest:manifest(),expectedSha:sha,files:bytes}),true);
 for(const wrong of [
  {report:report(),manifest:manifest(),expectedSha:sha,files:{...bytes,[names[0]]:Buffer.from("false")}},
  {report:report(),manifest:manifest(),expectedSha:"b".repeat(40),files:bytes},
  {report:{...report(),result:"PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW"},manifest:manifest(),expectedSha:sha,files:bytes},
  {report:{...report(),behaviorVerified:true},manifest:manifest(),expectedSha:sha,files:bytes},
  {report:{...report(),accepted:true},manifest:manifest(),expectedSha:sha,files:bytes},
  {report:report(),manifest:{...manifest(),globalFull:true},expectedSha:sha,files:bytes},
  {report:report(),manifest:{...manifest(),files:[...manifest().files].reverse()},expectedSha:sha,files:bytes},
  {report:report(),manifest:manifest(),expectedSha:sha,files:{"t06-writer-a.mjs":bytes[names[0]]!}}
 ])assert.equal(validateT06Handoff(wrong),false,"No admitir origen manipulado");
});

test("T06 no admite PASS si la segunda escritura no está acreditada",()=>{
 const changed=report();
 assert.equal(validateT06Handoff({
  report:{...changed,workers:[changed.workers[0],{
   ...changed.workers[1],writeOnlyVerified:false
  }]},manifest:manifest(),expectedSha:sha,files:bytes
 }),false);
});

test("T06 etapa GitHub no hereda secretos, Docker es opcional y separado",()=>{
 const yaml=readFileSync(new URL("../.github/workflows/t06-github-approved-writers.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
 const script=readFileSync(new URL("../scripts/t06-verificar-codigo-aislado-github.ts",import.meta.url),"utf8");
 const start=yaml.indexOf("\n  comprobar-comportamiento-aislado:");
 const job=yaml.slice(start);
 assert.ok(start>=0);
 assert.match(job,/needs: \[ejecutar\]/u);
 assert.match(job,/github\.run_attempt == 1/u);
 assert.match(job,/actions\/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53/u);
 assert.match(job,/test -z "\$\{NVIDIA_API_KEY:-\}"/u);
 assert.match(job,/ASEN_T06_ISOLATED_REPLAY: "1"/u);
 assert.match(job,/node@sha256:[0-9a-f]{64}/u);
 assert.doesNotMatch(job,/secrets\.|contents: write|pull-requests: write/u);
 assert.match(script,/validateT06Handoff\(/u);
 assert.match(script,/runDockerBehaviorCases\(/u);
 assert.match(script,/globalFull:false/u);
 assert.doesNotMatch(script,/blockUnisolatedGeneratedCodeTrial\("T06"\)/u);
 const writer=readFileSync(new URL("../scripts/t06-nvidia-dual-writer-native.ts",import.meta.url),"utf8");
 assert.match(writer,/stageT06BehaviorSources\(/u);
 assert.match(writer,/if\(!staticOnly\)blockUnisolatedGeneratedCodeTrial\("T06"\)/u);
});

test("T06 Docker manual rechaza otra rama, otro SHA, intentos repetidos o no ser GitHub",()=>{
 const good:Record<string,string>={
  ASEN_DOCKER_TESTS_CI:"1",ASEN_T06_ISOLATED_REPLAY:"1",
  GITHUB_ACTIONS:"true",RUNNER_ENVIRONMENT:"github-hosted",RUNNER_OS:"Linux",
  GITHUB_REPOSITORY:"asenbanskaliev/ASEN",GITHUB_EVENT_NAME:"workflow_dispatch",
  GITHUB_ACTOR:"asenbanskaliev",GITHUB_REF:"refs/heads/feat/flujo-de-agentes-20261115",
  GITHUB_RUN_ATTEMPT:"1",GITHUB_SHA:sha,ASEN_EXPECTED_SHA:sha
 };
 assert.equal(isGithubHostedT06ManualSandboxRun(good),true);
 for(const key of Object.keys(good)){
  assert.equal(isGithubHostedT06ManualSandboxRun({...good,[key]:"distinto"}),false,key);
  const missing={...good};delete missing[key];
  assert.equal(isGithubHostedT06ManualSandboxRun(missing),false,"sin "+key);
 }
});

test("T06 copia dos fuentes del mismo commit sin abrir ningún módulo",t=>{
 if(process.platform!=="linux"){t.skip("La entrega real de worktrees se limita al ejecutor Linux");return;}
 const tmp=mkdtempSync(join(tmpdir(),"asen-t06-handoff-"));
 t.after(()=>rmSync(tmp,{recursive:true,force:true}));
 const base=join(tmp,"repo"),out=join(tmp,"informe"),a=join(tmp,"a"),b=join(tmp,"b");
 mkdirSync(base);mkdirSync(out);
 const git=(dir:string,...args:string[])=>execFileSync("git",["-C",dir,...args],{
  encoding:"utf8",timeout:15000
 }).trim();
 git(base,"init","-q");
 git(base,"-c","user.email=tests@asen.invalid","-c","user.name=Pruebas","commit",
  "--allow-empty","-m","Inicial");
 const current=git(base,"rev-parse","HEAD");
 git(base,"worktree","add","--detach",a,current);
 git(base,"worktree","add","--detach",b,current);
 writeFileSync(join(a,names[0]),bytes[names[0]]!);
 writeFileSync(join(b,names[1]),bytes[names[1]]!);
 const receipt=stageT06BehaviorSources({report:report(bytes,current),
  expectedSha:current,worktrees:[a,b],outputDir:out});
 assert.equal(receipt.sha,current);
 const candidate=join(out,"t06-codigo-aislado");
 for(const name of names)assert.deepEqual(readFileSync(join(candidate,name)),bytes[name]);
 assert.equal(validateT06Handoff({report:report(bytes,current),manifest:
  JSON.parse(readFileSync(join(candidate,"manifiesto.json"),"utf8")) as unknown,
  expectedSha:current,files:bytes}),true);
 assert.throws(()=>stageT06BehaviorSources({
  report:report(bytes,current),expectedSha:current,worktrees:[a,b],outputDir:out
 }),/existente/u);
 // Un cambio no autorizado, una fuente distinta o un directorio repetido se bloquean.
 const fresh=join(tmp,"otro");mkdirSync(fresh);
 writeFileSync(join(a,"extra.txt"),"cambio inesperado");
 assert.throws(()=>stageT06BehaviorSources({
  report:report(bytes,current),expectedSha:current,worktrees:[a,b],outputDir:fresh
 }),/único archivo/u);
 rmSync(join(a,"extra.txt"));
 assert.throws(()=>stageT06BehaviorSources({
  report:report(bytes,current),expectedSha:current,worktrees:[a,a],outputDir:fresh
 }),/duplicado/u);
});
