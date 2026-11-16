/** T09: comparación A/B de resultados observados, sin convertir un informe
 * aportado por un agente en una aprobación de calidad o equivalencia FULL. */
export type AgentFlowBenchmarkSystem="asen"|"gentle-shell";
export interface AgentFlowBenchmarkObservation{
 readonly system:AgentFlowBenchmarkSystem;
 readonly runId:string;
 readonly commit:string;
 readonly inputDigest:string;
 readonly toolsDigest:string;
 readonly permissionsDigest:string;
 readonly evidenceDigest:string;
 readonly platform:"linux"|"win32"|"darwin";
 readonly modelActual:string;
 readonly thinkingActual:string;
 readonly workerCount:1|2|4;
 readonly durationMs:number;
 readonly totalTokens:number|null;
 readonly costUsd:number|null;
 readonly requirementPassed:boolean;
 readonly escapedCriticalDefects:number;
 readonly providerReceiptObserved:boolean;
}
export interface AgentFlowABComparison{
 readonly status:"blocked"|"ready-for-independent-review";
 readonly blockers:readonly string[];
 readonly measurements:Readonly<{
  durationDifferenceMs:number;
  durationDifferencePercent:number;
  tokensDifference:number|null;
  costDifferenceUsd:number|null;
  asenRequirementPassed:boolean;
  referenceRequirementPassed:boolean;
  asenEscapedCriticalDefects:number;
  referenceEscapedCriticalDefects:number;
 }> | null;
 readonly evidenceClaimOnly:true;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
const digest=/^[0-9a-f]{64}$/u;
const commit=/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const platforms=new Set(["linux","win32","darwin"]);
const valid=(x:AgentFlowBenchmarkObservation):boolean=>!!x&&
 (x.system==="asen"||x.system==="gentle-shell")&&
 typeof x.runId==="string"&&x.runId.length>0&&x.runId.length<=128&&
 /^[\w.-]+$/u.test(x.runId)&&commit.test(x.commit)&&
 [x.inputDigest,x.toolsDigest,x.permissionsDigest,x.evidenceDigest].every(v=>typeof v==="string"&&digest.test(v))&&
 platforms.has(x.platform)&&typeof x.modelActual==="string"&&
 x.modelActual.length>0&&x.modelActual!=="unknown"&&x.modelActual.length<=256&&
 typeof x.thinkingActual==="string"&&x.thinkingActual.length>0&&
 x.thinkingActual!=="unknown"&&x.thinkingActual.length<=64&&
 [1,2,4].includes(x.workerCount)&&
 Number.isSafeInteger(x.durationMs)&&x.durationMs>0&&
 (x.totalTokens===null||(Number.isSafeInteger(x.totalTokens)&&x.totalTokens>=0))&&
 (x.costUsd===null||(Number.isFinite(x.costUsd)&&x.costUsd>=0))&&
 typeof x.requirementPassed==="boolean"&&
 Number.isSafeInteger(x.escapedCriticalDefects)&&x.escapedCriticalDefects>=0&&
 typeof x.providerReceiptObserved==="boolean";

/** Solo calcula diferencias verificables. Se bloquea si cambia el modelo, la
 * plataforma, el alcance, los permisos o las entradas de la comparación. */
export function compareAgentFlowAB(input:{
 readonly asen:AgentFlowBenchmarkObservation;
 readonly reference:AgentFlowBenchmarkObservation;
}):AgentFlowABComparison{
 if(!input||!valid(input.asen)||!valid(input.reference)||
  input.asen.system!=="asen"||input.reference.system!=="gentle-shell")
  throw new Error("Invalid A/B agent-flow observations");
 const {asen,reference}=input,blockers:string[]=[];
 if(asen.runId===reference.runId)blockers.push("Duplicate benchmark run identity");
 for(const key of ["inputDigest","toolsDigest","permissionsDigest","platform",
  "modelActual","thinkingActual","workerCount"] as const)
  if(asen[key]!==reference[key])blockers.push("Incompatible benchmark context: "+key);
 if(!asen.providerReceiptObserved||!reference.providerReceiptObserved)
  blockers.push("Provider receipt was not observed for both runs");
 if(asen.totalTokens===null||reference.totalTokens===null)
  blockers.push("Token consumption is unknown");
 if(asen.escapedCriticalDefects>0||reference.escapedCriticalDefects>0)
  blockers.push("Escaped critical defects require investigation");
 if(!asen.requirementPassed||!reference.requirementPassed)
  blockers.push("A benchmark task did not meet its external requirement");
 const status=blockers.length?"blocked" as const:"ready-for-independent-review" as const;
 const measurements=blockers.length?null:Object.freeze({
  durationDifferenceMs:asen.durationMs-reference.durationMs,
  durationDifferencePercent:Math.round(
   (asen.durationMs-reference.durationMs)/reference.durationMs*10000)/100,
  tokensDifference:asen.totalTokens!==null&&reference.totalTokens!==null?
   asen.totalTokens-reference.totalTokens:null,
  costDifferenceUsd:asen.costUsd!==null&&reference.costUsd!==null?
   Math.round((asen.costUsd-reference.costUsd)*1_000_000)/1_000_000:null,
  asenRequirementPassed:asen.requirementPassed,
  referenceRequirementPassed:reference.requirementPassed,
  asenEscapedCriticalDefects:asen.escapedCriticalDefects,
  referenceEscapedCriticalDefects:reference.escapedCriticalDefects
 });
 return Object.freeze({
  status,blockers:Object.freeze(blockers),measurements,
  evidenceClaimOnly:true as const,acceptance:"not-accepted" as const,
  globalFull:false as const
 });
}
