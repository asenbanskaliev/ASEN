/** T09: serie A/B 1, 2 y 4 Workers con recibos separados.
 * No genera evidencias, no ejecuta modelos y no acepta cambios. */
import {
 compareAgentFlowAB,
 type AgentFlowBenchmarkObservation,
 type AgentFlowABComparison
} from "./agent-flow-ab-comparison.js";

export interface AgentFlowABSeries{
 readonly status:"blocked"|"ready-for-independent-review";
 readonly blockers:readonly string[];
 readonly pairs:readonly Readonly<{workers:1|2|4;comparison:AgentFlowABComparison}>[];
 readonly scaling:readonly Readonly<{
  workers:2|4;asenSpeedup:number;referenceSpeedup:number;
  asenEfficiency:number;referenceEfficiency:number;
 }>[]|null;
 readonly costConclusion:"unknown-without-billing-verification";
 readonly evidenceClaimOnly:true;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
const counts=[1,2,4] as const;
const common=["inputDigest","toolsDigest","permissionsDigest",
 "platform","modelActual","thinkingActual","commit"] as const;
const round=(n:number)=>Math.round(n*1000)/1000;

/** Seis ejecuciones, una por sistema y grado de paralelismo.
 * Las observaciones son declaraciones: un auditor debe verificar sus pruebas. */
export function compareAgentFlowABSeries(
 observations:readonly AgentFlowBenchmarkObservation[]
):AgentFlowABSeries{
 if(!Array.isArray(observations)||observations.length!==6)
  throw new Error("T09 requires exactly six recorded A/B observations");
 const byKey=new Map<string,AgentFlowBenchmarkObservation>();
 for(const row of observations){
  if(!row||!["asen","reference"].includes(row.system)||
   !counts.includes(row.workerCount))
   throw new Error("Invalid T09 series observation identity");
  const key=row.system+":"+row.workerCount;
  if(byKey.has(key))throw new Error("Duplicate T09 system/worker-count observation");
  byKey.set(key,row);
 }
 const blockers:string[]=[];
 const ids=observations.map(row=>row.runId);
 const receipts=observations.map(row=>row.evidenceDigest);
 if(new Set(ids).size!==6)blockers.push("Run identities are reused between measurements");
 if(new Set(receipts).size!==6)blockers.push("Evidence digests are reused between measurements");
 for(const system of ["asen","reference"] as const){
  const baseline=byKey.get(system+":1")!;
  for(const workers of [2,4] as const){
   const current=byKey.get(system+":"+workers)!;
   for(const field of common)
    if(current[field]!==baseline[field])
     blockers.push("Incompatible cross-count context: "+system+":"+field+":"+workers);
  }
 }
 const pairs=counts.map(workers=>{
  const comparison=compareAgentFlowAB({
   asen:byKey.get("asen:"+workers)!,
   reference:byKey.get("reference:"+workers)!
  });
  for(const blocker of comparison.blockers)
   blockers.push("Worker count "+workers+": "+blocker);
  return Object.freeze({workers,comparison});
 });
 const status=blockers.length?"blocked" as const:"ready-for-independent-review" as const;
 const scaling=status==="blocked"?null:Object.freeze(([2,4] as const).map(workers=>{
  const asenBase=byKey.get("asen:1")!.durationMs;
  const referenceBase=byKey.get("reference:1")!.durationMs;
  const asenTime=byKey.get("asen:"+workers)!.durationMs;
  const referenceTime=byKey.get("reference:"+workers)!.durationMs;
  return Object.freeze({
   workers,asenSpeedup:round(asenBase/asenTime),
   referenceSpeedup:round(referenceBase/referenceTime),
   asenEfficiency:round(asenBase/asenTime/workers),
   referenceEfficiency:round(referenceBase/referenceTime/workers)
  });
 }));
 return Object.freeze({
  status,blockers:Object.freeze(blockers),pairs:Object.freeze(pairs),
  scaling,costConclusion:"unknown-without-billing-verification" as const,
  evidenceClaimOnly:true as const,acceptance:"not-accepted" as const,
  globalFull:false as const
 });
}
