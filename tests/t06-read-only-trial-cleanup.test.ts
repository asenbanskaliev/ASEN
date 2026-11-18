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
test("T06 sin runtime solo permite limpiar si no hay arranques ni sesiones",async()=>{
 assert.equal(await settleT06ReadOnlyTrial({startAttempts:[],sessions:[]}),true);
 assert.equal(await settleT06ReadOnlyTrial({startAttempts:[],sessions}),false);
 assert.equal(await settleT06ReadOnlyTrial({startAttempts:[Promise.resolve("a")],sessions}),false);
});

test("T06 no autoriza limpieza con un hijo omitido, aunque su cancelación termine",async()=>{
 const stopped:string[]=[];
 const allowed=await settleT06ReadOnlyTrial({
  startAttempts:[Promise.resolve("a"),Promise.resolve("b")],
  sessions:[sessions[0]!],
  runtime:{async cancelSession(identity){stopped.push(identity.sessionId);}}
 });
 assert.equal(allowed,false);
 assert.deepEqual(stopped,["hijo-a"],"Se detienen los hijos conocidos, sin inventar el segundo");
});

test("T06 bloquea identidades repetidas y vacías antes de limpiar Git",async()=>{
 for(const identities of [
  [sessions[0]!,sessions[0]!],
  [sessions[0]!,{sessionId:"",projectId:"worktree-b"}],
  [sessions[0]!,{sessionId:"hijo-b",projectId:""}]
 ]){
  const stopped:string[]=[];
  const allowed=await settleT06ReadOnlyTrial({
   startAttempts:[Promise.resolve("a"),Promise.resolve("b")],
   sessions:identities,
   runtime:{async cancelSession(identity){stopped.push(identity.sessionId);}}
  });
  assert.equal(allowed,false,JSON.stringify(identities));
  assert.equal(stopped.length,2,"Una identidad anómala no impide cancelar las demás");
 }
});

test("T06 autoriza el cierre cuando los dos hijos distintos finalizaron",async()=>{
 const allowed=await settleT06ReadOnlyTrial({
  startAttempts:[Promise.resolve("a"),Promise.resolve("b")],sessions,
  runtime:{async cancelSession(){}}
 });
 assert.equal(allowed,true);
});
