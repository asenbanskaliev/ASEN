import {mkdtempSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PersistentWorkspaceStore} from "../src/runtime/workspace-store.js";
import {verifyT06WorkspaceAttribution} from "../src/runtime/agents/t06-writer-evidence.js";
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

test("T06 acepta solo el registro real del agente y sesión en su fichero privado",async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-t06-attrib-test-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const sessionId="t06-child-11111111-1111-4111-8111-111111111111";
 const agentId="t06-writer-a:worker",target="t06-writer-a.mjs";
 const store=await PersistentWorkspaceStore.open(join(root,"private","journal.json"));
 const verify=(override:Record<string,string>={})=>
  verifyT06WorkspaceAttribution({store,root,sessionId,agentId,target,...override});
 const empty=await verify();
 assert.deepEqual(empty,{verified:false,entries:0});
 await store.append({path:target,actor:{kind:"agent",id:agentId},sessionId,
  projectId:root,worktree:root,operation:"create",at:new Date().toISOString()});
 const ok=await verify();
 assert.deepEqual(ok,{verified:true,entries:1});
 assert.equal((await verify({agentId:"t06-writer-b:worker"})).verified,false);
 assert.equal((await verify({sessionId:"t06-child-22222222-2222-4222-8222-222222222222"})).verified,false);
 assert.equal((await verify({target:"t06-writer-b.mjs"})).verified,false);
 assert.equal((await verify({target:"../fuga.mjs"})).verified,false);
 await store.append({path:target,actor:{kind:"agent",id:agentId},sessionId,
  projectId:root,worktree:root,operation:"modify",at:new Date().toISOString()});
 const duplicate=await verify();
 assert.equal(duplicate.verified,false);
 assert.equal(duplicate.entries,2);
});

test("T06 falla cerrado si el fichero de atribución no puede comprobarse",async()=>{
 const failed=await verifyT06WorkspaceAttribution({
  store:{list:async()=>{throw new Error("corrupt");}} as Pick<PersistentWorkspaceStore,"list">,
  root:"/tmp/asan-sin-escritura",sessionId:"sesion",
  agentId:"t06-writer-a:worker",target:"t06-writer-a.mjs"
 });
 assert.deepEqual(failed,{verified:false,entries:0});
});
