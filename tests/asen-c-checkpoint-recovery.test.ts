import assert from "node:assert/strict";
import test from "node:test";
import {assertNativeReviewCheckpointProgress} from "../src/runtime/lifecycle/native-integration-review.js";

const hash="a".repeat(64);
const base={schema:"asen.native-review/v1",key:"candidate",policyHash:hash,receiptSignature:hash} as const;
const judge={route:"nvidia/judge-a",evidence:"provider-response-match" as const,verdict:"pass" as const};

test("G06 no convierte una revisión doble interrumpida en una revisión recuperable",()=>{
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-reviewed",attemptStarted:true,judges:[judge]} as any),/incompleto|inválido/u);
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-pending",attemptStarted:false,judges:[judge]} as any),/incompleto|inválido/u);
});

test("G06 conserva únicamente los dos estados recuperables completos",()=>{
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"joint-tests-reviewed",judges:[]} as any));
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-reviewed",attemptStarted:true,judges:[judge,{...judge,route:"nvidia/judge-b"}],findingsCount:0} as any));
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-reviewed",judges:[judge,{...judge,route:"nvidia/judge-b"}],findingsCount:0} as any),"los terminales históricos siguen siendo legibles");
});

test("G05 conserva un intento iniciado como bloqueo recuperable, sin repetir jueces",()=>{
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-pending",attemptStarted:true,judges:[]} as any));
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-pending",attemptStarted:true,judges:[judge]} as any));
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-pending",attemptStarted:true,judges:[judge,{...judge,route:"nvidia/judge-b"}]} as any));
});

test("G06 conserva la firma autenticada del recibo en checkpoints recuperables",()=>{
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,receiptSignature:"hmac-sha256-incorrecto",phase:"dual-pending",attemptStarted:false,judges:[]} as any),/inválido/u);
 for(const signature of [hash,hash.toUpperCase(),"hmac-sha256:"+hash,"hmac-sha256:"+hash.toUpperCase()]){
  assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...base,receiptSignature:signature,phase:"dual-pending",attemptStarted:false,judges:[]} as any));
 }
 for(const signature of ["HMAC-SHA256:"+hash,"hmac-sha256:"+"g".repeat(64),"hmac-sha256:"+hash.slice(1)]){
  assert.throws(()=>assertNativeReviewCheckpointProgress({...base,receiptSignature:signature,phase:"dual-pending",attemptStarted:false,judges:[]} as any),/inválido/u);
 }
});

test("G06 rechaza recibos y referencias Fix que no estén ligados de forma exacta",()=>{
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,receiptSignature:null,phase:"dual-pending",attemptStarted:false,judges:[]} as any),/inválido/u);
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-findings",attemptStarted:true,judges:[judge,{...judge,route:"nvidia/judge-b",verdict:"fail"}],findingsCount:1,fixProposalId:"no-firmado"} as any),/inválido/u);
});

test("G04 exige dos jueces distintos y estados coherentes con sus dictámenes",()=>{
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-reviewed",attemptStarted:true,judges:[judge,judge],findingsCount:0} as any),/inválido/u);
 assert.throws(()=>assertNativeReviewCheckpointProgress({...base,phase:"dual-reviewed",attemptStarted:true,judges:[judge,{...judge,route:"nvidia/judge-b",verdict:"fail"}],findingsCount:0} as any),/inválido/u);
 // Ambos jueces pueden dar pass con hallazgos leves: conservarlos, nunca aprobar el candidato.
 const findings={...base,phase:"dual-findings",attemptStarted:true,judges:[judge,{...judge,route:"nvidia/judge-b"}]};
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...findings,findingsCount:1} as any));
 assert.doesNotThrow(()=>assertNativeReviewCheckpointProgress({...findings,judges:[judge,{...judge,route:"nvidia/judge-b",verdict:"fail"}],findingsCount:1} as any));
 assert.throws(()=>assertNativeReviewCheckpointProgress({...findings,findingsCount:0} as any),/inválido/u);
 assert.throws(()=>assertNativeReviewCheckpointProgress(findings as any),/inválido/u);
 assert.throws(()=>assertNativeReviewCheckpointProgress({...findings,phase:"dual-reviewed",findingsCount:1} as any),/inválido/u);
});
