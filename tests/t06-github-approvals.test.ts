import test from "node:test";
import assert from "node:assert/strict";
import {validateT06GithubApprovals,T06_GITHUB_ENVIRONMENTS} from "../src/runtime/agents/t06-github-approvals.js";
import type {T06GithubApprovalContext} from "../src/runtime/agents/t06-github-approvals.js";

const sha="a".repeat(40),runId="43999910001";
const context:T06GithubApprovalContext={
 repository:"asenbanskaliev/ASEN",actor:"asenbanskaliev",eventName:"workflow_dispatch",
 ref:"refs/heads/feat/flujo-de-agentes-20261115",
 sha,expectedSha:sha,githubActions:"true",runId,runAttempt:"1",costAcknowledged:"true"
};
const workflowRun={
 id:Number(runId),event:"workflow_dispatch",head_sha:sha,
 head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
 actor:{login:"asenbanskaliev"},
 repository:{full_name:"asenbanskaliev/ASEN"}
};
const reviewer={login:"revisor-humano",type:"User"};
const approvals=()=>T06_GITHUB_ENVIRONMENTS.map((name,i)=>({
 state:"approved",environments:[{id:201+i,name}],user:reviewer
}));
const verify=(history:unknown,overrides:Partial<T06GithubApprovalContext>={},run:unknown=workflowRun)=>
 validateT06GithubApprovals({context:{...context,...overrides},
  workflowRun:run,reviewHistory:history});
test("T06 dos actos humanos separados, con entornos distintos, permiten solo comprobar la aprobación",()=>{
 const result=verify(approvals());
 assert.equal(result.status,"approved-human-reviews-only");
 assert.deepEqual(result.approvedEnvironments,[...T06_GITHUB_ENVIRONMENTS]);
 assert.equal(result.authorization,"never-implied");
 assert.equal(result.providerPriceVerified,false);
 assert.equal(result.globalFull,false);
 assert.equal(Object.isFrozen(result),true);
});
test("T06 rechaza un solo clic que aprueba dos entornos simultáneamente",()=>{
 assert.equal(verify([{state:"approved",environments:
  T06_GITHUB_ENVIRONMENTS.map(name=>({name})),user:reviewer}]).status,"blocked");
});
test("T06 no confunde ausencia, bypass, rechazo, doble registro o bot con aprobación",()=>{
 for(const history of [
  [],[approvals()[0]!],
  [{...approvals()[0]!,state:"rejected"},approvals()[1]!],
  [{...approvals()[0]!,state:"bypassed"},approvals()[1]!],
  [approvals()[0]!,approvals()[0]!,approvals()[1]!],
  [{...approvals()[0]!,user:{login:"github-actions[bot]",type:"Bot"}},approvals()[1]!],
  [{...approvals()[0]!,environments:[{name:"otro-entorno"}]},approvals()[1]!],
  [approvals()[0]!,{...approvals()[1]!,environments:[]}],
  "approved",{status:"approved"}
 ])assert.equal(verify(history).status,"blocked");
});
test("T06 no hereda aprobaciones de otro run, SHA, actor, rama o reintento",()=>{
 for(const override of [
  {runId:"43999910002"},{expectedSha:"b".repeat(40)},
  {sha:"b".repeat(40)},{githubActions:"false"},
  {runAttempt:"2"},{eventName:"pull_request"},
  {ref:"refs/heads/main"},{repository:"other/ASEN"},
  {actor:"another-owner"},{costAcknowledged:"false"},
  {costAcknowledged:""}
 ])assert.equal(verify(approvals(),override).status,"blocked");
 for(const modifiedRun of [
  {...workflowRun,id:1},
  {...workflowRun,event:"push"},
  {...workflowRun,head_sha:"b".repeat(40)},
  {...workflowRun,head_branch:"main"},
  {...workflowRun,run_attempt:2},
  {...workflowRun,actor:{login:"otro"}},
  {...workflowRun,repository:{full_name:"otro/ASEN"}}
 ])assert.equal(verify(approvals(),{},modifiedRun).status,"blocked");
});
test("T06 rechaza historia malformada y registra nunca revisión ni permisos Pi",()=>{
 for(const history of [
  null,[null],[{state:"approved",environments:null,user:reviewer}],
  [{state:"approved",environments:[{name:"asen-t06-writer-a"}],user:null},approvals()[1]!],
  Array.from({length:41},()=>approvals()[0]),
  [{...approvals()[0]!,user:{login:"bot",type:"Bot"}},approvals()[1]!]
 ])assert.equal(verify(history).status,"blocked");
});
