/** Revisión T06 sin repetir Writers: solo fuentes del run ya acreditado.
 * Separar consentimiento de generación anterior del de revisión nuevo. */
import {validateT06GithubApprovals,type T06GithubApprovalContext} from "./t06-github-approvals.js";
import {T06_REVIEW_ENVIRONMENTS,validT06ReviewerModels,type T06ReviewPermission} from "./t06-github-reviewer-approvals.js";

export const T06_REPLAY_SOURCE_RUN=44389671458;
export const T06_REPLAY_SOURCE_SHA="a33da9eebb92ac3131c958b14846945c31cd24a7";
const repo="asenbanskaliev/ASEN";
const branch="feat/flujo-de-agentes-20261115";
const object=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==="object"&&!Array.isArray(value);
const blocked=(reason:string):T06ReviewPermission=>Object.freeze({
 status:"blocked",reason,authority:"read-only-review-only",
 costVerified:false,accepted:false,globalFull:false
});
const allowed=():T06ReviewPermission=>Object.freeze({
 status:"approved-read-only-review",
 reason:"Dos autorizaciones humanas de revisión en este run y Writer anteriores verificados",
 authority:"read-only-review-only",costVerified:false,accepted:false,globalFull:false
});
export function validateT06ReviewReplay(input:{
 readonly currentContext:T06GithubApprovalContext;
 readonly currentRun:unknown;readonly currentApprovals:unknown;
 readonly sourceRun:unknown;readonly sourceApprovals:unknown;
 readonly sourceJobs:unknown;
 readonly reviewerA:string;readonly reviewerB:string;
}):T06ReviewPermission{
 const {currentContext:c,currentRun, currentApprovals,
  sourceRun,sourceApprovals,sourceJobs,reviewerA,reviewerB}=input;
 if(!validT06ReviewerModels(reviewerA,reviewerB))
  return blocked("Dos modelos de revisión NVIDIA diferentes son obligatorios");
 if(c.repository!==repo||c.actor!=="asenbanskaliev"||
  c.eventName!=="workflow_dispatch"||c.ref!=="refs/heads/"+branch||
  c.githubActions!=="true"||c.runAttempt!=="1"||
  c.costAcknowledged!=="true"||!/^\d{6,15}$/u.test(c.runId)||
  !/^[a-f0-9]{40}$/u.test(c.sha)||c.sha!==c.expectedSha)
  return blocked("Revisión: actor, rama, SHA o coste no autorizados");
 if(!object(currentRun)||currentRun.id!==Number(c.runId)||
  currentRun.run_attempt!==1||currentRun.head_sha!==c.sha||
  currentRun.head_branch!==branch||currentRun.event!=="workflow_dispatch"||
  !object(currentRun.actor)||currentRun.actor.login!==c.actor||
  !object(currentRun.repository)||currentRun.repository.full_name!==repo)
  return blocked("El run actual no corresponde a la solicitud manual");
 if(!object(sourceRun)||sourceRun.id!==T06_REPLAY_SOURCE_RUN||
  sourceRun.head_sha!==T06_REPLAY_SOURCE_SHA||
  sourceRun.run_attempt!==1||sourceRun.event!=="workflow_dispatch"||
  sourceRun.head_branch!==branch||sourceRun.conclusion!=="failure"||
  !object(sourceRun.actor)||sourceRun.actor.login!=="asenbanskaliev"||
  !object(sourceRun.repository)||sourceRun.repository.full_name!==repo)
  return blocked("El run origen no es el ensayo real acreditado");
 const oldContext:T06GithubApprovalContext={
  repository:repo,actor:"asenbanskaliev",eventName:"workflow_dispatch",
  ref:"refs/heads/"+branch,sha:T06_REPLAY_SOURCE_SHA,
  expectedSha:T06_REPLAY_SOURCE_SHA,githubActions:"true",
  runId:String(T06_REPLAY_SOURCE_RUN),runAttempt:"1",
  costAcknowledged:"true"
 };
 const prior=validateT06GithubApprovals({
  context:oldContext,workflowRun:sourceRun,reviewHistory:sourceApprovals
 });
 if(prior.status!=="approved-human-reviews-only")
  return blocked("Las dos aprobaciones originales de los Writers no están acreditadas");
 if(!Array.isArray(sourceJobs)||sourceJobs.length>100)
  return blocked("No se pudo recuperar el estado del ensayo original");
 for(const jobName of [
  "t06-escritura-con-aprobaciones / ejecutar",
  "t06-escritura-con-aprobaciones / comprobar-comportamiento-aislado"
 ]){
  const hits=sourceJobs.filter(job=>object(job)&&job.name===jobName);
  if(hits.length!==1||!object(hits[0])||hits[0].conclusion!=="success"||
   hits[0].status!=="completed")
   return blocked("El ensayo original no completó Writers y aislamiento");
 }
 if(!Array.isArray(currentApprovals)||currentApprovals.length>40)
  return blocked("Historial nuevo de aprobaciones no disponible");
 const approved=new Set<string>();
 for(const row of currentApprovals){
  if(!object(row)||!Array.isArray(row.environments)||row.environments.length>5||
   !row.environments.every(e=>object(e)&&typeof e.name==="string"))
   return blocked("Historial nuevo de revisiones malformado");
  const relevant=row.environments.map(e=>(e as {name:string}).name)
   .filter(name=>T06_REVIEW_ENVIRONMENTS.includes(name as typeof T06_REVIEW_ENVIRONMENTS[number]));
  if(relevant.length===0)continue;
  if(relevant.length!==1||row.environments.length!==1||
   row.state!=="approved"||!object(row.user)||row.user.type!=="User"||
   typeof row.user.login!=="string"||
   !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(row.user.login)||
   approved.has(relevant[0]!))
   return blocked("Cada revisor necesita aprobación humana independiente en este run");
  approved.add(relevant[0]!);
 }
 if(approved.size!==2)return blocked("Falta aprobación humana nueva de uno de los revisores");
 return allowed();
}
const contextFromEnv=(env:NodeJS.ProcessEnv):T06GithubApprovalContext=>({
 repository:env.GITHUB_REPOSITORY??"",actor:env.GITHUB_ACTOR??"",
 eventName:env.GITHUB_EVENT_NAME??"",ref:env.GITHUB_REF??"",
 sha:env.GITHUB_SHA??"",expectedSha:env.ASEN_T06_EXPECTED_SHA??"",
 githubActions:env.GITHUB_ACTIONS??"",runId:env.GITHUB_RUN_ID??"",
 runAttempt:env.GITHUB_RUN_ATTEMPT??"",
 costAcknowledged:env.ASEN_T06_COST_ACK??""
});
/** Revisa ambas ejecuciones con API de GitHub y deniega ante cualquier duda.
 * Se invoca antes de exponer al revisor la clave NVIDIA. */
export async function requireLiveT06ReviewReplay(
 env:NodeJS.ProcessEnv=process.env
):Promise<T06ReviewPermission>{
 const c=contextFromEnv(env);
 if(env.ASEN_T06_REVIEW_REPLAY_MODE!=="1"||
  env.ASEN_T06_SOURCE_RUN_ID!==String(T06_REPLAY_SOURCE_RUN)||
  env.ASEN_T06_SOURCE_SHA!==T06_REPLAY_SOURCE_SHA||
  !validT06ReviewerModels(env.ASEN_T06_REVIEW_MODEL_A,env.ASEN_T06_REVIEW_MODEL_B)||
  c.githubActions!=="true"||c.repository!==repo||c.actor!=="asenbanskaliev"||
  c.eventName!=="workflow_dispatch"||c.ref!=="refs/heads/"+branch||
  c.runAttempt!=="1"||c.costAcknowledged!=="true"||
  !/^[a-f0-9]{40}$/u.test(c.sha)||c.expectedSha!==c.sha||
  !/^\d{6,15}$/u.test(c.runId)||c.runId===String(T06_REPLAY_SOURCE_RUN))
  throw Error("T06: revisión histórica rechazada por contexto o modelo");
 const token=env.GITHUB_TOKEN;
 if(!token||token.length<20)throw Error("T06: falta permiso de lectura Actions");
 const request=async(url:string):Promise<unknown>=>{
  const response=await fetch(url,{headers:{
   Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28",
   "User-Agent":"ASEN-T06-review-replay"
  },signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error("T06: fallo al comprobar aprobación o origen en GitHub");
  return response.json() as Promise<unknown>;
 };
 const base="https://api.github.com/repos/"+repo+"/actions/runs/";
 const [currentRun,currentApprovals,sourceRun,sourceApprovals,sourceJobResponse]=
  await Promise.all([
   request(base+c.runId),request(base+c.runId+"/approvals"),
   request(base+T06_REPLAY_SOURCE_RUN),
   request(base+T06_REPLAY_SOURCE_RUN+"/approvals"),
   request(base+T06_REPLAY_SOURCE_RUN+"/jobs?per_page=100")
  ]);
 if(!object(sourceJobResponse)||!Array.isArray(sourceJobResponse.jobs)||
  sourceJobResponse.total_count!==sourceJobResponse.jobs.length)
  throw Error("T06: la lista de tareas de origen está incompleta");
 const receipt=validateT06ReviewReplay({
  currentContext:c,currentRun,currentApprovals,sourceRun,sourceApprovals,
  sourceJobs:sourceJobResponse.jobs,
  reviewerA:env.ASEN_T06_REVIEW_MODEL_A??"",
  reviewerB:env.ASEN_T06_REVIEW_MODEL_B??""
 });
 if(receipt.status!=="approved-read-only-review")
  throw Error("T06: revisores no autorizados: "+receipt.reason);
 return receipt;
}
