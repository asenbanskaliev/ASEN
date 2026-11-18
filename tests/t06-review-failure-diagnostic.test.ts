import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyT06ReviewerFailure} from
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
