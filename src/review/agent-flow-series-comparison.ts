/** E4: comparación repetible de tres encargos con tres repeticiones cada uno.
 * Una tabla observada NO valida la procedencia de los recibos ni aprueba
 * cambios. La autenticidad se exige al sistema que captura cada ejecución. */
import {compareAgentFlowAB,type AgentFlowBenchmarkObservation} from "./agent-flow-ab-comparison.js";

export type AgentFlowScenario="directo"|"investigacion"|"varias-unidades";
export interface AgentFlowSeriesPair{
 readonly scenario:AgentFlowScenario;
 readonly repetition:1|2|3;
 readonly asen:AgentFlowBenchmarkObservation;
 readonly reference:AgentFlowBenchmarkObservation;
}
export interface AgentFlowScenarioMeasurements{
 readonly scenario:AgentFlowScenario;
 readonly repetitions:3;
 readonly asenMeanDurationMs:number;
 readonly referenceMeanDurationMs:number;
 readonly durationDifferencePercent:number;
 readonly asenTotalTokens:number|null;
 readonly referenceTotalTokens:number|null;
 readonly asenTotalCostUsd:number|null;
 readonly referenceTotalCostUsd:number|null;
}
export interface AgentFlowSeriesComparison{
 readonly status:"blocked"|"ready-for-independent-review";
 readonly blockers:readonly string[];
 readonly measurements:readonly AgentFlowScenarioMeasurements[];
 readonly runsObserved:number;
 readonly expectedRuns:18;
 readonly evidenceClaimOnly:true;
 readonly acceptance:"not-accepted";
 readonly globalFull:false;
}
const scenarios=["directo","investigacion","varias-unidades"] as const;
const rounds=[1,2,3] as const;
const round=(value:number)=>Math.round(value*100)/100;
const total=(values:readonly (number|null)[]):number|null=>
 values.every(value=>value!==null)?values.reduce<number>((sum,value)=>sum+(value??0),0):null;

/** Los pares deben provenir de resultados autenticados por separado.
 * Repeticiones, modelos, permisos y plataforma deben ser comparables.
 * No rellena consumos que el proveedor no haya comunicado. */
export function compareAgentFlowSeries(pairs:readonly AgentFlowSeriesPair[]):AgentFlowSeriesComparison{
 if(!Array.isArray(pairs))throw new TypeError("Expected an array of measured scenario pairs");
 const blockers:string[]=[],out:AgentFlowScenarioMeasurements[]=[];
 const seenRuns=new Set<string>(),seenEvidence=new Set<string>();
 const stable=new Map<string,Readonly<{commit:string;platform:string;modelActual:string;thinkingActual:string;toolsDigest:string;permissionsDigest:string;workerCount:number}>>();
 const inputs=new Map<string,string>();
 if(pairs.length!==9)blockers.push("Exactly nine scenario pairs (18 authenticated executions) are required");
 for(const scenario of scenarios){
  const records:AgentFlowSeriesPair[]=pairs.filter(pair=>pair?.scenario===scenario);
  const repetitions=new Set<number>(),success:AgentFlowSeriesPair[]=[];
  for(const pair of records){
   if(!rounds.includes(pair.repetition))throw new TypeError("Invalid scenario repetition");
   if(repetitions.has(pair.repetition)){blockers.push("Duplicate repetition for "+scenario);continue;}
   repetitions.add(pair.repetition);
   const evidence=compareAgentFlowAB({asen:pair.asen,reference:pair.reference});
   for(const message of evidence.blockers)blockers.push(scenario+" #"+pair.repetition+": "+message);
   for(const sample of [pair.asen,pair.reference]){
    const unique=sample.system+":"+sample.runId;
    if(seenRuns.has(unique))blockers.push("Repeated process receipt: "+unique);
    seenRuns.add(unique);
    if(seenEvidence.has(sample.evidenceDigest))blockers.push("Repeated evidence digest in measured runs");
    seenEvidence.add(sample.evidenceDigest);
    const baseline=stable.get(scenario+":"+sample.system);
    const current={commit:sample.commit,platform:sample.platform,modelActual:sample.modelActual,
     thinkingActual:sample.thinkingActual,toolsDigest:sample.toolsDigest,
     permissionsDigest:sample.permissionsDigest,workerCount:sample.workerCount};
    if(baseline&&JSON.stringify(baseline)!==JSON.stringify(current))
     blockers.push("The execution setup changed for "+sample.system);
    stable.set(scenario+":"+sample.system,current);
   }
   const previousInput=inputs.get(scenario);
   if(previousInput&&previousInput!==pair.asen.inputDigest)
    blockers.push("Scenario inputs changed across repetitions: "+scenario);
   inputs.set(scenario,pair.asen.inputDigest);
   if(evidence.status==="ready-for-independent-review")success.push(pair);
  }
  if(repetitions.size!==3||rounds.some(n=>!repetitions.has(n)))
   blockers.push("Missing repetitions for "+scenario);
  if(success.length===3&&repetitions.size===3){
   const asenTime=success.reduce((sum,pair)=>sum+pair.asen.durationMs,0)/3;
   const referenceTime=success.reduce((sum,pair)=>sum+pair.reference.durationMs,0)/3;
   out.push(Object.freeze({
    scenario,repetitions:3 as const,
    asenMeanDurationMs:round(asenTime),
    referenceMeanDurationMs:round(referenceTime),
    durationDifferencePercent:round((asenTime-referenceTime)/referenceTime*100),
    asenTotalTokens:total(success.map(pair=>pair.asen.totalTokens)),
    referenceTotalTokens:total(success.map(pair=>pair.reference.totalTokens)),
    asenTotalCostUsd:total(success.map(pair=>pair.asen.costUsd)),
    referenceTotalCostUsd:total(success.map(pair=>pair.reference.costUsd)),
   }));
  }
 }
 const digestGroups=[...inputs.entries()];
 if(digestGroups.length===3&&new Set(digestGroups.map(([,digest])=>digest)).size!==3)
  blockers.push("The three scenarios do not have distinct input digests");
 for(const sample of pairs)if(!scenarios.includes(sample?.scenario))
  throw new TypeError("Unknown scenario in measured series");
 return Object.freeze({
  status:blockers.length?"blocked" as const:"ready-for-independent-review" as const,
  blockers:Object.freeze(blockers),
  measurements:Object.freeze(out),
  runsObserved:seenRuns.size,
  expectedRuns:18 as const,
  evidenceClaimOnly:true as const,
  acceptance:"not-accepted" as const,
  globalFull:false as const,
 });
}
