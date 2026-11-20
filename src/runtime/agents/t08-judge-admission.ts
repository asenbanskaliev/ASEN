/** Diagnóstico seguro por etapas del juez T08, sin texto privado del proveedor. */
import {classifyT06ReviewerFailure} from "./t06-review-failure-diagnostic.js";
export interface T08JudgeAdmissionFacts {
 readonly cancelled:boolean;
 readonly ok:boolean;
 readonly runnerOutput:unknown;
 readonly processObserved:boolean;
 readonly observedModel:string;
 readonly requestedModel:string;
 readonly toolEvents:number;
}
export function classifyT08JudgeAdmission(facts:T08JudgeAdmissionFacts):string{
 if(facts.cancelled)return "judge-cancelled";
 if(!facts.ok){
  const classified=classifyT06ReviewerFailure(facts.runnerOutput);
  if(classified!=="pi-unclassified")return "judge-runner-"+classified;
  const raw=typeof facts.runnerOutput==="string"?facts.runnerOutput:"";
  const internalChecks:ReadonlyArray<readonly [string,RegExp]>=[
   ["model-preflight",/^Pi model preflight requires a selected model and an identified child observer$/u],
   ["model-selection",/^Pi child model selection was not confirmed before prompt$/u],
   ["policy-extension",/^pi ASEN policy extension was not (?:loaded|confirmed)$/u],
   ["policy-integrity",/^pi authority extension (?:integrity check|preparation) failed:/u],
   ["settlement-incomplete",/^pi (?:child exited before final agent_settled|agent_settled without a completed final assistant turn)/u],
   ["settlement-aborted",/^pi agent_settled reported an aborted run$/u],
   ["rpc-response",/^pi (?:correlated response (?:missing|failed)|requires exactly one correlated response|response envelope invalid)$/u],
   ["runtime-version",/^Pi runtime .* is not compatible;/u],
   ["process-start",/^pi process failed to start:/u],
   ["process-error",/^pi process error:/u],
   ["tool-attempt",/^pi model attempted a tool while tools were disabled$/u],
   ["skill-selection",/^pi native Skill paths do not match ASEN selection$/u]
  ];
  for(const [name,pattern] of internalChecks)
   if(pattern.test(raw))return "judge-runner-"+name;
  return "judge-runner-pi-unclassified";
 }
 if(!facts.processObserved)return "judge-process-not-observed";
 if(facts.observedModel==="unknown")return "judge-model-not-observed";
 if(facts.observedModel!==facts.requestedModel)return "judge-model-mismatch";
 if(facts.toolEvents!==0)return "judge-tool-execution-observed";
 return "verified";
}
