import test from "node:test";
import assert from "node:assert/strict";
import {summarizePiInvalidRequest} from "../src/runtime/agents/pi-provider-request-diagnostic.js";

test("T06 identifica el parámetro rechazado sin reproducir texto del proveedor",()=>{
 const facts=summarizePiInvalidRequest({
  stopReason:"error",
  errorMessage:"HTTP 400 invalid request: unsupported parameter max_tokens. Bearer CLAVE_PRIVADA_123"
 });
 assert.deepEqual(facts,{
  providerCategory:"invalid_request",rejectedParameter:"max_tokens",httpStatus:400
 });
 assert.ok(!JSON.stringify(facts).includes("CLAVE_PRIVADA"));
});
test("T06 usa campos estructurados sin incorporar valores desconocidos",()=>{
 assert.deepEqual(summarizePiInvalidRequest({
  stopReason:"error",errorMessage:"Bad request",
  diagnostics:[{error:{code:400,param:"temperature",status:400}}]
 }),{
  providerCategory:"invalid_request",rejectedParameter:"temperature",httpStatus:400
 });
 const bad=summarizePiInvalidRequest({
  stopReason:"error",errorMessage:"HTTP 422 bad request param: 'SECRETO_QUE_NO_DEBE_SALIR'"
 });
 assert.equal(bad?.rejectedParameter,"unknown");
 assert.ok(!JSON.stringify(bad).includes("SECRETO_QUE_NO_DEBE_SALIR"));
});
test("T06 no crea diagnóstico de proveedor cuando no hay error",()=>{
 assert.equal(summarizePiInvalidRequest({stopReason:"stop",errorMessage:"parameter max_tokens"}),null);
 assert.equal(summarizePiInvalidRequest("CLAVE PRIVADA"),null);
 assert.equal(summarizePiInvalidRequest(null),null);
});
