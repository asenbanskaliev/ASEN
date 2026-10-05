import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceStore} from "../src/evidence/store.js";
const candidate={id:"d4",repository:"repo",revision:"a".repeat(40),createdAt:"ahora"};
test("D4 rechaza admisión manual de intake incluso con estado fail",()=>{
 const store=new EvidenceStore();
 for(const status of ["pass","fail","expected-fail"] as const){
  assert.throws(()=>store.add(candidate,{id:status,kind:"defect-intake",status,summary:"fabricado",createdAt:"ahora"} as never),/genuine|genuin|defect/i);
 }
 assert.equal(store.forCandidate(candidate).length,0);
});
