import test from "node:test";
import assert from "node:assert/strict";
import {assessT06WriterEvidence} from "../src/runtime/agents/t06-writer-evidence.js";
import type {T06WriterEvidenceInput} from "../src/runtime/agents/t06-writer-evidence.js";

const good:T06WriterEvidenceInput={
 events:[
  {type:"tool_execution_start",name:"write",id:"native-call-1"},
  {type:"tool_execution_end",name:"write",id:"native-call-1",error:false}
 ],
 requestedModel:"nvidia/nemotron-3.5-lightning-30b-a3b",
 observedModel:"nvidia/nemotron-3.5-lightning-30b-a3b",
 processObserved:true,nativeResultOk:true,exactScope:true,
 syntaxOk:true,behaviorOk:true,attributionVerified:true
};
const check=(patch:Partial<T06WriterEvidenceInput>)=>assessT06WriterEvidence({...good,...patch});

test("T06 aprueba solo una escritura nativa confirmada, atribuida y comprobada",()=>{
 const result=check({});
 assert.equal(result.passed,true);
 assert.equal(result.writeToolObserved,true);
 assert.equal(result.writeStarts,1);
 assert.equal(result.writeSuccesses,1);
 assert.deepEqual(result.blockers,[]);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.blockers),true);
});
test("T06 rechaza modelo que solo respondió en texto, incluso si Pi terminó correctamente",()=>{
 const result=check({events:[]});
 assert.equal(result.passed,false);
 assert.equal(result.writeToolObserved,false);
 assert.ok(result.blockers.includes("write-not-requested"));
 assert.equal(result.writeStarts,0);
});
test("T06 rechaza escritura bloqueada o evento final no correlacionado",()=>{
 for(const events of [
  [{type:"tool_execution_start" as const,name:"write",id:"1"},
   {type:"tool_execution_end" as const,name:"write",id:"1",error:true}],
  [{type:"tool_execution_start" as const,name:"write",id:"1"},
   {type:"tool_execution_end" as const,name:"write",id:"2",error:false}],
  [{type:"tool_execution_start" as const,name:"write",id:"1"}],
  [{type:"tool_execution_start" as const,name:"write"},
   {type:"tool_execution_end" as const,name:"write",error:false}],
  [...good.events, ...good.events]
 ]){
  const result=check({events});
  assert.equal(result.passed,false);
  assert.equal(result.writeToolObserved,false);
 }
});
test("T06 requiere registro real en fichero privado, no basta herramienta o archivo",()=>{
 const result=check({attributionVerified:false});
 assert.equal(result.passed,false);
 assert.ok(result.blockers.includes("workspace-attribution-missing"));
});
test("T06 rechaza cambios no autorizados, errores Pi o de modelo, y cualquier edit",()=>{
 for(const patch of [
  {nativeResultOk:false},{processObserved:false},{observedModel:null},
  {observedModel:"nvidia/modelo-distinto"},
  {exactScope:false},{syntaxOk:false},{behaviorOk:false},
  {events:[...good.events,{type:"tool_execution_start" as const,name:"edit",id:"mutacion"}]}
 ]){
  const result=check(patch);
  assert.equal(result.passed,false,JSON.stringify(patch));
  assert.ok(result.blockers.length>0);
 }
});
test("T06 los diagnósticos no pueden contener salida del modelo ni claves",()=>{
 const result=check({events:[]});
 const flat=JSON.stringify(result);
 assert.equal(flat.includes("NVIDIA_API_KEY"),false);
 assert.equal(flat.includes(good.requestedModel),false);
 assert.equal(flat.includes("console.log"),false);
});
