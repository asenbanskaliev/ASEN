import test from "node:test";
import assert from "node:assert/strict";
import {acceptT06LiveApproval,requireDistinctT06Approvals,t06LiveApprovalChallenge} from "../src/runtime/agents/t06-live-consent.js";

const sha="a".repeat(40),model="nvidia/nemotron-3.5-lightning-30b-a3b";
const a={taskId:"t06-writer-a",sessionId:"t06-child-a",candidateSha:sha,model,
 writeSurface:"t06-writer-a.mjs",nonce:"1111111111111111"};
const b={taskId:"t06-writer-b",sessionId:"t06-child-b",candidateSha:sha,model,
 writeSurface:"t06-writer-b.mjs",nonce:"2222222222222222"};

test("T06 acepta solo dos respuestas humanas exactas e independientes",()=>{
 const first=t06LiveApprovalChallenge(a),second=t06LiveApprovalChallenge(b);
 assert.notEqual(first,second);
 const pair=requireDistinctT06Approvals(a,first,b,second);
 assert.equal(pair.length,2);
 assert.equal(pair[0]?.writeSurface,"t06-writer-a.mjs");
 assert.equal(Object.isFrozen(pair),true);
 assert.equal(acceptT06LiveApproval(a,first),true);
});
test("T06 deniega consentimiento ausente, aproximado, delegado o de otro Worker",()=>{
 for(const value of [undefined,null,"true",true,"SI",t06LiveApprovalChallenge(b),
  t06LiveApprovalChallenge(a)+" ",t06LiveApprovalChallenge(a).replace("AUTORIZO","autorizo")]){
  assert.equal(acceptT06LiveApproval(a,value),false);
  assert.throws(()=>requireDistinctT06Approvals(a,value,b,t06LiveApprovalChallenge(b)),
   /separate explicit human approvals/u);
 }
});
test("T06 bloquea reutilizar sesión, nonce, ámbito o modelo distinto",()=>{
 for(const altered of [
  {...b,sessionId:a.sessionId},{...b,taskId:a.taskId},
  {...b,nonce:a.nonce},{...b,writeSurface:a.writeSurface},
  {...b,candidateSha:"b".repeat(40)},{...b,model:"nvidia/otro-modelo"}
 ]){
  assert.throws(()=>requireDistinctT06Approvals(
   a,t06LiveApprovalChallenge(a),altered,t06LiveApprovalChallenge(altered)
  ),/unique session/u);
 }
});
test("T06 rechaza identificadores o modelos de proveedor de pago malformados",()=>{
 for(const altered of [
  {...a,model:"paid/llm"},{...a,model:"unknown"},
  {...a,writeSurface:"../fuera.mjs"},
  {...a,nonce:"sin-verificar"},{...a,candidateSha:"HEAD"},
  {...a,taskId:"a\nsecret"}
 ]){
  assert.throws(()=>t06LiveApprovalChallenge(altered),/exact bounded/u);
 }
});
