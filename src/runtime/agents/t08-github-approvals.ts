/** T08: comprobación de autorizaciones REALES de entornos GitHub.
 * Ninguna variable, informe ni respuesta del modelo sustituye a GitHub.
 * Una aprobación para revisar NO concede automáticamente escritura. */
import {inspectPlannedWorkerModelRoute} from "./parallel-worker-model-route.js";

export const T08_REVIEW_ENVIRONMENT="asen-t08-revisores";
export const T08_FIX_ENVIRONMENT="asen-t08-reparacion";
export type T08ApprovalStage="review"|"fix";
export interface T08ApprovalContext{
 readonly repository:string;readonly actor:string;readonly eventName:string;
 readonly ref:string;readonly sha:string;readonly expectedSha:string;
 readonly runId:string;readonly attempt:string;readonly actions:string;
 readonly costAcknowledged:string;readonly reviewerA:string;
 readonly reviewerB:string;readonly writerModel:string;
}
export type T08ApprovalDecision=Readonly<{
 readonly status:"approved-environments-only"|"blocked";
 readonly reason:string;readonly stages:readonly string[];
 readonly writerAuthority:false;readonly globalFull:false;
 readonly costVerified:false;
}>;
const repo="asenbanskaliev/ASEN",branch="feat/flujo-de-agentes-20261115";
const record=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype;
const blocked=(reason:string):T08ApprovalDecision=>Object.freeze({
 status:"blocked" as const,reason,stages:Object.freeze([] as string[]),
 writerAuthority:false as const,globalFull:false as const,costVerified:false as const
});
export function validateT08GithubApprovals(input:{
 readonly context:T08ApprovalContext;readonly run:unknown;readonly approvals:unknown;
 readonly stage:T08ApprovalStage;
}):T08ApprovalDecision{
 const {context,run,approvals,stage}=input??{};
 if(!context||!["review","fix"].includes(stage)||
  context.repository!==repo||context.actor!=="asenbanskaliev"||
  context.eventName!=="workflow_dispatch"||
  context.ref!=="refs/heads/"+branch||context.actions!=="true"||
  !/^[a-f0-9]{40}$/u.test(context.sha)||
  context.sha!==context.expectedSha||
  !/^[1-9][0-9]{0,14}$/u.test(context.runId)||
  context.attempt!=="1"||context.costAcknowledged!=="true")
  return blocked("Identidad GitHub, SHA, intento o consentimiento de coste inválidos");
 const models=[context.reviewerA,context.reviewerB,context.writerModel];
 if(models.some(model=>inspectPlannedWorkerModelRoute(model).status!=="pinned"||
  !/^nvidia\/[A-Za-z0-9][A-Za-z0-9_./:@-]{2,190}$/u.test(model))||
  new Set(models).size!==3)
  return blocked("La prueba exige tres rutas NVIDIA explícitas y distintas");
 if(!record(run)||run.id!==Number(context.runId)||
  run.event!=="workflow_dispatch"||run.head_sha!==context.sha||
  run.head_branch!==branch||run.run_attempt!==1||
  !record(run.repository)||run.repository.full_name!==repo||
  !record(run.actor)||run.actor.login!==context.actor)
  return blocked("Ejecución GitHub no coincide con el candidato exacto");
 if(!Array.isArray(approvals)||approvals.length>40)
  return blocked("Historial GitHub no verificable");
 const seen=new Set<string>();
 for(const row of approvals){
  if(!record(row)||!Array.isArray(row.environments)||
   !row.environments.every(env=>record(env)&&typeof env.name==="string"))
   return blocked("Registro GitHub malformado");
  const names=row.environments.map(env=>(env as {name:string}).name);
  const relevant=names.filter(name=>name===T08_REVIEW_ENVIRONMENT||name===T08_FIX_ENVIRONMENT);
  if(!relevant.length)continue;
  if(relevant.length!==1||names.length!==1||row.state!=="approved"||
   !record(row.user)||row.user.type!=="User"||
   row.user.login!=="asenbanskaliev"||seen.has(relevant[0]!))
   return blocked("T08 exige aprobaciones individuales, sin salto, duplicados o rechazo");
  seen.add(relevant[0]!);
 }
 if(!seen.has(T08_REVIEW_ENVIRONMENT)||
  stage==="fix"&&!seen.has(T08_FIX_ENVIRONMENT))
  return blocked("Falta aprobación humana protegida para esta etapa");
 return Object.freeze({
  status:"approved-environments-only" as const,
  reason:"Historial del run comprobado; aún no autoriza herramientas Pi por sí solo",
  stages:Object.freeze([...seen].sort()),
  writerAuthority:false as const,globalFull:false as const,costVerified:false as const
 });
}
export async function requireLiveT08GithubApprovals(
 stage:T08ApprovalStage,env:NodeJS.ProcessEnv=process.env
):Promise<T08ApprovalDecision>{
 const context:T08ApprovalContext={
  repository:env.GITHUB_REPOSITORY??"",actor:env.GITHUB_ACTOR??"",
  eventName:env.GITHUB_EVENT_NAME??"",ref:env.GITHUB_REF??"",
  sha:env.GITHUB_SHA??"",expectedSha:env.ASEN_T08_EXPECTED_SHA??"",
  runId:env.GITHUB_RUN_ID??"",attempt:env.GITHUB_RUN_ATTEMPT??"",
  actions:env.GITHUB_ACTIONS??"",costAcknowledged:env.ASEN_T08_COST_ACK??"",
  reviewerA:env.ASEN_T08_REVIEW_A??"",reviewerB:env.ASEN_T08_REVIEW_B??"",
  writerModel:env.ASEN_T08_WRITER_MODEL??""
 };
 // Validación puramente local: jamás se construyen aprobaciones simuladas.
 if(context.repository!==repo||context.actor!=="asenbanskaliev"||
  context.eventName!=="workflow_dispatch"||
  context.ref!=="refs/heads/"+branch||context.actions!=="true"||
  !/^[a-f0-9]{40}$/u.test(context.sha)||context.sha!==context.expectedSha||
  !/^[1-9][0-9]{0,14}$/u.test(context.runId)||
  context.attempt!=="1"||context.costAcknowledged!=="true"||
  [context.reviewerA,context.reviewerB,context.writerModel].some(
   model=>inspectPlannedWorkerModelRoute(model).status!=="pinned"||
    !/^nvidia\/[A-Za-z0-9][A-Za-z0-9_./:@-]{2,190}$/u.test(model)
  )||new Set([context.reviewerA,context.reviewerB,context.writerModel]).size!==3)
  throw Error("T08 requiere identidad, SHA, coste y tres modelos NVIDIA distintos");
 const token=env.GITHUB_TOKEN;
 if(!token||token.length<20)throw Error("T08 requiere un token GitHub con Actions:read");
 const base="https://api.github.com/repos/"+repo+"/actions/runs/"+context.runId;
 const read=async(path:string):Promise<unknown>=>{
  const res=await fetch(base+path,{headers:{
   Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28","User-Agent":"ASEN-T08-gate"
  },signal:AbortSignal.timeout(12_000)});
  if(!res.ok)throw Error("T08 no pudo comprobar aprobaciones reales en GitHub");
  return res.json() as Promise<unknown>;
 };
 const [run,approvals]=await Promise.all([read(""),read("/approvals")]);
 const check=validateT08GithubApprovals({context,run,approvals,stage});
 if(check.status!=="approved-environments-only")throw Error("T08 bloqueado: "+check.reason);
 return check;
}
