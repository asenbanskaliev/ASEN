/** T06 — Evaluación estricta de un Writer Pi. No usa respuestas del modelo
 * como prueba de escritura; exige eventos de herramienta, archivo y atribución.
 * Las causas son códigos cerrados, sin respuestas, secretos o código generado. */
export interface T06ObservedToolEvent{
 readonly type:"tool_execution_start"|"tool_execution_end";
 readonly name?:string;
 readonly id?:string;
 readonly error?:boolean;
}
export interface T06WriterEvidenceInput{
 readonly events:readonly T06ObservedToolEvent[];
 readonly requestedModel:string;
 readonly observedModel:string|null;
 readonly processObserved:boolean;
 readonly nativeResultOk:boolean;
 readonly exactScope:boolean;
 readonly syntaxOk:boolean;
 readonly behaviorOk:boolean;
 readonly attributionVerified:boolean;
}
export type T06WriterBlocker=
 "pi-process-unobserved"|"pi-run-failed"|"model-unverified"|
 "write-not-requested"|"write-tool-unconfirmed"|"write-tool-rejected"|
 "multiple-write-requests"|"unexpected-edit-call"|
 "workspace-attribution-missing"|"unexpected-git-changes"|
 "invalid-writer-syntax"|"behavior-tests-failed";
export interface T06WriterEvidenceAssessment{
 readonly passed:boolean;
 readonly writeToolObserved:boolean;
 readonly writeStarts:number;
 readonly writeSuccesses:number;
 readonly writeFailures:number;
 readonly blockers:readonly T06WriterBlocker[];
}
export function assessT06WriterEvidence(input:T06WriterEvidenceInput):T06WriterEvidenceAssessment{
 const events=Array.isArray(input?.events)?input.events:[];
 const starts=events.filter(e=>e?.type==="tool_execution_start"&&e.name==="write");
 const successes=events.filter(e=>e?.type==="tool_execution_end"&&e.name==="write"&&e.error===false);
 const failures=events.filter(e=>e?.type==="tool_execution_end"&&e.name==="write"&&e.error===true);
 const exactWrite=starts.length===1&&successes.length===1&&failures.length===0&&
  typeof starts[0]!.id==="string"&&starts[0]!.id.length>0&&
  starts[0]!.id===successes[0]!.id;
 const blockers:T06WriterBlocker[]=[];
 if(!input?.processObserved)blockers.push("pi-process-unobserved");
 if(!input?.nativeResultOk)blockers.push("pi-run-failed");
 if(!input?.observedModel||input.observedModel!==input.requestedModel)
  blockers.push("model-unverified");
 if(starts.length===0)blockers.push("write-not-requested");
 if(starts.length>1)blockers.push("multiple-write-requests");
 if(failures.length>0)blockers.push("write-tool-rejected");
 if(starts.length>0&&!exactWrite)blockers.push("write-tool-unconfirmed");
 if(events.some(e=>e?.type==="tool_execution_start"&&e.name==="edit"))
  blockers.push("unexpected-edit-call");
 if(!input?.attributionVerified)blockers.push("workspace-attribution-missing");
 if(!input?.exactScope)blockers.push("unexpected-git-changes");
 if(!input?.syntaxOk)blockers.push("invalid-writer-syntax");
 if(!input?.behaviorOk)blockers.push("behavior-tests-failed");
 return Object.freeze({
  passed:blockers.length===0,writeToolObserved:exactWrite,
  writeStarts:starts.length,writeSuccesses:successes.length,
  writeFailures:failures.length,blockers:Object.freeze(blockers)
 });
}
