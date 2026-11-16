import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay,isIssuedJudgmentDayReport} from "../src/review/judgment-day.js";
import {proposeJudgmentFixHandoff} from "../src/review/odd-agent-review-flow.js";
import type {PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";

const author={provider:"author",id:"coder"},a={provider:"free",id:"judge-a"},b={provider:"free",id:"judge-b"};
function fixture(t:TestContext){
 const root=mkdtempSync(join(tmpdir(),"asen-jd-repo-")),view=mkdtempSync(join(tmpdir(),"asen-jd-view-"));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(view,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{stdio:["ignore","pipe","pipe"],encoding:"utf8"});
 git("init","-q");git("config","user.name","ASEN JD test");git("config","user.email","asen@invalid.example");
 writeFileSync(join(root,"code.ts"),"before\n");git("add","code.ts");git("commit","-qm","baseline");
 writeFileSync(join(root,"code.ts"),"after\n");
 const workspace=openWorkspaceReview({repositoryRoot:resolve(root),intendedUntracked:[],sessionId:"s-judge",reviewerId:"free/judge-a",viewParent:resolve(view),risk:{riskId:"JD",reason:"Compare independent results",severity:"high",lenses:["risk","reliability"]}});
 return {workspace,evidence:readWorkspaceReviewEvidence(workspace)};
}

function registry(second:"pass"|"fail"="pass",first:"pass"|"fail"="pass"){
 const calls:{id:string;prompt:string;hasTools:boolean}[]=[];
 const value:PiReviewRegistry={
  getAvailable:()=>[author,a,b],hasConfiguredAuth:model=>model.provider==="free",
  streamSimple:(model:PiReviewerModel,context)=>{
   calls.push({id:model.id,prompt:context.systemPrompt,hasTools:"tools" in context});
   const verdict=model.id==="judge-b"?second:first;
   const findings=verdict==="fail"?[{id:"F1",severity:"high",path:"code.ts",description:"An observed concern"}]:[];
   const text=JSON.stringify({verdict,summary:"Reviewed exact candidate",findings});
   return (async function*(){yield {type:"done" as const,reason:"stop" as const,message:{content:[{type:"text",text}],role:"assistant",provider:model.provider}};})();
  }
 };
 return {value,calls};
}
test("Judgment Day requires two distinct authenticated independent models and emits one bounded combined report",async t=>{
 const {workspace,evidence}=fixture(t),models=registry();
 const result=await runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Verify exact candidate"});
 assert.equal(isIssuedJudgmentDayReport(result),true);
 assert.equal(result.status,"analysis-complete");
 assert.equal(result.requestId,evidence.requestId);
 assert.equal(result.candidateTreeIdentity,evidence.candidate.treeIdentity);
 assert.equal(result.judges.length,2);
 assert.deepEqual(models.calls.map(c=>c.id),["judge-a","judge-b"]);
 assert.match(models.calls[0]!.prompt,/Judge A/);
 assert.match(models.calls[1]!.prompt,/Judge B/);
 assert.equal(models.calls.some(c=>c.hasTools),false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.deliveryAuthority,false);
 assert.equal(result.fixAgent,"not-launched");
 closeWorkspaceReview(workspace);
});
test("Judgment Day preserves the disagreement and asks for review, never Writer or merge",async t=>{
 const {workspace,evidence}=fixture(t),models=registry("fail");
 const result=await runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Check"});
 assert.equal(result.status,"disagreement-requires-review");
 assert.equal(result.findings.length,1);
 assert.equal(result.findings[0]!.judge,"jd-judge-b");
 assert.equal(result.findings[0]!.finding.severity,"high");
 assert.equal(result.autoMerge,false);
 assert.equal(result.fixAgent,"not-launched");
 closeWorkspaceReview(workspace);
});
test("Judgment Day rejects model reuse, author models and forged evidence before spending",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(),base={registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Check"};
 await assert.rejects(()=>runJudgmentDay({...base,judgeB:a}),/distinct independent/u);
 await assert.rejects(()=>runJudgmentDay({...base,judgeB:author}),/authenticated and different/u);
 await assert.rejects(()=>runJudgmentDay({...base,evidence:{...evidence}}),/controller-issued/u);
 assert.equal(models.calls.length,0);
 closeWorkspaceReview(workspace);
});
test("Judgment Day cancellation stops before first model call",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(),controller=new AbortController();
 controller.abort();
 await assert.rejects(()=>runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Check",signal:controller.signal}),/cancelled/u);
 assert.equal(models.calls.length,0);
 closeWorkspaceReview(workspace);
});

test("Judgment Day rechecks candidate identity before each judge and blocks stale second call",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(),checks:string[]=[];
 await assert.rejects(()=>runJudgmentDay({
  registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Verify",
  validateBeforeJudge:judge=>{checks.push(judge);if(judge==="jd-judge-b")throw new Error("candidate changed");}
 }),/candidate changed/u);
 assert.deepEqual(checks,["jd-judge-a","jd-judge-b"]);
 assert.deepEqual(models.calls.map(x=>x.id),["judge-a"]);
 closeWorkspaceReview(workspace);
});

test("T08 Judgment Day genuine without findings does not create a Fix",async t=>{
 const {workspace,evidence}=fixture(t),models=registry();
 const report=await runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Inspect"});
 const handoff=proposeJudgmentFixHandoff({report,evidence,fixProfile:{model:"nvidia/fix-proposed",thinking:"minimal"}});
 assert.equal(handoff.status,"not-needed");
 assert.deepEqual(handoff.paths,[]);
 assert.equal(handoff.fixModelRequested,"nvidia/fix-proposed");
 assert.equal(handoff.fixModelActual,"unknown");
 assert.equal(handoff.writerAuthority,false);
 assert.equal(handoff.autoLaunch,false);
 assert.equal(handoff.acceptance,"not-accepted");
 closeWorkspaceReview(workspace);
});
test("T08 two genuine failing judges propose only scoped files and fresh ODD approval",async t=>{
 const {workspace,evidence}=fixture(t),models=registry("fail","fail");
 const report=await runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Inspect"});
 const handoff=proposeJudgmentFixHandoff({report,evidence});
 assert.equal(report.status,"findings-require-review");
 assert.equal(handoff.status,"fix-planning-required");
 assert.deepEqual(handoff.paths,["code.ts"]);
 assert.equal(handoff.nextCommand,"/asen-plan");
 assert.equal(handoff.requiresFreshOddPlan,true);
 assert.equal(handoff.requiresFreshWriterConsent,true);
 assert.equal(handoff.writerAuthority,false);
 assert.equal(handoff.autoMerge,false);
 assert.equal(handoff.fixModelActual,"unknown");
 assert.throws(()=>proposeJudgmentFixHandoff({report:{...report},evidence}),/genuine issued/u);
 closeWorkspaceReview(workspace);
});
test("T08 disagreement requires human triage, not an automatic corrective task",async t=>{
 const {workspace,evidence}=fixture(t),models=registry("fail");
 const report=await runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Inspect"});
 const result=proposeJudgmentFixHandoff({report,evidence});
 assert.equal(result.status,"manual-triage-required");
 assert.deepEqual(result.paths,["code.ts"]);
 assert.equal(result.autoLaunch,false);
 assert.equal(result.writerAuthority,false);
 closeWorkspaceReview(workspace);
});
