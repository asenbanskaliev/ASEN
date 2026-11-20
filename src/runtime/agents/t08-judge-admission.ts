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
 if(!facts.ok)return "judge-runner-"+classifyT06ReviewerFailure(facts.runnerOutput);
 if(!facts.processObserved)return "judge-process-not-observed";
 if(facts.observedModel==="unknown")return "judge-model-not-observed";
 if(facts.observedModel!==facts.requestedModel)return "judge-model-mismatch";
 if(facts.toolEvents!==0)return "judge-tool-execution-observed";
 return "verified";
}
