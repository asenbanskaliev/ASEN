import assert from "node:assert/strict";
import test from "node:test";
import {verificationAdviceFromNativeAssessment,reviewRiskFromNativeAssessment} from "../src/review/ordinary-review-command.js";
import {diagnoseAgentTerminal} from "../src/runtime/agents/agent-terminal-diagnostic.js";
import type {NativeRddObservation} from "../src/review/native-rdd-control.js";

function observation(risk:unknown,due:unknown):NativeRddObservation{
 return {operation:"assess",status:"available",data:{
  schema:"gen"+"tle-ai.review-assessment/v1",risk,review_due:due,
  candidate:{kind:"current-changes"},changed_paths:1,changed_lines:1,reasons:[]
 },reviewAuthority:false,deliveryAuthority:false} as NativeRddObservation;
}

test("G49-C1: una sola observación alimenta una recomendación proporcional no autorizante",()=>{
 const passive=verificationAdviceFromNativeAssessment(observation("passive",false));
 assert.equal(passive.nativeRisk,"passive");
 assert.equal(passive.verificationRisk,"passive");
 assert.equal(passive.reviewRecommendation,"unavailable");
 assert.equal(passive.reviewDue,false);
 assert.equal(passive.writerSelfVerification,false);
 assert.equal(passive.structuralReadbackOnly,true);
 assert.equal(passive.independentVerifier,false);
 assert.equal(passive.lifecycleAuthority,false);
 assert.ok(Object.isFrozen(passive));
 const high=verificationAdviceFromNativeAssessment(observation("high",true));
 assert.equal(high.nativeRisk,"high");
 assert.equal(high.verificationRisk,"medium","riesgo nativo no inventa una escalada de autoridad");
 assert.equal(high.reviewDue,true);
 assert.equal(high.lifecycleAuthority,false);
 assert.equal(high.independentVerifier,false);
 const conservative=reviewRiskFromNativeAssessment(observation("high",true));
 assert.equal(conservative.severity,"high","se preserva la revisión conservadora ya conectada");
 assert.ok(conservative.lenses.length>0);
});

test("G49-C1: evaluación ausente o inválida no equivale a aprobación de revisión",()=>{
 for(const input of [undefined,observation("crítico",undefined),observation({},false)]){
  const policy=verificationAdviceFromNativeAssessment(input);
  assert.equal(policy.nativeRisk,"unassessable");
  assert.equal(policy.mode,"unavailable");
  assert.equal(policy.independentVerifier,false);
  assert.equal(policy.lifecycleAuthority,false);
  assert.equal(policy.verificationRisk,"medium");
  if(input===undefined)assert.equal(Object.hasOwn(policy,"reviewDue"),false);
 }
 for(const due of [null,"false",1,[],{}]){
  assert.equal(Object.hasOwn(verificationAdviceFromNativeAssessment(observation("medium",due)),"reviewDue"),false);
 }
});

test("G49-C3: diagnósticos de estado no dependen de texto del proveedor ni conceden reintentos",()=>{
 const secret="Bearer sk-SECRETO prueba privada";
 const combinations=[
  ["failed","worker","failed-unknown","inspect-cause"],
  ["failed","explorer","failed-unknown","inspect-cause"],
  ["cancelled","worker","cancelled","stop-on-cancel"],
  ["interrupted","worker","interrupted","inspect-recovery"],
  ["completed","worker","completed-worker-awaiting-review","await-independent-review"],
  ["completed","explorer","completed-read-only","reconcile-read-only"],
  ["completed","reviewer","completed-awaiting-review","await-independent-review"],
 ] as const;
 for(const [state,role,code,action] of combinations){
  const result=diagnoseAgentTerminal({state,role,summary:secret});
  assert.equal(result.code,code);assert.equal(result.action,action);
  assert.equal(result.writeAuthority,false);assert.equal(result.autoRetry,false);assert.equal(result.autoMerge,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.ok(Object.isFrozen(result));
 }
 for(const role of ["worker","explorer","reviewer","verifier"]){
  const result=diagnoseAgentTerminal({state:"completed",role,summary:" \n "});
  assert.equal(result.code,"completed-without-evidence");
  assert.equal(result.action,"inspect-empty-result");
 }
 assert.throws(()=>diagnoseAgentTerminal({state:"running",role:"worker"}),/todavía no ha terminado/u);
});
