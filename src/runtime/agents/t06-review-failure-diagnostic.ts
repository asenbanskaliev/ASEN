/** Diagnóstico ACOTADO del revisor Pi T06.
 * Nunca copia texto del proveedor, prompts, código, secretos ni stderr.
 * Un error de Pi no equivale necesariamente a falta de llamada al modelo. */
export type T06ReviewerFailureCategory=
 |"not-classified"|"pi-timeout"|"pi-exited"|"pi-cancelled"
 |"pi-stream-overflow"|"pi-model-unavailable"|"pi-no-final-settlement"
 |"pi-provider-rejected"|"pi-response-failed"|"pi-unclassified"
 |"pi-process-not-observed"|"pi-model-not-observed"
 |"pi-model-mismatch"|"pi-receipt-invalid"
 |"pi-provider-auth"|"pi-provider-rate-limit"|"pi-provider-quota"
 |"pi-provider-context-length"|"pi-provider-timeout"|"pi-provider-network"
 |"pi-provider-unavailable"|"pi-provider-invalid-request"|"pi-provider-other"
 |"pi-receipt-invalid-json"|"pi-receipt-missing-assistant"
 |"pi-receipt-wrong-files"|"pi-receipt-invalid-schema"
 |"pi-receipt-unsupported-content"|"pi-receipt-truncated"
 |"pi-receipt-multiple-verdicts"|"pi-receipt-terminal-error"
 |"pi-receipt-unfinished"|"pi-receipt-unclassified";
export function classifyT06ReviewerFailure(output:unknown):T06ReviewerFailureCategory{
 if(typeof output!=="string")return "pi-unclassified";
 // Errores terminales ya clasificados por el runner; nunca se copia el texto.
 const terminal=/^pi assistant failed: (auth|rate_limit|quota|context_length|timeout|network|provider_unavailable|invalid_request|unavailable)(?:$| \()/u.exec(output);
 if(terminal){
  const byCategory:Record<string,T06ReviewerFailureCategory>={
   auth:"pi-provider-auth",rate_limit:"pi-provider-rate-limit",
   quota:"pi-provider-quota",context_length:"pi-provider-context-length",
   timeout:"pi-provider-timeout",network:"pi-provider-network",
   provider_unavailable:"pi-provider-unavailable",
   invalid_request:"pi-provider-invalid-request",
   unavailable:"pi-provider-other"
  };
  return byCategory[terminal[1]!]??"pi-unclassified";
 }

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

/** Se clasifican únicamente mensajes internos conocidos de nuestro validador.
 * No conservar ni imprimir JSON, texto original del revisor o claves. */
export function classifyT06ReviewReceiptError(error:unknown):T06ReviewerFailureCategory{
 const reason=error instanceof Error?error.message:"";
 const fixed:Record<string,T06ReviewerFailureCategory>={
  "T06 independent reviewer did not return strict JSON":"pi-receipt-invalid-json",
  "T06 independent Pi review stream is invalid":"pi-receipt-invalid-json",
  "T06 independent review requires exactly one final assistant verdict":"pi-receipt-unfinished",
  "T06 independent review has multiple completed assistant verdicts":"pi-receipt-multiple-verdicts",
  "T06 independent review was truncated":"pi-receipt-truncated",
  "T06 independent review ended with assistant error":"pi-receipt-terminal-error",
  "T06 independent review did not finish successfully":"pi-receipt-unfinished",
  "T06 independent Pi review returned no assistant message":"pi-receipt-missing-assistant",
  "T06 independent reviewer inspected wrong files or SHA":"pi-receipt-wrong-files",
  "T06 independent reviewer omitted a candidate file":"pi-receipt-wrong-files",
  "T06 independent reviewer returned malformed verdict":"pi-receipt-invalid-schema",
  "T06 independent reviewer returned invalid finding":"pi-receipt-invalid-schema",
  "T06 independent review verdict contradicts its findings":"pi-receipt-invalid-schema",
  "T06 independent reviewer returned unsupported content":"pi-receipt-unsupported-content",
  "T06 independent review cannot include any tool execution":"pi-receipt-invalid-schema",
  "T06 independent review has no bounded candidate evidence":"pi-receipt-invalid-schema",
 };
 return fixed[reason]??"pi-receipt-unclassified";
}
