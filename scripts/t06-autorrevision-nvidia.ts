/** T06: dos dictámenes nativos Pi sobre los dos archivos ya comprobados.
 * Ningún permiso de escritura, no ejecuta código recibido, sin aceptación FULL. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync,realpathSync,mkdirSync,writeFileSync} from "node:fs";
import {join,isAbsolute} from "node:path";
import {autorizarT06RevisionAutomatica,T06_REVISION_FUENTE,T06_REVISION_RUN,T06_PRUEBAS_RUN} from
 "../src/runtime/agents/t06-auto-review-authority.js";
import {verifyT06IndependentReviewInputs,t06ReviewHashes} from
 "../src/runtime/agents/t06-independent-review-admission.js";
import {consultarCatalogoNvidia} from "./catalogo-nvidia.mjs";
import {validarCatalogoRevisionReutilizada} from "./t06-catalogo-revision-reutilizada.mjs";
import {runT06NativeIndependentReviews} from "./t06-native-independent-review.js";
import {admitT06VerifiedSuperReview} from "../src/runtime/agents/t06-verified-review-reuse.js";

const names=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const models=["nvidia/nemotron-3-super-120b-a12b","nvidia/nemotron-3.5-super-vl-120b-a12b"] as const;
const data=(path:string,max:number):unknown=>{
 const st=lstatSync(path);
 assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size>1&&st.size<=max);
 return JSON.parse(readFileSync(path,"utf8")) as unknown;
};
async function main():Promise<void>{
 assert.equal(autorizarT06RevisionAutomatica(process.env),true,"Autorización T06 insuficiente");
 const root=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
 const expected=process.env.ASEN_T06_EXPECTED_SHA??"";
 assert.equal(execFileSync("git",["-C",root,"rev-parse","HEAD"],{
  encoding:"utf8",timeout:12_000}).trim(),expected);
 const source=process.env.ASEN_T06_REVIEW_CODE_DIR??"";
 const checks=process.env.ASEN_T06_REVIEW_BEHAVIOR_DIR??"";
 const destination=process.env.ASEN_T06_REVIEW_REPORT_DIR??"";
 assert.ok([source,checks,destination].every(isAbsolute));
 const sourcePath=realpathSync(source);
 const codeRoot=realpathSync(join(sourcePath,"t06-codigo-aislado"));
 const original=data(join(sourcePath,"t06-dual-native-evidence.json"),100_000);
 const manifest=data(join(codeRoot,"manifiesto.json"),5000);
 const behavior=data(join(realpathSync(checks),"t06-veredicto-aislado.json"),12000);
 const files:Record<string,Buffer>={};
 for(const name of names){
  const path=join(codeRoot,name),stat=lstatSync(path);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=10000);
  assert.equal(realpathSync(path),path);
  files[name]=readFileSync(path);
 }
 const admission=verifyT06IndependentReviewInputs({
  expectedSha:T06_REVISION_FUENTE,report:original,manifest,files,behavior
 });
 assert.equal(admission.allowed,true,admission.reason);
 assert.equal(admission.globalFull,false);
 // Validar primero el PASS real reutilizado; no repite llamadas al segundo revisor.
 const previous=data(process.env.ASEN_T06_PREVIOUS_PASS??"",10_000);
 const reusedSuper=admitT06VerifiedSuperReview(previous,t06ReviewHashes(files));
 // GET autenticado sin generación: solo el modelo NUEVO debe estar disponible.
 const available=await consultarCatalogoNvidia({clave:process.env.NVIDIA_API_KEY});
 validarCatalogoRevisionReutilizada(available,reusedSuper);
 assert.equal(autorizarT06RevisionAutomatica(process.env),true);
 const result=await runT06NativeIndependentReviews([codeRoot,codeRoot],root,
  "nvidia/nemotron-3.5-lightning-30b-a3b",reusedSuper);
 const validated=result.status==="PASS_TWO_PI_REVIEWS_NOT_T10";
 const report={
  schema:"asen.t06.autorrevision-real/v1",sourceSha:T06_REVISION_FUENTE,
  sourceRunId:T06_REVISION_RUN,behaviorRunId:T06_PRUEBAS_RUN,
  reviewSha:expected,runId:process.env.GITHUB_RUN_ID,
  models,reviewedFileHashes:t06ReviewHashes(files),
  behaviorVerified:true,providerCatalogVerified:true,
  result:result.status,reviews:result.reviews,
  reviewedByTwoModels:validated,
  providerPriceVerified:false,billingVerified:false,
  writerAuthorized:false,accepted:false,globalFull:false
 };
 mkdirSync(destination,{recursive:true,mode:0o700});
 writeFileSync(join(destination,"t06-opiniones-reales.json"),
  JSON.stringify(report,null,2)+"\n",{mode:0o600,flag:"wx"});
 process.stdout.write(JSON.stringify({result:report.result,
  reviewedByTwoModels:report.reviewedByTwoModels,
  modelsVerified:result.reviews.map((x:Record<string,unknown>)=>x.observedModel),
  reasons:result.reviews.map((x:Record<string,unknown>)=>x.failureCategory??"none"),
  reviewedSha:expected,globalFull:false})+"\n");
 if(!validated)process.exitCode=1;
}
main().catch(error=>{
 console.error("T06 revisión bloqueada: "+(error instanceof Error?error.message:"error interno"));
 process.exitCode=1;
});
