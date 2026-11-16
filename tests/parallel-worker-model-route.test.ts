import test from "node:test";
import assert from "node:assert/strict";
import {inspectPlannedWorkerModelRoute} from "../src/runtime/agents/parallel-worker-model-route.js";

test("T05 una ruta concreta NVIDIA no demuestra autenticación, uso, gratuidad ni permisos",()=>{
 const result=inspectPlannedWorkerModelRoute("nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(result.status,"pinned");
 assert.equal(result.requested,"nvidia/nemotron-3.5-lightning-30b-a3b");
 assert.equal(result.selectedActual,"unknown");
 assert.equal(result.modelConsumedProven,false);
 assert.equal(result.providerAuthenticated,false);
 assert.equal(result.costVerified,false);
 assert.equal(result.paidModelApproved,false);
 assert.deepEqual(result.blockers,[]);
});
test("T05 bloquea modelo de proveedor por defecto, ausente, ambiguo o malformado",()=>{
 for(const value of [undefined,null,"", "unknown","default","nvidia", "nvidia/",
  "/modelo","nvidia//modelo","nvidia/modelo//otro","nvidia/default","nvidia/unknown","nvidia/auto",
  "nvidia/../otro","nvidia/./otro","nvidia/modelo mal formado",
  "nvidia/modelo\nMALICIOSO"," nvidia/modelo","nvidia/modelo " ]){
  const result=inspectPlannedWorkerModelRoute(value);
  assert.equal(result.status,"blocked",String(value));
  assert.equal(result.requested,"unknown");
  assert.equal(result.selectedActual,"unknown");
  assert.equal(result.costVerified,false);
  assert.equal(result.paidModelApproved,false);
  assert.ok(result.blockers.length);
 }
});
test("T05 un modelo solicitado de pago tampoco autoriza gastos",()=>{
 const result=inspectPlannedWorkerModelRoute("otro-proveedor/modelo-de-pago");
 assert.equal(result.status,"pinned","Sintaxis válida no significa precio permitido");
 assert.equal(result.providerAuthenticated,false);
 assert.equal(result.costVerified,false);
 assert.equal(result.paidModelApproved,false);
 assert.equal(result.modelConsumedProven,false);
});
