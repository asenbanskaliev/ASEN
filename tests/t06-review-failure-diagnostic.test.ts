import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyT06ReviewerFailure,classifyT06ReviewReceiptError} from
 "../src/runtime/agents/t06-review-failure-diagnostic.js";

test("T06 distingue agotamiento de tiempo, salida de Pi y cierre sin modelo",()=>{
 assert.equal(classifyT06ReviewerFailure("pi process timed out after 180000ms (phase: turn)"),"pi-timeout");
 assert.equal(classifyT06ReviewerFailure("pi process timed out after 180000ms (phase: preflight)"),"pi-timeout");
 assert.equal(classifyT06ReviewerFailure("pi process exited with code 1 (phase: preflight; signal: none; stderr-present: true)"),"pi-exited");
 assert.equal(classifyT06ReviewerFailure("pi process cancelled"),"pi-cancelled");
 assert.equal(classifyT06ReviewerFailure("pi stream exceeded 512000 bytes"),"pi-stream-overflow");
 assert.equal(classifyT06ReviewerFailure("pi failed to reach agent_settled"),"pi-no-final-settlement");
});
test("T06 jamás guarda salida original del proveedor o secretos como diagnóstico",()=>{
 const values=[
  "Bearer sk-privada-muy-secreta",
  "NVIDIA_API_KEY=privada",
  "pi process timed out after 180000ms (phase: turn) Bearer secreta",
  "error 429 with prompt user input",
  null,{},["privado"],""
 ];
 for(const value of values)assert.equal(classifyT06ReviewerFailure(value),"pi-unclassified");
});
test("T06 conserva si Pi arrancó y si reconoció un modelo, sin inventar observaciones",()=>{
 const code=readFileSync(new URL("../scripts/t06-native-independent-review.ts",import.meta.url),"utf8");
 assert.match(code,/attempts\[index\]!\.processObserved=true/u);
 assert.match(code,/attempts\[index\]!\.observedModel=observedModel/u);
 assert.match(code,/attempts\[index\]!\.failureCategory=classifyT06ReviewerFailure\(result\.output\)/u);
 assert.match(code,/piProcessObserved:attempts\[i\]!\.processObserved/u);
 assert.match(code,/failureCategory:attempts\[i\]!\.failureCategory/u);
 assert.match(code,/noTools:true,requireFinalSettlement:true/u);
 assert.doesNotMatch(code,/output:result\.output|stderr:process\.stderr/u);
});

test("T06 identifica causas terminales conocidas del modelo sin copiar el mensaje",()=>{
 const categories=[
  ["auth","pi-provider-auth"],["rate_limit","pi-provider-rate-limit"],
  ["quota","pi-provider-quota"],["context_length","pi-provider-context-length"],
  ["timeout","pi-provider-timeout"],["network","pi-provider-network"],
  ["provider_unavailable","pi-provider-unavailable"],
  ["invalid_request","pi-provider-invalid-request"],["unavailable","pi-provider-other"]
 ] as const;
 for(const [code,expected] of categories){
  assert.equal(classifyT06ReviewerFailure("pi assistant failed: "+code),expected);
  assert.equal(classifyT06ReviewerFailure("pi assistant failed: "+code+" (RPC failure hidden)"),expected);
 }
 assert.equal(classifyT06ReviewerFailure("pi assistant failed: secret Bearer sk-test"),"pi-unclassified");
 assert.equal(classifyT06ReviewerFailure("pi assistant failed: rate_limit-secret Bearer sk-test"),"pi-unclassified");
});
test("T06 clasifica fallos de recibo por mensajes internos seguros, no por salida del proveedor",()=>{
 const cases=[
  ["T06 independent reviewer did not return strict JSON","pi-receipt-invalid-json"],
  ["T06 independent Pi review stream is invalid","pi-receipt-invalid-json"],
  ["T06 independent review requires exactly one final assistant verdict","pi-receipt-unfinished"],
  ["T06 independent reviewer inspected wrong files or SHA","pi-receipt-wrong-files"],
  ["T06 independent reviewer returned malformed verdict","pi-receipt-invalid-schema"],
  ["T06 independent reviewer returned unsupported content","pi-receipt-unsupported-content"]
 ] as const;
 for(const [reason,expected] of cases)
  assert.equal(classifyT06ReviewReceiptError(new Error(reason)),expected);
 for(const bad of [
  new Error("NVIDIA key sk-secret missing"),new Error("T06 independent reviewer did not return strict JSON: sensitive"),
  "Bearer sk-secret",null,{},new Error("unknown")
 ])assert.equal(classifyT06ReviewReceiptError(bad),"pi-receipt-unclassified");
});

test("T06 solicita huellas SHA reales y no usa valores de ejemplo ambiguos",()=>{
 const source=readFileSync(new URL("../scripts/t06-native-independent-review.ts",import.meta.url),"utf8");
 assert.match(source,/JSON\.stringify\(evidence\.map\(\(\{path,sha256\}\)=>\(\{path,sha256\}\)\)\)/u);
 assert.match(source,/exactamente pass o fail/u);
 assert.match(source,/sin bloques Markdown ni texto exterior/u);
 assert.doesNotMatch(source,/"sha256":"HASH"/u);
 assert.doesNotMatch(source,/'\{"verdict":"pass\|fail"/u);
 assert.match(source,/no significa aprobar su contenido/u);
});

test("T06 diferencia finales recortados, errores terminales y duplicados sin exponer texto",()=>{
 const cases=[
  ["T06 independent review was truncated","pi-receipt-truncated"],
  ["T06 independent review ended with assistant error","pi-receipt-terminal-error"],
  ["T06 independent review has multiple completed assistant verdicts","pi-receipt-multiple-verdicts"],
  ["T06 independent review did not finish successfully","pi-receipt-unfinished"],
  ["T06 independent Pi review returned no assistant message","pi-receipt-missing-assistant"]
 ] as const;
 for(const [message,category] of cases)
  assert.equal(classifyT06ReviewReceiptError(new Error(message)),category);
 const confidential="T06 independent review was truncated NVIDIA_API_KEY=secreta";
 assert.equal(classifyT06ReviewReceiptError(new Error(confidential)), "pi-receipt-unclassified");
});
