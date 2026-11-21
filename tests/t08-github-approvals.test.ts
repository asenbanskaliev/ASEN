import test from "node:test";
import assert from "node:assert/strict";
import {T08_REVIEW_ENVIRONMENT,T08_FIX_ENVIRONMENT,
 validateT08GithubApprovals,type T08ApprovalContext
} from "../src/runtime/agents/t08-github-approvals.js";

const context:T08ApprovalContext={
 repository:"asenbanskaliev/ASEN",actor:"asenbanskaliev",
 eventName:"workflow_dispatch",ref:"refs/heads/feat/flujo-de-agentes-20261115",
 sha:"a".repeat(40),expectedSha:"a".repeat(40),
 runId:"123456789",attempt:"1",actions:"true",
 costAcknowledged:"true",
 reviewerA:"nvidia/revisor-a",reviewerB:"nvidia/revisor-b",
 writerModel:"nvidia/reparador"
};
const run={
 id:123456789,event:"workflow_dispatch",head_sha:context.sha,
 head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
 repository:{full_name:"asenbanskaliev/ASEN"},
 actor:{login:"asenbanskaliev"}
};
const decision=(name:string,state="approved")=>({
 state,environments:[{name}],user:{type:"User",login:"asenbanskaliev"}
});
const history=[decision(T08_REVIEW_ENVIRONMENT),decision(T08_FIX_ENVIRONMENT)];
const inspect=(stage:"review"|"fix",c=context,r:unknown=run,a:unknown=history)=>
 validateT08GithubApprovals({context:c,run:r,approvals:a,stage});

test("T08 separa consentimiento de revisión del permiso humano para reparar",()=>{
 const first=inspect("review",context,run,[decision(T08_REVIEW_ENVIRONMENT)]);
 assert.equal(first.status,"approved-environments-only");
 assert.equal(first.writerAuthority,false);
 assert.equal(first.globalFull,false);
 assert.equal(first.costVerified,false);
 assert.equal(inspect("fix",context,run,[decision(T08_REVIEW_ENVIRONMENT)]).status,"blocked");
 const after=inspect("fix");
 assert.equal(after.status,"approved-environments-only");
 assert.deepEqual(after.stages,[T08_FIX_ENVIRONMENT,T08_REVIEW_ENVIRONMENT].sort());
 assert.equal(after.writerAuthority,false);
});
test("T08 rechaza saltos, rechazo, bot, duplicados y aprobaciones conjuntas",()=>{
 for(const altered of [
  [decision(T08_REVIEW_ENVIRONMENT,"skipped"),decision(T08_FIX_ENVIRONMENT)],
  [decision(T08_REVIEW_ENVIRONMENT),decision(T08_FIX_ENVIRONMENT,"rejected")],
  [{...decision(T08_REVIEW_ENVIRONMENT),user:{type:"Bot",login:"asenbanskaliev"}},
   decision(T08_FIX_ENVIRONMENT)],
  [{...decision(T08_REVIEW_ENVIRONMENT),
   environments:[{name:T08_REVIEW_ENVIRONMENT},{name:T08_FIX_ENVIRONMENT}]}],
  [decision(T08_REVIEW_ENVIRONMENT),decision(T08_REVIEW_ENVIRONMENT),
   decision(T08_FIX_ENVIRONMENT)],
  [decision(T08_REVIEW_ENVIRONMENT),
   {...decision(T08_FIX_ENVIRONMENT),user:{type:"User",login:"otro"}}],
  [{...decision(T08_REVIEW_ENVIRONMENT),user:{type:"User",login:"otro"}},
   decision(T08_FIX_ENVIRONMENT)]
 ]){
  assert.equal(inspect("fix",context,run,altered).status,"blocked",
   JSON.stringify(altered));
 }
});
test("T08 no acepta autorizaciones de otro SHA, run, actor ni intento",()=>{
 for(const changed of [
  {sha:"b".repeat(40)},
  {expectedSha:"b".repeat(40)},
  {actor:"otro"},
  {repository:"otra/ASEN"},
  {ref:"refs/heads/main"},
  {eventName:"push"},
  {runId:"0"},{attempt:"2"},
  {actions:"false"},{costAcknowledged:"false"},
  {reviewerB:context.reviewerA},
  {writerModel:context.reviewerA},
  {reviewerA:"nvidia//invalido"},
  {reviewerA:"nvidia/nemotron-3-ultra-550b-a55b"},
  {reviewerB:"nvidia/nemotron-3-ultra-550b-a55b"},
  {writerModel:"nvidia/nemotron-3-ultra-550b-a55b"},
  {writerModel:"nvidia/default"}
 ]){
  assert.equal(inspect("review",{...context,...changed}).status,"blocked",
   JSON.stringify(changed));
 }
 for(const altered of [
  {...run,head_sha:"b".repeat(40)},
  {...run,run_attempt:2},{...run,id:123456788},
  {...run,event:"push"},{...run,head_branch:"main"},
  {...run,repository:{full_name:"otro/ASEN"}},
  {...run,actor:{login:"otro"}}
 ])
  assert.equal(inspect("fix",context,altered).status,"blocked");
});
test("T08 rechaza historial incompleto o malformado sin conceder escritura",()=>{
 for(const bad of [undefined,null,{},[],Array(41).fill(null),
  [{state:"approved",environments:[]}],
  [{state:"approved",environments:[{name:T08_REVIEW_ENVIRONMENT}],user:null}],
  [{state:"approved",environments:[null],user:{type:"User",login:"asenbanskaliev"}}]
 ]){
  assert.equal(validateT08GithubApprovals({context,run,approvals:bad,stage:"fix"}).status,"blocked");
 }
});

test("T08 bloquea el modelo con respuestas vacías conocidas aunque tenga aprobaciones",()=>{
 for(const change of [
  {reviewerA:"nvidia/nemotron-3-ultra-550b-a55b"},
  {reviewerB:"nvidia/nemotron-3-ultra-550b-a55b"},
  {writerModel:"nvidia/nemotron-3-ultra-550b-a55b"}
 ]){
  const result=inspect("fix",{...context,...change});
  assert.equal(result.status,"blocked");
  assert.match(result.reason,/dictámenes vacíos/u);
  assert.equal(result.writerAuthority,false);
 }
});
