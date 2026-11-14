import test from "node:test";
import assert from "node:assert/strict";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";

const repository="/asan-fixture";
function plan(taskId:string,options:Parameters<typeof issueOddDecision>[0]){
 const decision=issueOddDecision({...options,taskId,repository});
 return buildOrchestrationPlan({taskId,repository,prompt:"Inspect an isolated fixture without writing"},decision);
}
const roles=(result:ReturnType<typeof plan>)=>result.agents.map(agent=>agent.role);

test("EF-101 C01 bounded low-risk work stays on primary, without five-agent ceremony",()=>{
 const p=plan("parity-small",{taskId:"parity-small",repository,paths:["src/a.ts"],writes:[],testingRequired:false});
 assert.equal(p.decision.route,"direct");
 assert.equal(p.decision.verification,"structural");
 assert.deepEqual(roles(p),[]);
});
test("EF-101 C05 unknown scope records plan and never turns uncertainty into Writer authority",()=>{
 const p=plan("parity-unknown",{taskId:"parity-unknown",repository,
  scope:{kind:"unknown",reason:"No validated file boundaries"},writes:[]});
 assert.equal(p.decision.route,"plan");
 assert.deepEqual(roles(p),[]);
 assert.equal(p.decision.risk,"unknown");
});
test("EF-401 C09 medium-risk coordinated review gets two Reviewers but no Verifier",()=>{
 const p=plan("parity-medium",{taskId:"parity-medium",repository,
  paths:["src/a.ts"],writes:[{path:"src/a.ts",changeKind:"behavior"}],
  reviewKind:"dual_explicit"});
 assert.equal(p.decision.risk,"medium");
 assert.equal(p.decision.verification,"tests");
 assert.deepEqual(roles(p),["worker","reviewer","reviewer"]);
 assert.ok(p.agents.filter(agent=>agent.role!=="worker").every(agent=>
  agent.writeSurfaces===undefined&&agent.writerAdmission===undefined));
});
test("EF-401 C10 a high-risk incident retains independent Explorer, Reviewer and Verifier",()=>{
 const p=plan("parity-incident",{taskId:"parity-incident",repository,
  intent:"incident",paths:["src/a.ts"],riskOperations:["security_boundary"],
  reviewKind:"ordinary"});
 assert.equal(p.decision.risk,"high");
 assert.equal(p.decision.verification,"independent");
 assert.deepEqual(roles(p),["explorer","worker","reviewer","verifier"]);
 assert.ok(p.agents.filter(agent=>agent.role!=="worker").every(agent=>
  agent.writeSurfaces===undefined&&agent.writerAdmission===undefined));
});
test("EF-401 C10 explicit independent verification never creates Writer",()=>{
 const p=plan("parity-verification",{taskId:"parity-verification",repository,
  intent:"verification",paths:["src/a.ts"],writes:[]});
 assert.equal(p.decision.route,"verify");
 assert.deepEqual(roles(p),["verifier"]);
 assert.equal(p.agents[0]?.writeSurfaces,undefined);
});
test("EF-101 explicit dual review without actual risk stays proportional",()=>{
 const p=plan("parity-dual",{taskId:"parity-dual",repository,
  paths:["src/a.ts"],reviewKind:"dual_explicit",writes:[]});
 assert.equal(p.decision.risk,"low");
 assert.deepEqual(roles(p),["worker","reviewer","reviewer"]);
 assert.equal(roles(p).includes("verifier"),false);
});
