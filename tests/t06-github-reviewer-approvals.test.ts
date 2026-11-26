import test from "node:test";
import assert from "node:assert/strict";
import {T06_GITHUB_ENVIRONMENTS,type T06GithubApprovalContext}
 from "../src/runtime/agents/t06-github-approvals.js";
import {T06_REVIEW_ENVIRONMENTS,validT06ReviewerModels,
 validateT06GithubReviewerApprovals}
 from "../src/runtime/agents/t06-github-reviewer-approvals.js";
const sha="a".repeat(40),runId="44700000001";
const context:T06GithubApprovalContext={
 repository:"asenbanskaliev/ASEN",actor:"asenbanskaliev",
 eventName:"workflow_dispatch",ref:"refs/heads/feat/flujo-de-agentes-20261115",
 sha,expectedSha:sha,githubActions:"true",runId,
 runAttempt:"1",costAcknowledged:"true"
};
const run={
 id:Number(runId),event:"workflow_dispatch",head_sha:sha,
 head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
 actor:{login:"asenbanskaliev"},repository:{full_name:"asenbanskaliev/ASEN"}
};
const models=["nvidia/revisor-ejemplo-a","nvidia/revisor-ejemplo-b"] as const;
const people={login:"operador",type:"User"};
const history=()=>
 [...T06_GITHUB_ENVIRONMENTS,...T06_REVIEW_ENVIRONMENTS].map(name=>({
  state:"approved",environments:[{name}],user:people
 }));
const decide=(approvals:unknown=history(),
 ctx:T06GithubApprovalContext=context,modelA:string=models[0],
 modelB:string=models[1],workflowRun:unknown=run)=>
 validateT06GithubReviewerApprovals({
  context:ctx,run:workflowRun,approvals,reviewerA:modelA,reviewerB:modelB
 });
test("T06 requiere cuatro aprobaciones diferentes en una sola ejecución",()=>{
 const result=decide();
 assert.equal(result.status,"approved-read-only-review");
 assert.equal(result.authority,"read-only-review-only");
 assert.equal(result.costVerified,false);
 assert.equal(result.accepted,false);
 assert.equal(result.globalFull,false);
});
test("T06 exige dos modelos NVIDIA distintos del Writer y entre sí",()=>{
 assert.equal(validT06ReviewerModels(...models),true);
 for(const [a,b] of [
  ["nvidia/repetido","nvidia/repetido"],
  ["nvidia/nemotron-3.5-lightning-30b-a3b","nvidia/revisor-ejemplo"],
  ["nvidia/revisor-ejemplo","nvidia/nemotron-3.5-lightning-30b-a3b"],
  ["openrouter/a","nvidia/b"],
  ["","nvidia/b"],["nvidia/a",""]
 ])assert.equal(validT06ReviewerModels(a,b),false);
});
test("T06 no usa permisos Writer como autorización de revisores",()=>{
 assert.equal(decide(history().slice(0,2)).status,"blocked");
 assert.equal(decide([history()[0],history()[1],history()[2]]).status,"blocked");
 assert.equal(decide(history().slice(2)).status,"blocked");
});
test("T06 rechaza aprobación agrupada, repetida, rechazada o robot",()=>{
 const valid=history();
 for(const wrong of [
  [valid[0],valid[1],{
   state:"approved",environments:T06_REVIEW_ENVIRONMENTS.map(name=>({name})),
   user:people
  }],
  [...valid,valid[2]],
  [valid[0],valid[1],{...valid[2],state:"rejected"},valid[3]],
  [valid[0],valid[1],{...valid[2],user:{login:"github-actions[bot]",type:"Bot"}},valid[3]],
  [valid[0],valid[1],{...valid[2],user:{login:"robot",type:"Bot"}},valid[3]],
  [valid[0],valid[1],{...valid[2],environments:[{name:"otro"}]},valid[3]]
 ])assert.equal(decide(wrong).status,"blocked");
});
test("T06 no hereda permisos de otro SHA, run, rama, coste o reintento",()=>{
 for(const patch of [
  {sha:"b".repeat(40)},{expectedSha:"b".repeat(40)},
  {runId:"44700000002"},{ref:"refs/heads/main"},
  {costAcknowledged:"false"},{runAttempt:"2"},
  {actor:"otro"},{eventName:"push"}
 ])assert.equal(decide(history(),{...context,...patch}).status,"blocked");
 for(const r of [
  {...run,head_sha:"b".repeat(40)}, {...run,run_attempt:2},
  {...run,id:123},{...run,head_branch:"main"},
  {...run,actor:{login:"otro"}}
 ])assert.equal(decide(history(),context,models[0],models[1],r).status,"blocked");
});
