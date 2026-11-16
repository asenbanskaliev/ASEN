import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {verifyT06NativeSnapshot} from "../src/runtime/agents/t06-native-snapshot-verifier.js";

const sha256=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{
 encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:12000
}).trim();
const model="nvidia/nemotron-3.5-lightning-30b-a3b";
function fixture(t:TestContext){
 const dir=mkdtempSync(join(tmpdir(),"asen-t06-reconcile-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const source=join(dir,"source");mkdirSync(source);
 git(source,"init","-q");
 writeFileSync(join(source,"README.md"),"source\n");
 git(source,"add","README.md");
 git(source,"-c","user.name=ASEN","-c","user.email=asen@example.invalid",
  "-c","commit.gpgsign=false","commit","-qm","base");
 const commit=git(source,"rev-parse","HEAD");
 const roots=[join(dir,"writer-a"),join(dir,"writer-b")] as const;
 for(const root of roots)git(source,"worktree","add","--detach",root,commit);
 const workerIds=["t06-writer-a","t06-writer-b"] as const;
 const scopes=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
 const workers=scopes.map((scope,i)=>{
  const content=Buffer.from("export function example"+i+"(){return "+i+";}\n");
  writeFileSync(join(roots[i]!,scope),content);
  return {worker:workerIds[i],session:"t06-child-"+(i===0?
   "11111111-1111-4111-8111-111111111111":"22222222-2222-4222-8222-222222222222"),
   scope,requestedModel:model,observedModel:model,
   processObserved:true,writeToolObserved:true,nativeResultOk:true,
   exactScope:true,syntaxOk:true,behaviorOk:true,durationMs:130,
   fileSha256:sha256(content),passed:true};
 });
 const report={
  schema:"asen.t06.native-dual-writer/v1",sha:commit,piVersion:"1.2.0",
  executionKind:"NATIVE_PI_RPC_WRITER_WITH_TWO_MANUAL_TERMINAL_APPROVALS",
  consentMethod:"two-distinct-interactive-parent-terminal-prompts-not-native-pi-TUI",
  requestedModel:model,modelCostVerified:false,billingVerified:false,
  distinctWorktrees:true,distinctSessions:true,concurrent:true,
  workers,independentReview:{status:"NOT_RUN",reviews:[]},
  autoRetry:false,autoMerge:false,accepted:false,globalFull:false,
  result:"PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW"
 };
 return {source,roots,report,workers,scopes};
}
test("T06 el verificador coteja DOS huellas con Git sin afirmar ejecución o autorización",t=>{
 const f=fixture(t),result=verifyT06NativeSnapshot({report:f.report,worktreeRoots:f.roots});
 assert.equal(result.status,"local-files-consistent-claims-unverified");
 assert.equal(result.locallyMatchedFiles,2);
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.humanConsentVerified,false);
 assert.equal(result.actualProviderVerified,false);
 assert.equal(result.behaviorRetested,false);
 assert.equal(result.independentReviewVerified,false);
 assert.equal(result.billingVerified,false);
 assert.equal(result.globalFull,false);
 assert.equal(result.acceptance,"not-accepted");
});
test("T06 bloquea huellas falsas, rutas ajenas, SHA distinto y worktrees repetidos",t=>{
 const f=fixture(t);
 const run=(report:unknown,roots=f.roots)=>
  verifyT06NativeSnapshot({report,worktreeRoots:roots});
 const cases=[
  {...f.report,sha:"b".repeat(40)},
  {...f.report,concurrent:false},
  {...f.report,accepted:true},
  {...f.report,globalFull:true},
  {...f.report,distinctSessions:false},
  {...f.report,workers:[f.workers[0],{...f.workers[1],session:f.workers[0]!.session}]},
  {...f.report,workers:[{...f.workers[0],observedModel:"nvidia/otro"},f.workers[1]]},
  {...f.report,workers:[{...f.workers[0],passed:false},f.workers[1]]}
 ];
 for(const row of cases){
  const result=run(row);
  assert.equal(result.status,"blocked");
  assert.equal(result.globalFull,false);
 }
 assert.equal(run(f.report,[f.roots[0],f.roots[0]]).status,"blocked");
 writeFileSync(join(f.roots[1],"t06-writer-b.mjs"),"código cambiado");
 assert.equal(run(f.report).status,"blocked");
});
test("T06 rechaza ficheros añadidos fuera del ámbito aunque los dos hash coincidan",t=>{
 const f=fixture(t);
 writeFileSync(join(f.roots[0],"fuera-de-ambito.txt"),"no permitido");
 const result=verifyT06NativeSnapshot({report:f.report,worktreeRoots:f.roots});
 assert.equal(result.status,"blocked");
 assert.equal(result.locallyMatchedFiles,1);
});
test("T06 cotejar un informe nunca ejecuta funciones generadas",t=>{
 const f=fixture(t);
 const filepath=join(f.roots[0],f.scopes[0]!);
 const code=Buffer.from("throw new Error('NO EJECUTAR');\n");
 writeFileSync(filepath,code);
 const changed={...f.workers[0],fileSha256:sha256(code)};
 const report={...f.report,workers:[changed,f.workers[1]]};
 assert.equal(readFileSync(filepath,"utf8"),code.toString("utf8"));
 const result=verifyT06NativeSnapshot({report,worktreeRoots:f.roots});
 assert.equal(result.status,"local-files-consistent-claims-unverified");
 assert.equal(result.behaviorRetested,false,"Los tests se comprueban fuera del lector de informes");
});

test("T06 coteja una procedencia GitHub real como declaración, nunca como permiso retrospectivo",t=>{
 const f=fixture(t);
 const onGithub={...f.report,
  executionKind:"NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS",
  consentMethod:"two-distinct-github-environment-human-approvals-not-native-pi-TUI"};
 const status=verifyT06NativeSnapshot({report:onGithub,worktreeRoots:f.roots});
 assert.equal(status.status,"local-files-consistent-claims-unverified");
 assert.equal(status.humanConsentVerified,false);
 assert.equal(status.actualProviderVerified,false);
 assert.equal(status.globalFull,false);
 for(const forged of [
  {...onGithub,consentMethod:f.report.consentMethod},
  {...f.report,consentMethod:onGithub.consentMethod},
  {...onGithub,executionKind:"NATIVE_PI_RPC_WRITER_WITH_APPROVAL_BYPASS"}
 ]){
  assert.equal(verifyT06NativeSnapshot({report:forged,worktreeRoots:f.roots}).status,"blocked");
 }
});
