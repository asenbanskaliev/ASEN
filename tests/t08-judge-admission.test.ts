import test from "node:test";
import assert from "node:assert/strict";
import {classifyT08JudgeAdmission} from "../src/runtime/agents/t08-judge-admission.js";
const base={cancelled:false,ok:true,runnerOutput:"",processObserved:true,
 observedModel:"nvidia/modelo-1",requestedModel:"nvidia/modelo-1",toolEvents:0};
test("T08 distingue paso exacto que falla sin ejecutar ningún modelo",()=>{
 assert.equal(classifyT08JudgeAdmission(base),"verified");
 assert.equal(classifyT08JudgeAdmission({...base,cancelled:true}),"judge-cancelled");
 assert.equal(classifyT08JudgeAdmission({...base,processObserved:false}),"judge-process-not-observed");
 assert.equal(classifyT08JudgeAdmission({...base,observedModel:"unknown"}),"judge-model-not-observed");
 assert.equal(classifyT08JudgeAdmission({...base,observedModel:"nvidia/modelo-2"}),"judge-model-mismatch");
 assert.equal(classifyT08JudgeAdmission({...base,toolEvents:1}),"judge-tool-execution-observed");
});
test("T08 diferencia rechazo del proveedor sin copiar errores sensibles",()=>{
 const output="pi assistant failed: invalid_request (Bearer SECRETO)";
 const result=classifyT08JudgeAdmission({...base,ok:false,runnerOutput:output});
 assert.equal(result,"judge-runner-pi-provider-invalid-request");
 assert.ok(!result.includes("SECRETO"));
 assert.equal(classifyT08JudgeAdmission({...base,ok:false,runnerOutput:"CLAVE_PRIVADA"}),"judge-runner-pi-unclassified");
});
