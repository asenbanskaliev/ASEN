/** T06 GitHub Actions: prueba de consentimiento real por dos revisiones
 * de ENTORNO distintas, leídas de GitHub para ESTE run/primer intento.
 * Ningún recibo genera permiso Pi ni demuestra precio, calidad o paridad. */
export const T06_GITHUB_ENVIRONMENTS=Object.freeze([
 "asen-t06-writer-a","asen-t06-writer-b"
] as const);
const repo="asenbanskaliev/ASEN";
const branch="feat/flujo-de-agentes-20261115";
const shaPattern=/^[0-9a-f]{40}$/u;
const obj=(x:unknown):x is Record<string,unknown>=>
 x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
export interface T06GithubApprovalContext{
 readonly repository:string;
 readonly actor:string;
 readonly eventName:string;
 readonly ref:string;
 readonly sha:string;
 readonly expectedSha:string;
 readonly githubActions:string;
 readonly runId:string;
 readonly runAttempt:string;
 readonly costAcknowledged:string;
}
export type T06GithubApprovalDecision=Readonly<{
 readonly status:"approved-human-reviews-only"|"blocked";
 readonly reason:string;
 readonly approvedEnvironments:readonly string[];
 readonly authorization:"never-implied";
 readonly providerPriceVerified:false;
 readonly globalFull:false;
}>;
const result=(status:T06GithubApprovalDecision["status"],reason:string,
 environments:readonly string[]=[]):T06GithubApprovalDecision=>Object.freeze({
 status,reason,approvedEnvironments:Object.freeze([...environments]),
 authorization:"never-implied" as const,providerPriceVerified:false as const,
 globalFull:false as const
});
export function validateT06GithubApprovals(input:{
 readonly context:T06GithubApprovalContext;
 readonly workflowRun:unknown;
 readonly reviewHistory:unknown;
}):T06GithubApprovalDecision{
 const {context,workflowRun,reviewHistory}=input??{};
 if(!context||context.githubActions!=="true"||context.repository!==repo||
  context.actor.toLowerCase()!=="asenbanskaliev"||
  context.eventName!=="workflow_dispatch"||
  context.ref!=="refs/heads/"+branch||
  !shaPattern.test(context.sha)||context.sha!==context.expectedSha||
  !/^[1-9][0-9]{0,14}$/u.test(context.runId)||
  context.runAttempt!=="1"||context.costAcknowledged!=="true")
  return result("blocked","Contexto GitHub, SHA, coste o primer intento no comprobado");
 if(!obj(workflowRun)||workflowRun.id!==Number(context.runId)||
  workflowRun.event!=="workflow_dispatch"||
  workflowRun.head_sha!==context.sha||
  workflowRun.head_branch!==branch||workflowRun.run_attempt!==1||
  !obj(workflowRun.repository)||workflowRun.repository.full_name!==repo||
  !obj(workflowRun.actor)||typeof workflowRun.actor.login!=="string"||
  workflowRun.actor.login.toLowerCase()!==context.actor.toLowerCase())
  return result("blocked","La ejecución GitHub no coincide con el SHA y la identidad solicitados");
 if(!Array.isArray(reviewHistory)||reviewHistory.length>40)
  return result("blocked","No se pudo comprobar el historial de aprobaciones GitHub");
 const approved=new Set<string>();
 for(const row of reviewHistory){
  if(!obj(row)||!Array.isArray(row.environments)||
   !row.environments.every(env=>obj(env)&&typeof env.name==="string"))
   return result("blocked","Historial de aprobaciones malformado");
  const relevant=row.environments.map(env=>(env as {name:string}).name)
   .filter(name=>T06_GITHUB_ENVIRONMENTS.includes(name as typeof T06_GITHUB_ENVIRONMENTS[number]));
  if(relevant.length===0)continue;
  // Una sola aprobación de ambas casillas NO es consentimiento separado.
  if(relevant.length!==1||row.environments.length!==1||row.state!=="approved"||
   !obj(row.user)||row.user.type!=="User"||
   typeof row.user.login!=="string"||!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u.test(row.user.login)||
   approved.has(relevant[0]!))
   return result("blocked","Se necesitan dos aprobaciones humanas separadas, sin rechazo ni agrupación");
  approved.add(relevant[0]!);
 }
 if(approved.size!==T06_GITHUB_ENVIRONMENTS.length)
  return result("blocked","Falta una aprobación humana individual de entorno en GitHub");
 return result("approved-human-reviews-only",
  "Dos aprobaciones históricas del mismo run comprobadas; precio y autorización Pi no verificados",
  T06_GITHUB_ENVIRONMENTS);
}

/** Consulta GitHub justo antes de escribir; jamás confía en un archivo o
 * variable que diga que ya fue aprobado. El token solo necesita Actions:read. */
export async function requireLiveT06GithubApprovals(env:NodeJS.ProcessEnv=process.env):
 Promise<T06GithubApprovalDecision>{
 const context:T06GithubApprovalContext={
  repository:env.GITHUB_REPOSITORY??"",actor:env.GITHUB_ACTOR??"",
  eventName:env.GITHUB_EVENT_NAME??"",ref:env.GITHUB_REF??"",
  sha:env.GITHUB_SHA??"",expectedSha:env.ASEN_T06_EXPECTED_SHA??"",
  githubActions:env.GITHUB_ACTIONS??"",runId:env.GITHUB_RUN_ID??"",
  runAttempt:env.GITHUB_RUN_ATTEMPT??"",
  costAcknowledged:env.ASEN_T06_COST_ACK??""
 };
 const dummy={workflowRun:null,reviewHistory:null};
 const initial=validateT06GithubApprovals({context,...dummy});
 if(!/^[1-9][0-9]{0,14}$/u.test(context.runId)||
  context.repository!==repo||context.eventName!=="workflow_dispatch"||
  context.ref!=="refs/heads/"+branch||
  context.runAttempt!=="1"||context.githubActions!=="true"||
  context.sha!==context.expectedSha||!shaPattern.test(context.sha)||
  context.costAcknowledged!=="true"||context.actor.toLowerCase()!=="asenbanskaliev")
  throw new Error("T06 GitHub bloqueado: identidad, coste o primer intento inválidos");
 const token=env.GITHUB_TOKEN;
 if(!token||token.length<20)throw new Error("T06 GitHub bloqueado: token Actions:read ausente");
 const base="https://api.github.com/repos/"+repo+"/actions/runs/"+context.runId;
 const fetchJson=async(path:string):Promise<unknown>=>{
  const response=await fetch(base+path,{
   headers:{Accept:"application/vnd.github+json",
    Authorization:"Bearer "+token,
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"ASEN-T06-approval-verifier"},
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error("T06 GitHub: consulta de aprobaciones no disponible");
  return response.json() as Promise<unknown>;
 };
 const [workflowRun,reviewHistory]=await Promise.all([
  fetchJson(""),fetchJson("/approvals")
 ]);
 const receipt=validateT06GithubApprovals({context,workflowRun,reviewHistory});
 if(receipt.status!=="approved-human-reviews-only")
  throw new Error("T06 GitHub bloqueado: "+receipt.reason);
 return receipt;
}
