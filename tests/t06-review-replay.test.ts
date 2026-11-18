import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {T06_REPLAY_SOURCE_RUN,T06_REPLAY_SOURCE_SHA,
 validateT06ReviewReplay} from "../src/runtime/agents/t06-review-replay.js";
import {T06_GITHUB_ENVIRONMENTS,type T06GithubApprovalContext}
 from "../src/runtime/agents/t06-github-approvals.js";
import {T06_REVIEW_ENVIRONMENTS}
 from "../src/runtime/agents/t06-github-reviewer-approvals.js";
const sha="b".repeat(40),runId="44399988888";
const context:T06GithubApprovalContext={
 repository:"asenbanskaliev/ASEN",actor:"asenbanskaliev",
 eventName:"workflow_dispatch",ref:"refs/heads/feat/flujo-de-agentes-20261115",
 sha,expectedSha:sha,githubActions:"true",runId,
 runAttempt:"1",costAcknowledged:"true"
};
const base=(id:number,head_sha:string,conclusion?:string)=>({
 id,event:"workflow_dispatch",head_sha,
 head_branch:"feat/flujo-de-agentes-20261115",run_attempt:1,
 ...(conclusion?{conclusion}:{}),
 actor:{login:"asenbanskaliev"},repository:{full_name:"asenbanskaliev/ASEN"}
});
const current=()=>base(Number(runId),sha);
const original=()=>base(T06_REPLAY_SOURCE_RUN,T06_REPLAY_SOURCE_SHA,"failure");
const human={login:"asenbanskaliev",type:"User"};
const approvals=(names:readonly string[])=>names.map(name=>({
 state:"approved",environments:[{name}],user:human
}));
const old=()=>approvals(T06_GITHUB_ENVIRONMENTS);
const fresh=()=>approvals(T06_REVIEW_ENVIRONMENTS);
const jobs=()=>[
 {name:"t06-escritura-con-aprobaciones / ejecutar",status:"completed",conclusion:"success"},
 {name:"t06-escritura-con-aprobaciones / comprobar-comportamiento-aislado",status:"completed",conclusion:"success"},
 {name:"t06-escritura-con-aprobaciones / revisar-independiente",status:"completed",conclusion:"failure"}
];
const check=(patch:Record<string,unknown>={})=>
 validateT06ReviewReplay({
  currentContext:context,currentRun:current(),currentApprovals:fresh(),
  sourceRun:original(),sourceApprovals:old(),sourceJobs:jobs(),
  reviewerA:"nvidia/modelo-revisor-a",reviewerB:"nvidia/modelo-revisor-b",
  ...patch
 });
test("T06 reutiliza Writers anteriores solo con dos consentimientos nuevos para revisión",()=>{
 const result=check();
 assert.equal(result.status,"approved-read-only-review");
 assert.equal(result.costVerified,false);
 assert.equal(result.accepted,false);
 assert.equal(result.globalFull,false);
 assert.equal(result.authority,"read-only-review-only");
 assert.equal(T06_REPLAY_SOURCE_RUN,44389671458);
 assert.equal(T06_REPLAY_SOURCE_SHA,"a33da9eebb92ac3131c958b14846945c31cd24a7");
});
test("T06 la historia Writer antigua no concede revisiones en un nuevo run",()=>{
 for(const history of [
  [],old(),fresh().slice(0,1),
  [{state:"approved",environments:T06_REVIEW_ENVIRONMENTS.map(name=>({name})),user:human}],
  [fresh()[0],fresh()[0],fresh()[1]],
  [{...fresh()[0],state:"bypassed"},fresh()[1]],
  [{...fresh()[0],user:{login:"github-actions[bot]",type:"Bot"}},fresh()[1]],
  [{...fresh()[0],state:"rejected"},fresh()[1]]
 ])assert.equal(check({currentApprovals:history}).status,"blocked");
});
test("T06 los dos Writers históricos y sus 17 pruebas deben tener success real",()=>{
 for(const sourceJobs of [
  [],jobs().slice(0,1),
  [{...jobs()[0],conclusion:"failure"},jobs()[1]],
  [jobs()[0],{...jobs()[1],conclusion:"skipped"}],
  [...jobs(),jobs()[0]]
 ])assert.equal(check({sourceJobs}).status,"blocked");
 for(const sourceApprovals of [
  [],old().slice(0,1),
  [old()[0],{...old()[1],state:"rejected"}]
 ])assert.equal(check({sourceApprovals}).status,"blocked");
});
test("T06 rechaza origen equivocado, éxito ficticio o SHA histórico cambiado",()=>{
 const baseline=original();
 for(const altered of [
  {...baseline,id:123}, {...baseline,head_sha:"c".repeat(40)},
  {...baseline,run_attempt:2},{...baseline,event:"push"},
  {...baseline,conclusion:"success"},{...baseline,head_branch:"main"},
  {...baseline,repository:{full_name:"otro/ASEN"}},
  {...baseline,actor:{login:"otro"}}
 ])assert.equal(check({sourceRun:altered}).status,"blocked");
});
test("T06 la nueva ejecución no hereda SHA, coste, actor ni primer intento",()=>{
 for(const patch of [
  {sha:"c".repeat(40)},{expectedSha:"a".repeat(40)},
  {runAttempt:"2"},{costAcknowledged:"false"},
  {eventName:"pull_request"},{actor:"otro"},
  {ref:"refs/heads/main"},{runId:"44399988889"}
 ])assert.equal(check({currentContext:{...context,...patch}}).status,"blocked");
 for(const altered of [
  {...current(),id:1},{...current(),head_sha:"c".repeat(40)},
  {...current(),run_attempt:2},{...current(),event:"push"}
 ])assert.equal(check({currentRun:altered}).status,"blocked");
});
test("T06 mantiene modelos diferentes del autor y rechazados si no son NVIDIA",()=>{
 for(const [a,b] of [
  ["nvidia/x","nvidia/x"],
  ["nvidia/nemotron-3.5-lightning-30b-a3b","nvidia/modelo-b"],
  ["openrouter/modelo-a","nvidia/modelo-b"]
 ])assert.equal(check({reviewerA:a,reviewerB:b}).status,"blocked");
});
test("T06 solo revisión nunca consume dos Writers ni omite la validación original",()=>{
 const yaml=readFileSync(new URL("../.github/workflows/t06-review-only.yml",import.meta.url),"utf8").replace(/\r\n/gu,"\n");
 const script=readFileSync(new URL("../scripts/t06-github-independent-review.ts",import.meta.url),"utf8");
 const runner=readFileSync(new URL("../scripts/t06-native-independent-review.ts",import.meta.url),"utf8");
 assert.match(yaml,/^on:\s*\n  workflow_dispatch:/mu);
 assert.doesNotMatch(yaml,/^  (?:push|pull_request|schedule|workflow_call):/mu);
 assert.match(yaml,/run-id: 44389671458/u);
 assert.match(yaml,/github-token: \$\{\{ github\.token \}\}/u);
 assert.match(yaml,/name: asen-t06-reviewer-a/u);
 assert.match(yaml,/name: asen-t06-reviewer-b/u);
 assert.match(yaml,/needs: \[aprobar-revisor-a\]/u);
 assert.match(yaml,/needs: \[comprobar-origen, aprobar-revisor-b\]/u);
 assert.match(yaml,/ASEN_T06_REVIEW_REPLAY_MODE: '1'/u);
 assert.match(yaml,/ASEN_T06_SOURCE_SHA: 'a33da9eebb92ac3131c958b14846945c31cd24a7'/u);
 assert.match(yaml,/ASEN_T06_SOURCE_RUN_ID: '44389671458'/u);
 assert.match(yaml,/ASEN_T06_COST_ACK:/u);
 assert.match(yaml,/test "\$GITHUB_RUN_ATTEMPT" = 1/u);
 assert.match(yaml,/requireLiveT06ReviewReplay/u);
 assert.match(yaml,/scripts\/t06-review-replay-precheck.ts/u);
 assert.doesNotMatch(yaml,/secrets\.NVIDIA_API_KEY[^]*?(?=  aprobar-revisor-a:)/u);
 assert.doesNotMatch(yaml,/t06-nvidia-dual-writer-native\.ts|contents: write|pull-requests: write/u);
 assert.match(script,/if\(replay\)await requireLiveT06ReviewReplay\(\)/u);
 assert.match(script,/expectedSha:sourceSha,report:receipt/u);
 assert.match(runner,/noTools:true,requireFinalSettlement:true/u);
 assert.match(runner,/await requireLiveT06ReviewReplay\(\)/u);
 assert.match(script,/globalFull:false/u);
});
