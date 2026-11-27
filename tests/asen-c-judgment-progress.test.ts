import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay,isIssuedJudgmentDayReport} from "../src/review/judgment-day.js";
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
test("Conserva el dictamen parcial auténtico antes de un fallo del segundo juez",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(),recorded:string[]=[];
 await assert.rejects(()=>runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Revisar",
  onJudgeResult:(judge,verdict)=>{assert.equal(isIssuedJudgmentDayReport(verdict),false);recorded.push(judge+":"+verdict.verdict);},
  validateBeforeJudge:judge=>{if(judge==="jd-judge-b")throw Error("segundo juez bloqueado");}
 }),/segundo juez bloqueado/u);
 assert.deepEqual(recorded,["jd-judge-a:pass"]);assert.equal(models.calls.length,1);
 closeWorkspaceReview(workspace);
});
test("Un fallo guardando el primer resultado impide la segunda llamada",async t=>{
 const {workspace,evidence}=fixture(t),models=registry();
 await assert.rejects(()=>runJudgmentDay({registry:models.value,author,judgeA:a,judgeB:b,evidence,requirements:"Revisar",
  onJudgeResult:()=>{throw Error("diario no disponible");}
 }),/diario no disponible/u);
 assert.equal(models.calls.length,1);
 closeWorkspaceReview(workspace);
});
