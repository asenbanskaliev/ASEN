import test from "node:test";
import assert from "node:assert/strict";
import {settleT06ReadOnlyTrial} from "../src/runtime/agents/t06-read-only-trial-cleanup.js";

const sessions=[
 {sessionId:"hijo-a",projectId:"worktree-a"},
 {sessionId:"hijo-b",projectId:"worktree-b"}
];
test("T06 cancela y espera las dos sesiones antes de autorizar la limpieza",async()=>{
 const events:string[]=[];
 const result=await settleT06ReadOnlyTrial({
  startAttempts:[Promise.resolve("a"),Promise.resolve("b")],sessions,
  runtime:{async cancelSession(identity){
   events.push("iniciar-"+identity.sessionId);
   await Promise.resolve();
   events.push("finalizar-"+identity.sessionId);
  }}
 });
 assert.equal(result,true);
 assert.deepEqual(events.filter(x=>x.startsWith("finalizar-")),
  ["finalizar-hijo-a","finalizar-hijo-b"]);
});
test("T06 no cancela hasta que todas las altas quedan determinadas",async()=>{
 const events:string[]=[];
 let resolveStart!:()=>void;
 const start=new Promise<void>(resolve=>{resolveStart=resolve;});
 const checking=settleT06ReadOnlyTrial({
  startAttempts:[Promise.reject(new Error("alta de A denegada")),start],
  sessions,runtime:{async cancelSession(identity){events.push(identity.sessionId);}}
 });
 await Promise.resolve();
 assert.deepEqual(events,[]);
 resolveStart();
 assert.equal(await checking,true);
 assert.deepEqual(events,["hijo-a","hijo-b"]);
});
test("T06 bloquea la retirada de worktrees si alguna cancelación falla",async()=>{
 const observed:string[]=[];
 const ok=await settleT06ReadOnlyTrial({
  startAttempts:[Promise.resolve("a")],sessions,
  runtime:{async cancelSession(identity){
   observed.push(identity.sessionId);
   if(identity.sessionId==="hijo-a")throw Error("Cancelación incompleta");
  }}
 });
 assert.equal(ok,false);
 assert.deepEqual(observed,["hijo-a","hijo-b"],"No abandonar el segundo hijo");
});
test("T06 sin runtime solo autoriza limpieza si no se inició ninguna alta",async()=>{
 assert.equal(await settleT06ReadOnlyTrial({startAttempts:[],sessions}),true);
 assert.equal(await settleT06ReadOnlyTrial({startAttempts:[Promise.resolve("a")],sessions}),false);
});
