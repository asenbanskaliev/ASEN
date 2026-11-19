import assert from "node:assert/strict";
import test from "node:test";
import {PlanAdvanceQueue} from "../src/runtime/lifecycle/plan-advance-queue.js";

test("E2B: un aviso durante el avance se conserva y se despierta al liberar el plan",async()=>{
 const queue=new PlanAdvanceQueue();
 const key="sesion-uno\0proyecto-uno",signals:string[]=[];
 assert.equal(queue.enter(key),true);
 assert.equal(queue.enter(key,"todo-bloqueado"),false);
 assert.equal(queue.enter(key,"todo-bloqueado"),false,"el mismo aviso se agrupa sin duplicarlo");
 assert.equal(queue.enter(key,undefined),false,"un final sin bloqueo también se conserva");
 const awaiting=queue.release(key);
 assert.deepEqual(awaiting,["todo-bloqueado",undefined]);
 assert.ok(Object.isFrozen(awaiting));
 for(const signal of awaiting){
  assert.equal(queue.enter(key,signal),true);
  signals.push(signal??"finalización");
  assert.deepEqual(queue.release(key),[]);
 }
 assert.deepEqual(signals,["todo-bloqueado","finalización"]);
 assert.equal(queue.enter(key),true,"otro turno no queda bloqueado");
 assert.deepEqual(queue.release(key),[]);
});

test("E2B: las señales de otra sesión jamás se mezclan",()=>{
 const queue=new PlanAdvanceQueue(),a="sesion-a\0proyecto",b="sesion-b\0proyecto",c="sesion-a\0otro-proyecto";
 assert.equal(queue.enter(a),true);
 assert.equal(queue.enter(b),true);
 assert.equal(queue.enter(c),true);
 assert.equal(queue.enter(a,"bloqueo-a"),false);
 assert.equal(queue.enter(b,"bloqueo-b"),false);
 assert.deepEqual(queue.release(a),["bloqueo-a"]);
 assert.deepEqual(queue.release(c),[]);
 assert.deepEqual(queue.release(b),["bloqueo-b"]);
});

test("E2B: el diario de avisos no concede permiso ni permite reabrir dos veces un avance",()=>{
 const queue=new PlanAdvanceQueue(),key="sesion\0proyecto";
 assert.equal(queue.enter(key),true);
 assert.equal(queue.enter(key,"writer-pendiente"),false);
 assert.throws(()=>queue.enter("sin-identidad"),/sesión y proyecto exactos/u);
 assert.deepEqual(queue.release(key),["writer-pendiente"]);
 assert.throws(()=>queue.release(key),/No existe avance activo/u);
 // Es una señal; antes de cualquier lanzamiento hay que volver a leer el Todo,
 // comprobar su identidad y solicitar la autorización Writer.
 assert.equal(Object.hasOwn(queue,"writerAdmission"),false);
 assert.equal(Object.hasOwn(queue,"autoApprove"),false);
});
