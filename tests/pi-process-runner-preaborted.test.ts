import assert from "node:assert/strict";
import test from "node:test";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createPiRpcFixture} from "./helpers/pi-rpc-fixture.js";

test("T01/T02: una cancelación previa nunca inicia Pi ni consume el proveedor",async t=>{
 const fixture=await createPiRpcFixture(t,"process.stdin.resume();");
 for(const origen of ["señal de tarea","señal del ejecutor"] as const){
  const cancellation=new AbortController();
  cancellation.abort();
  let procesosIniciados=0;
  const runner=new PiProcessRunner({
   command:process.execPath,rpcArgs:[],extraArgs:[fixture.pi],noTools:true,
   timeoutMs:3_000,
   ...(origen==="señal del ejecutor"?{signal:cancellation.signal}:{}),
   onProcessStart:()=>{procesosIniciados++;}
  });
  const resultado=await runner.run({
   id:"cancelada-"+origen,role:"explorer",prompt:"No ejecutar",
   repository:fixture.repository
  },origen==="señal de tarea"?cancellation.signal:undefined);
  assert.equal(resultado.ok,false);
  assert.match(resultado.output,/cancelled/u);
  assert.equal(procesosIniciados,0,
   origen+": no debe iniciarse Pi al recibir una señal ya cancelada");
 }
});
