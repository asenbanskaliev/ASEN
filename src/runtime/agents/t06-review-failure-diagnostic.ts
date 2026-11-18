/** Diagnóstico ACOTADO del revisor Pi T06.
 * Nunca copia texto del proveedor, prompts, código, secretos ni stderr.
 * Un error de Pi no equivale necesariamente a falta de llamada al modelo. */
export type T06ReviewerFailureCategory=
 |"not-classified"|"pi-timeout"|"pi-exited"|"pi-cancelled"
 |"pi-stream-overflow"|"pi-model-unavailable"|"pi-no-final-settlement"
 |"pi-provider-rejected"|"pi-response-failed"|"pi-unclassified"
 |"pi-process-not-observed"|"pi-model-not-observed"
 |"pi-model-mismatch"|"pi-receipt-invalid";
export function classifyT06ReviewerFailure(output:unknown):T06ReviewerFailureCategory{
 if(typeof output!=="string")return "pi-unclassified";
 // Solo patrones de errores propios de ASEN/Pi, jamás el mensaje original.
 if(/^pi process timed out after \d+ms \(phase: (spawn|preflight|turn)\)$/u.test(output))
  return "pi-timeout";
 if(/^pi process exited with code [0-9]+/u.test(output))
  return "pi-exited";
 if(output==="pi process cancelled")return "pi-cancelled";
 if(/^pi stream exceeded \d+ bytes$/u.test(output))
  return "pi-stream-overflow";
 if(/^(?:Pi|pi) .*(?:model.*(?:unavailable|not found)|unknown model)/u.test(output))
  return "pi-model-unavailable";
 if(/^(?:Pi|pi) .*?(?:settlement|agent_settled)/u.test(output))
  return "pi-no-final-settlement";
 if(/^(?:Pi|pi) .*?(?:provider.*(?:error|rejected)|rate limit)/u.test(output))
  return "pi-provider-rejected";
 if(/^(?:Pi|pi) .*?(?:prompt.*failed|response.*failed)/u.test(output))
  return "pi-response-failed";
 return "pi-unclassified";
}
