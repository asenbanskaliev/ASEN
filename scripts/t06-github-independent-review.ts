/** T06: revisar dos fuentes Pi con dos modelos NVIDIA, SOLO después de
 * prueba aislada de 17 casos y dos autorizaciones humanas nuevas.
 * El proceso de revisión NO posee herramientas ni autorización Writer. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {validT06ReviewerModels,requireLiveT06GithubReviewerApprovals}
 from "../src/runtime/agents/t06-github-reviewer-approvals.js";
import {verifyT06IndependentReviewInputs,t06ReviewHashes}
 from "../src/runtime/agents/t06-independent-review-admission.js";
import {runT06NativeIndependentReviews} from "./t06-native-independent-review.js";
import {requireLiveT06ReviewReplay,T06_REPLAY_SOURCE_SHA,T06_REPLAY_SOURCE_RUN} from "../src/runtime/agents/t06-review-replay.js";

const expectedSha=process.env.ASEN_T06_EXPECTED_SHA??"";
const replay=process.env.ASEN_T06_REVIEW_REPLAY_MODE==="1";
const sourceSha=replay?process.env.ASEN_T06_SOURCE_SHA??"":expectedSha;
const codeDir=process.env.ASEN_T06_REVIEW_CODE_DIR??"";
const behaviorDir=process.env.ASEN_T06_REVIEW_BEHAVIOR_DIR??"";
const outputDir=process.env.ASEN_T06_REVIEW_REPORT_DIR??"";
const paths=["t06-writer-a.mjs","t06-writer-b.mjs"] as const;
const report={
 schema:"asen.t06.github-independent-review/v1",
 sha:sourceSha,sourceRunId:replay?T06_REPLAY_SOURCE_RUN:null,status:"blocked",
 modelsVerified:false,providerPriceVerified:false,billingVerified:false,
 humanApprovalsVerified:false,behaviorVerified:false,
 reviewedFileHashes:{} as Readonly<Record<string,string>>,
 reviews:[] as unknown[],accepted:false,globalFull:false,
 blockers:[] as string[]
};
const loadJson=(file:string,maxSize:number):unknown=>{
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>maxSize)
  throw Error("T06: informe inexistente o no fiable");
 return JSON.parse(readFileSync(file,"utf8")) as unknown;
};
try{
 assert.equal(process.env.ASEN_T06_GITHUB_REVIEW_MODE,"1");
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1");
 assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(process.env.GITHUB_EVENT_NAME,"workflow_dispatch");
 assert.equal(process.env.GITHUB_ACTOR,"asenbanskaliev");
 assert.equal(process.env.GITHUB_REF,"refs/heads/feat/flujo-de-agentes-20261115");
 assert.equal(process.env.GITHUB_SHA,expectedSha);
 assert.match(expectedSha,/^[a-f0-9]{40}$/u);
 assert.match(sourceSha,/^[a-f0-9]{40}$/u);
 if(replay){
  assert.equal(sourceSha,T06_REPLAY_SOURCE_SHA);
  assert.equal(process.env.ASEN_T06_SOURCE_RUN_ID,String(T06_REPLAY_SOURCE_RUN));
 }
 assert.equal(process.env.ASEN_T06_COST_ACK,"true");
 assert.equal(validT06ReviewerModels(
  process.env.ASEN_T06_REVIEW_MODEL_A,process.env.ASEN_T06_REVIEW_MODEL_B),true);
 assert.ok(codeDir.startsWith("/")&&behaviorDir.startsWith("/")&&outputDir.startsWith("/"));
 assert.ok(process.env.NVIDIA_API_KEY?.length);
 const policyRoot=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
 assert.equal(execFileSync("git",["-C",policyRoot,"rev-parse","HEAD"],{
  encoding:"utf8",timeout:12_000
 }).trim(),expectedSha);
 const root=realpathSync(codeDir);
 const candidate=realpathSync(join(root,"t06-codigo-aislado"));
 const receipt=loadJson(join(root,"t06-dual-native-evidence.json"),100_000);
 const manifest=loadJson(join(candidate,"manifiesto.json"),5_000);
 const behavior=loadJson(join(realpathSync(behaviorDir),"t06-veredicto-aislado.json"),12_000);
 const files:Record<string,Buffer>={};
 for(const name of paths){
  const file=join(candidate,name),stat=lstatSync(file);
  assert.equal(stat.isFile(),true);
  assert.equal(stat.isSymbolicLink(),false);
  assert.ok(stat.size>=1&&stat.size<=10_000);
  assert.equal(realpathSync(file),file);
  files[name]=readFileSync(file);
 }
 const admission=verifyT06IndependentReviewInputs({
  expectedSha:sourceSha,report:receipt,manifest,files,behavior
 });
 if(!admission.allowed)throw Error("T06: traspaso o aislamiento no acreditados");
 report.behaviorVerified=true;
 report.reviewedFileHashes=t06ReviewHashes(files);
 // Primer control antes de permitir cualquier acceso al proveedor.
 if(replay)await requireLiveT06ReviewReplay();
 else await requireLiveT06GithubReviewerApprovals();
 report.humanApprovalsVerified=true;
 // El runner repite la consulta GitHub y exige --no-tools en cada Pi.
 const result=await runT06NativeIndependentReviews(
  [candidate,candidate],policyRoot,"nvidia/nemotron-3.5-lightning-30b-a3b"
 );
 report.reviews=[...result.reviews];
 report.status=result.status==="PASS_TWO_PI_REVIEWS_NOT_T10"?
  "candidate-reviewed-by-two-models":"blocked";
 report.modelsVerified=report.status==="candidate-reviewed-by-two-models";
 if(!report.modelsVerified)report.blockers.push("revision-no-superada-o-sin-modelos-comprobados");
}catch{
 report.status="blocked";
 report.blockers.push("origen-consentimiento-o-proveedor-no-verificado");
}finally{
 if(outputDir.startsWith("/")){
  const target=resolve(outputDir);
  if(!existsSync(target))mkdirSync(target,{recursive:true,mode:0o700});
  writeFileSync(join(target,"t06-revisiones.json"),JSON.stringify(report,null,2)+"\n",{
   mode:0o600,flag:"wx"
  });
 }
 process.stdout.write(JSON.stringify({
  status:report.status,humanApprovalsVerified:report.humanApprovalsVerified,
  behaviorVerified:report.behaviorVerified,modelsVerified:report.modelsVerified,
  globalFull:false
 })+"\n");
}
if(report.status!=="candidate-reviewed-by-two-models")process.exitCode=1;
