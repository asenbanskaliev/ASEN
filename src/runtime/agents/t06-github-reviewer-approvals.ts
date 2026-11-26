/** T06 — dos consentimientos nuevos para revisión NVIDIA.
 * Las aprobaciones de los Writers NO autorizan revisiones posteriores. */
import {
 validateT06GithubApprovals,type T06GithubApprovalContext
} from "./t06-github-approvals.js";

export const T06_REVIEW_ENVIRONMENTS=Object.freeze([
 "asen-t06-reviewer-a","asen-t06-reviewer-b"
] as const);
const writerModel="nvidia/nemotron-3.5-lightning-30b-a3b";
const modelPattern=/^nvidia\/[A-Za-z0-9][A-Za-z0-9_./:@-]{2,190}$/u;
const object=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==="object"&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;
export function validT06ReviewerModels(a:unknown,b:unknown):boolean{
 return typeof a==="string"&&typeof b==="string"&&
 modelPattern.test(a)&&modelPattern.test(b)&&a!==b&&
 a!==writerModel&&b!==writerModel;
}
export type T06ReviewPermission=Readonly<{
 readonly status:"blocked"|"approved-read-only-review";
 readonly reason:string;
 readonly authority:"read-only-review-only";
 readonly costVerified:false;
 readonly accepted:false;
 readonly globalFull:false;
}>;
const decision=(status:T06ReviewPermission["status"],reason:string):T06ReviewPermission=>
 Object.freeze({status,reason,authority:"read-only-review-only" as const,
  costVerified:false as const,accepted:false as const,globalFull:false as const});

export function validateT06GithubReviewerApprovals(input:{
 readonly context:T06GithubApprovalContext;
 readonly run:unknown;
 readonly approvals:unknown;
 readonly reviewerA:string;
 readonly reviewerB:string;
}):T06ReviewPermission{
 const {context,run,approvals,reviewerA,reviewerB}=input;
 if(!validT06ReviewerModels(reviewerA,reviewerB))
  return decision("blocked","Se requieren dos modelos NVIDIA distintos del Writer y entre sí");
 const writers=validateT06GithubApprovals({
  context,workflowRun:run,reviewHistory:approvals
 });
 if(writers.status!=="approved-human-reviews-only")
  return decision("blocked","Faltan las autorizaciones Writer verificables de este run");
 if(!Array.isArray(approvals))return decision("blocked","Historial no disponible");
 const accepted=new Set<string>();
 for(const row of approvals){
  if(!object(row)||!Array.isArray(row.environments))continue;
  if(!row.environments.every(x=>object(x)&&typeof x.name==="string"))
   return decision("blocked","Revisiones de entorno malformadas");
  const matching=row.environments.map(x=>(x as {name:string}).name)
   .filter(x=>T06_REVIEW_ENVIRONMENTS.includes(x as typeof T06_REVIEW_ENVIRONMENTS[number]));
  if(matching.length===0)continue;
  if(row.environments.length!==1||matching.length!==1||
   row.state!=="approved"||!object(row.user)||row.user.type!=="User"||
   typeof row.user.login!=="string"||
   !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(row.user.login)||
   accepted.has(matching[0]!))
   return decision("blocked","Cada revisor requiere su propia aprobación humana sin agrupación");
  accepted.add(matching[0]!);
 }
 if(accepted.size!==2)return decision("blocked","Falta aprobación humana de uno de los revisores");
 return decision("approved-read-only-review",
  "Dos revisiones independientes aprobadas para este run; no autorizan Writer ni aceptación");
}
export async function requireLiveT06GithubReviewerApprovals(
 env:NodeJS.ProcessEnv=process.env
):Promise<T06ReviewPermission>{
 const context:T06GithubApprovalContext={
  repository:env.GITHUB_REPOSITORY??"",actor:env.GITHUB_ACTOR??"",
  eventName:env.GITHUB_EVENT_NAME??"",ref:env.GITHUB_REF??"",
  sha:env.GITHUB_SHA??"",expectedSha:env.ASEN_T06_EXPECTED_SHA??"",
  githubActions:env.GITHUB_ACTIONS??"",runId:env.GITHUB_RUN_ID??"",
  runAttempt:env.GITHUB_RUN_ATTEMPT??"",
  costAcknowledged:env.ASEN_T06_COST_ACK??""
 };
 const reviewerA=env.ASEN_T06_REVIEW_MODEL_A??"",reviewerB=env.ASEN_T06_REVIEW_MODEL_B??"";
 // No se consulta GitHub ni se entrega la clave NVIDIA si faltan modelos válidos.
 if(!validT06ReviewerModels(reviewerA,reviewerB)||
  context.githubActions!=="true"||context.runAttempt!=="1"||
  context.repository!=="asenbanskaliev/ASEN"||
  context.actor!=="asenbanskaliev"||context.eventName!=="workflow_dispatch"||
  context.ref!=="refs/heads/feat/flujo-de-agentes-20261115"||
  !/^[a-f0-9]{40}$/u.test(context.sha)||context.sha!==context.expectedSha||
  !/^[1-9][0-9]{0,14}$/u.test(context.runId)||
  context.costAcknowledged!=="true")
  throw Error("T06: identidad, coste, SHA, modelos o primer intento rechazados");
 const token=env.GITHUB_TOKEN;
 if(!token||token.length<20)throw Error("T06: falta credencial de lectura Actions");
 const base="https://api.github.com/repos/asenbanskaliev/ASEN/actions/runs/"+context.runId;
 const get=async(suffix:string):Promise<unknown>=>{
  const resp=await fetch(base+suffix,{
   headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"ASEN-T06-independent-review"},
   signal:AbortSignal.timeout(12_000)
  });
  if(!resp.ok)throw Error("T06: no se puede validar el historial GitHub");
  return resp.json() as Promise<unknown>;
 };
 const [run,approvals]=await Promise.all([get(""),get("/approvals")]);
 const permission=validateT06GithubReviewerApprovals({
  context,run,approvals,reviewerA,reviewerB
 });
 if(permission.status!=="approved-read-only-review")
  throw Error("T06: revisores no autorizados: "+permission.reason);
 return permission;
}
