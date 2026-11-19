import type {PublicAgentRecord} from "./agent-lifecycle.js";

export type AgentTerminalDiagnosisCode=
 "failed-unknown"|"cancelled"|"interrupted"|"completed-without-evidence"|
 "completed-awaiting-review"|"completed-read-only"|"completed-worker-awaiting-review";

export interface AgentTerminalDiagnosis{
 readonly code:AgentTerminalDiagnosisCode;
 readonly action:"inspect-cause"|"stop-on-cancel"|"inspect-recovery"|"inspect-empty-result"|"await-independent-review"|"reconcile-read-only";
 readonly writeAuthority:false;readonly autoRetry:false;readonly autoMerge:false;
}

/** Solo usa estado y rol guardados. Jamás interpreta texto libre de modelo o proveedor
 * como autorización, diagnóstico confirmado de red ni permiso de recuperación. */
export function diagnoseAgentTerminal(record:Pick<PublicAgentRecord,"role"|"state"|"summary">):AgentTerminalDiagnosis{
 if(!record||typeof record!=="object")throw new TypeError("Se necesita un agente terminal comprobado");
 const {role,state,summary}=record;
 const hasOutput=typeof summary==="string"&&summary.trim().length>0;
 let code:AgentTerminalDiagnosisCode,action:AgentTerminalDiagnosis["action"];
 switch(state){
  case "failed":code="failed-unknown";action="inspect-cause";break;
  case "cancelled":code="cancelled";action="stop-on-cancel";break;
  case "interrupted":code="interrupted";action="inspect-recovery";break;
  case "completed":
   if(!hasOutput){code="completed-without-evidence";action="inspect-empty-result";}
   else if(role==="worker"){code="completed-worker-awaiting-review";action="await-independent-review";}
   else if(role==="explorer"){code="completed-read-only";action="reconcile-read-only";}
   else{code="completed-awaiting-review";action="await-independent-review";}
   break;
  default:throw new TypeError("No se puede diagnosticar una tarea que todavía no ha terminado");
 }
 return Object.freeze({code,action,writeAuthority:false as const,autoRetry:false as const,autoMerge:false as const});
}
