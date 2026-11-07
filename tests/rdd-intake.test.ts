import assert from "node:assert/strict";
import test from "node:test";
import {executionProof,gitCandidate} from "./execution-evidence-helper.js";
import {EvidenceStore} from "../src/evidence/store.js";
const candidate={id:"d4",repository:"repo",revision:"a".repeat(40),createdAt:"ahora"};
test("D4 rechaza admisión manual de intake incluso con estado fail",()=>{
 const store=new EvidenceStore();
 for(const status of ["pass","fail","expected-fail"] as const){
  assert.throws(()=>store.add(candidate,{id:status,kind:"defect-intake",status,summary:"fabricado",createdAt:"ahora"} as never),/genuine|genuin|defect/i);
 }
 assert.equal(store.forCandidate(candidate).length,0);
});
test("D4 rechaza metadatos variables sin ejecutar accesores ni traps",()=>{
 const store=new EvidenceStore();let llamadas=0;
 const mutable={id:"variable",status:"pass",summary:"fabricado",createdAt:"ahora",get kind(){return ++llamadas<7?"audit":"defect-intake";},get defect(){return undefined;}};
 assert.throws(()=>store.add(candidate,mutable as never));assert.equal(llamadas,0);
 const proxy=new Proxy({id:"proxy",kind:"audit",status:"pass",summary:"fabricado",createdAt:"ahora"},{getPrototypeOf(){llamadas++;return Object.prototype;}});
 assert.throws(()=>store.add(candidate,proxy as never));assert.equal(llamadas,0);
 assert.equal(store.hasPassing(candidate,"defect-intake"),false);assert.equal(store.forCandidate(candidate).length,0);
});
test("D4 mantiene evidencia ordinaria y protege la admisión ejecutada",async()=>{
 const c=gitCandidate("d4-ejecucion"),store=new EvidenceStore(),proof=await executionProof(c);let llamadas=0;
 const meta={id:"variable",get kind(){llamadas++;return "test";},status:"pass",summary:"fabricado",createdAt:"ahora"};
 assert.throws(()=>store.addExecuted(c,proof,meta as never));assert.equal(llamadas,0);
 assert.throws(()=>store.addExecuted(c,proof,{id:"mezclado",kind:"test",status:"pass",summary:"fabricado",createdAt:"ahora",defect:{}} as never),/genuine/);
 store.add(c,{id:"auditoria",kind:"audit",status:"pass",summary:"determinista",createdAt:"ahora"});
 store.addExecuted(c,proof,{id:"prueba",kind:"test",status:"pass",summary:"ejecutada",createdAt:"ahora"});
 assert.equal(store.hasPassing(c,"audit"),true);assert.equal(store.hasPassing(c,"test"),true);assert.equal(store.hasPassing(c,"defect-intake"),false);
});
