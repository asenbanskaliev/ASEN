/** Evidencia de cierre E18/E17/E16. Los archivos aportados no son autorizaciones.
 * Nunca convierte una prueba local, un recibo escrito por un modelo o un
 * estado GitHub omitido en aceptación final. */
import {compareAgentFlowSeries,type AgentFlowSeriesPair} from "../../review/agent-flow-series-comparison.js";

const SHA=/^[0-9a-f]{40}$/u;
const DIGEST=/^[0-9a-f]{64}$/u;
const systems=["linux","win32","darwin"] as const;
const modes=["tui","rpc","json","print"] as const;
type PiSystem=typeof systems[number];
type PiMode=typeof modes[number];
export interface PiMatrixEvidence {
 readonly id:string;readonly platform:PiSystem;readonly version:string;
 readonly mode:PiMode;readonly candidate:string;readonly artifactSha256:string;
 readonly result:"PASS"|"FAIL"|"SKIP";
 readonly observation?:Readonly<{
  mode:string;hasUI:boolean;commands:readonly string[];tools:readonly string[];
  modelCalls:number;shutdownObserved:boolean;exitCode:number|null;
  signal:string|null;timedOut:boolean;keyboardCommandObserved?:boolean;
 }>;
}
export interface FlowWriterWitness {
 readonly taskId:string;readonly sessionId:string;readonly worktree:string;
 readonly modelActual:string;readonly candidateSha:string;
 readonly authorizedPaths:readonly string[];readonly changedPaths:readonly string[];
 readonly startedAtMs:number;readonly completedAtMs:number;
 readonly piProcessObserved:boolean;readonly providerReceiptObserved:boolean;
 readonly humanGrantVerified:boolean;readonly testsPassed:boolean;
 readonly nativeWriteObserved:boolean;
}
export interface FlowReviewWitness {
 readonly modelA:string;readonly modelB:string;
 readonly judgeAReceiptObserved:boolean;readonly judgeBReceiptObserved:boolean;
 readonly verdictA:"pass"|"fail"|"unknown";readonly verdictB:"pass"|"fail"|"unknown";
 readonly unresolvedFindings:number;
}
export interface FlowEndToEndWitness {
 readonly candidateSha:string;readonly githubRunId:string;
 readonly writers:readonly FlowWriterWitness[];
 readonly review:FlowReviewWitness;
 readonly joinedTestsPassed:boolean;
 readonly exactCandidateChecked:boolean;
 readonly humanAcceptanceVerified:boolean;
 readonly automaticMerge:false;
}
export interface ClosurePoint {
 readonly status:"blocked"|"evidence-ready-for-independent-audit";
 readonly blockers:readonly string[];
 readonly evidenceOnly:true;
 readonly accepted:false;
 readonly globalFull:false;
}
export interface FlowClosureReport {
 readonly schema:"asen.flow-closure.16-18/v1";
 readonly candidateSha:string;
 readonly point18:ClosurePoint&Readonly<{cellsObserved:number;cellsExpected:12;
  authenticatedWriterSupported:false;autonomousChildLaunchProven:false}>;
 readonly point17:ClosurePoint;
 readonly point16:ClosurePoint;
 readonly globalFull:false;
}
const text=(s:unknown,max=256):s is string=>
 typeof s==="string"&&s.length>0&&s.length<=max&&s===s.trim()&&
 !/[\u0000-\u001f\u007f]/u.test(s);
const path=(s:unknown):s is string=>text(s,320)&&
 !s.startsWith("/")&&!s.includes("\\")&&
 s.split("/").every(x=>x!==""&&x!=="."&&x!=="..");
const outcome=(blockers:string[]):ClosurePoint=>Object.freeze({
 status:blockers.length?"blocked" as const:"evidence-ready-for-independent-audit" as const,
 blockers:Object.freeze([...new Set(blockers)]),evidenceOnly:true as const,
 accepted:false as const,globalFull:false as const
});
export function inspectPiMatrix18(sha:string,rows:readonly PiMatrixEvidence[]):FlowClosureReport["point18"]{
 const blockers:string[]=[];
 const keys=new Set<string>(),byPlatform=new Map<string,string>();
 if(!Array.isArray(rows)||rows.length!==12)blockers.push("Faltan las 12 celdas Pi de los tres sistemas");
 for(const row of Array.isArray(rows)?rows:[]){
  if(!row||!systems.includes(row.platform)||!modes.includes(row.mode)||
   row.version!=="1.2.0"||row.id!==row.platform+"-"+row.version+"-"+row.mode){
   blockers.push("Identidad de celda Pi no válida");continue;
  }
  if(keys.has(row.id))blockers.push("Celda Pi repetida");
  keys.add(row.id);
  if(row.candidate!==sha||!DIGEST.test(row.artifactSha256))
   blockers.push("SHA o paquete Pi sin procedencia comprobable");
  const samePack=byPlatform.get(row.platform);
  if(samePack&&samePack!==row.artifactSha256)
   blockers.push("El mismo sistema usó paquetes diferentes");
  byPlatform.set(row.platform,row.artifactSha256);
  const o=row.observation;
  if(row.result!=="PASS"||!o||o.mode!==row.mode||
   typeof o.hasUI!=="boolean"||o.modelCalls!==0||
   o.shutdownObserved!==true||o.exitCode!==0||o.signal!==null||
   o.timedOut!==false||!Array.isArray(o.commands)||
   !o.commands.includes("asen")||!Array.isArray(o.tools)||
   !["asen_ask_choice","ask_user_choice","ask_user_question"].every(t=>o.tools.includes(t))||
   row.mode==="tui"&&o.keyboardCommandObserved!==true)
   blockers.push("Falló una capacidad básica del anfitrión Pi");
 }
 for(const system of systems)for(const mode of modes)
  if(!keys.has(system+"-1.2.0-"+mode))blockers.push("Falta evidencia Pi en "+system+"/"+mode);
 return Object.freeze({...outcome(blockers),cellsObserved:keys.size,cellsExpected:12 as const,
  authenticatedWriterSupported:false as const,autonomousChildLaunchProven:false as const});
}
/** Los hechos de un informe de agente siguen siendo alegaciones hasta verificar
 * directamente las aprobaciones, modelos y procesos contra el proveedor/GitHub. */
export function inspectFlow17(sha:string,proof:FlowEndToEndWitness|null):ClosurePoint{
 const problems:string[]=[];
 if(!proof){return outcome(["Faltan dos Writers reales, revisión, pruebas y aceptación"]); }
 if(proof.candidateSha!==sha||!SHA.test(proof.candidateSha)||
  !/^[1-9][0-9]{0,17}$/u.test(proof.githubRunId))
  problems.push("Candidato o ejecución GitHub no coinciden");
 if(!Array.isArray(proof.writers)||proof.writers.length!==2){
  problems.push("Se necesitan dos Writers Pi observados");return outcome(problems);
 }
 const [a,b]=proof.writers;
 if(!a||!b)return outcome(["Falta al menos uno de los dos Writers"]);
 for(const worker of [a,b]){
  if(!text(worker.taskId)||!text(worker.sessionId)||!text(worker.worktree,1024)||
   !text(worker.modelActual)||worker.modelActual==="unknown"||
   worker.candidateSha!==sha||!Array.isArray(worker.authorizedPaths)||
   !Array.isArray(worker.changedPaths)||worker.authorizedPaths.length===0||
   worker.changedPaths.length===0||
   new Set(worker.authorizedPaths).size!==worker.authorizedPaths.length||
   new Set(worker.changedPaths).size!==worker.changedPaths.length||
   !worker.authorizedPaths.every(path)||!worker.changedPaths.every(path)||
   worker.changedPaths.some((f:string)=>!worker.authorizedPaths.includes(f)))
   problems.push("Writer sin identidad y ámbito exactos");
  if(!Number.isSafeInteger(worker.startedAtMs)||!Number.isSafeInteger(worker.completedAtMs)||
   worker.startedAtMs<0||worker.completedAtMs<=worker.startedAtMs)
   problems.push("Duración de Writer no acreditada");
  if(!worker.piProcessObserved||!worker.providerReceiptObserved||
   !worker.humanGrantVerified||!worker.testsPassed||!worker.nativeWriteObserved)
   problems.push("Escritura real o permiso de Writer no acreditado");
 }
 if(a.taskId===b.taskId||a.sessionId===b.sessionId||a.worktree===b.worktree)
  problems.push("Dos Workers comparten identidad o carpeta");
 if(a.authorizedPaths.some((x:string)=>b.authorizedPaths.includes(x))||
    a.changedPaths.some((x:string)=>b.changedPaths.includes(x)))
  problems.push("Los ámbitos de Writer se solapan");
 if(Number.isSafeInteger(a.startedAtMs)&&Number.isSafeInteger(b.startedAtMs)&&
    Number.isSafeInteger(a.completedAtMs)&&Number.isSafeInteger(b.completedAtMs)&&
    Math.max(a.startedAtMs,b.startedAtMs)>=Math.min(a.completedAtMs,b.completedAtMs))
  problems.push("No se observó ejecución simultánea");
 const review=proof.review;
 if(!review||!text(review.modelA)||!text(review.modelB)||
  review.modelA===review.modelB||review.judgeAReceiptObserved!==true||
  review.judgeBReceiptObserved!==true||review.verdictA!=="pass"||
  review.verdictB!=="pass"||review.unresolvedFindings!==0)
  problems.push("La doble revisión independiente no está acreditada");
 if(proof.joinedTestsPassed!==true||proof.exactCandidateChecked!==true||
  proof.humanAcceptanceVerified!==true||proof.automaticMerge!==false)
  problems.push("Pruebas conjuntas, aceptación o ausencia de fusión no acreditadas");
 return outcome(problems);
}
export function inspectComparison16(
 sha:string,pairs:readonly AgentFlowSeriesPair[]|null,
 referenceSha="ce64a9a708e50c0ca899c8023140e63f29f293e1"
):ClosurePoint{
 if(!pairs)return outcome(["Faltan las 18 ejecuciones A/B comparables"]);
 const issues:string[]=[];
 if(!SHA.test(referenceSha))issues.push("Versión de referencia no identificada");
 for(const pair of pairs){
  if(pair?.asen?.commit!==sha)issues.push("La ejecución ASEN no corresponde al SHA actual");
  if(pair?.reference?.commit!==referenceSha)
   issues.push("La referencia no corresponde a la revisión fijada");
 }
 try{
  const comparison=compareAgentFlowSeries(pairs);
  issues.push(...comparison.blockers);
  if(comparison.status!=="ready-for-independent-review")
   issues.push("Comparación A/B no admisible");
 }catch{
  issues.push("Recibos A/B malformados");
 }
 return outcome(issues);
}
export function auditFlowPoints16to18(input:{
 readonly sha:string;readonly matrix:readonly PiMatrixEvidence[];
 readonly flow:FlowEndToEndWitness|null;
 readonly pairs:readonly AgentFlowSeriesPair[]|null;
}):FlowClosureReport{
 if(!SHA.test(input.sha))throw Error("SHA del candidato incorrecto");
 return Object.freeze({
  schema:"asen.flow-closure.16-18/v1" as const,candidateSha:input.sha,
  point18:inspectPiMatrix18(input.sha,input.matrix),
  point17:inspectFlow17(input.sha,input.flow),
  point16:inspectComparison16(input.sha,input.pairs),
  globalFull:false as const
 });
}
