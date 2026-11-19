import assert from "node:assert/strict";
import test from "node:test";
import {DelegationTurnLatch} from "../src/runtime/lifecycle/delegation-turn-latch.js";
import type {DelegationMode} from "../src/runtime/lifecycle/profiles.js";

const owner={sessionId:"sesion-1",projectId:"/proyecto/principal"};
const verify=async()=>{};

test("E1B: un perfil cambia solo al siguiente turno y lecturas simultáneas comparten la misma decisión",async()=>{
 const latch=new DelegationTurnLatch();
 assert.equal(latch.epoch,0,"La sesión comienza sin cambios de turno");
 let mode:DelegationMode="full-delegation",loads=0;
 const read=()=>latch.mode(owner,async()=>{loads++;return mode;},verify);
 const values=await Promise.all([read(),read(),read()]);
 assert.deepEqual(values,["full-delegation","full-delegation","full-delegation"]);
 assert.equal(loads,1,"la elección de perfil se lee una sola vez por turno");
 mode="organic";
 assert.equal(await read(),"full-delegation","no se relajan permisos a mitad del turno");
 latch.nextTurn();
 assert.equal(latch.epoch,1,"El nuevo turno invalida también las herramientas pendientes");
 assert.equal(await read(),"organic");
 assert.equal(loads,2);
});

test("E1B: otro proyecto o sesión nunca reutiliza el modo guardado",async()=>{
 const latch=new DelegationTurnLatch();
 const first=await latch.mode(owner,async()=>"full-delegation",verify);
 const second=await latch.mode({...owner,sessionId:"otra-sesion"},async()=>"organic",verify);
 const third=await latch.mode({...owner,projectId:"/otro/proyecto"},async()=>"organic",verify);
 assert.deepEqual([first,second,third],["full-delegation","organic","organic"]);
});

test("E1B: un turno cambiado durante una lectura lenta no activa el modo anterior",async()=>{
 const latch=new DelegationTurnLatch();
 let finish!:(mode:DelegationMode)=>void;
 const pending=new Promise<DelegationMode>(resolve=>{finish=resolve;});
 const old=latch.mode(owner,()=>pending,verify);
 latch.nextTurn();
 finish("organic");
 await assert.rejects(old,/turno del perfil ha cambiado/u);
 assert.equal(await latch.mode(owner,async()=>"full-delegation",verify),"full-delegation");
});

test("MEGA-A2 un modo cacheado no se usa si el turno cambia durante su verificación",async()=>{
 const latch=new DelegationTurnLatch();
 await latch.mode(owner,async()=>("full-delegation" as const),async()=>{});
 let release!:(value:void)=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 let checks=0;
 const stale=latch.mode(owner,
  async()=>{throw new Error("No debe releer el modo cacheado");},
  async()=>{checks++;await gate;});
 await Promise.resolve();
 latch.nextTurn();
 release();
 await assert.rejects(stale,/turno del perfil ha cambiado/u);
 assert.equal(checks,1);
 assert.equal(await latch.mode(owner,async()=>("organic" as const),async()=>{}),"organic");
});

test("E1B: identidad no comprobada, modo inventado o sesión cambiada bloquean",async()=>{
 const latch=new DelegationTurnLatch();
 await assert.rejects(()=>latch.mode({sessionId:"",projectId:owner.projectId},async()=>"organic",verify),/identidad exacta/u);
 await assert.rejects(()=>latch.mode(owner,async()=>("inventado" as DelegationMode),verify),/Modo de delegación no válido/u);
 await assert.rejects(()=>latch.mode(owner,async()=>"full-delegation",async()=>{throw new Error("Identidad modificada");}),/Identidad modificada/u);
 assert.equal(await latch.mode(owner,async()=>"organic",verify),"organic","un fallo no deja un permiso guardado");
});
