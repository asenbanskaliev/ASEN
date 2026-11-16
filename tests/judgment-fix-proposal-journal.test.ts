import test,{type TestContext} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {runJudgmentDay} from "../src/review/judgment-day.js";
import {proposeJudgmentFixHandoff} from "../src/review/odd-agent-review-flow.js";
import {JudgmentFixProposalJournal} from "../src/review/judgment-fix-proposal-journal.js";
import type {PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";

const author={provider:"base",id:"writer"},a={provider:"free",id:"juez-a"},b={provider:"free",id:"juez-b"};
function fixture(t:TestContext){
 const root=resolve(mkdtempSync(join(tmpdir(),"asen-fix-record-source-")));
 const view=resolve(mkdtempSync(join(tmpdir(),"asen-fix-record-view-")));
 const base=resolve(mkdtempSync(join(tmpdir(),"asen-fix-record-file-")));
 t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(view,{recursive:true,force:true});rmSync(base,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{
  encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 git("init","-q");git("config","user.name","ASEN prueba");
 git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"code.ts"),"original\n");
 git("add","code.ts");git("commit","-qm","base");
 writeFileSync(join(root,"code.ts"),"modificado\n");
 const workspace=openWorkspaceReview({
  repositoryRoot:root,intendedUntracked:[],sessionId:"s-judge",
  reviewerId:"free/juez-a",viewParent:view,
  risk:{riskId:"judgment",reason:"review",severity:"high",lenses:["risk","reliability"]}
 });
 t.after(()=>{try{closeWorkspaceReview(workspace);}catch{}});
 const evidence=readWorkspaceReviewEvidence(workspace);
 const registry:PiReviewRegistry={
  getAvailable:()=>[author,a,b],
  hasConfiguredAuth:model=>model.provider==="free",
  streamSimple:(_model:PiReviewerModel)=>{
   const result={verdict:"fail",summary:"Se detectaron defectos",
    findings:[{id:"F1",severity:"high",path:"code.ts",description:"No heredar permisos"}]};
   return (async function*(){yield {type:"done" as const,reason:"stop" as const,
    message:{role:"assistant",provider:"free",content:[{type:"text",text:JSON.stringify(result)}]}};})();
  }
 };
 return {evidence,registry,base};
}
test("T08 guarda exactamente un Fix genuino de dos jueces sin crear Writer",async t=>{
 const {evidence,registry,base}=fixture(t);
 const report=await runJudgmentDay({
  registry,author,judgeA:a,judgeB:b,evidence,requirements:"Validar candidato"
 });
 const handoff=proposeJudgmentFixHandoff({report,evidence});
 const journal=new JudgmentFixProposalJournal(join(base,"fix.json"));
 const [one,two]=await Promise.all([journal.record(handoff),journal.record(handoff)]);
 assert.equal(one.id,two.id);
 assert.equal(one.status,"proposal-only");
 assert.equal(one.requiredAction,"new-odd-plan");
 assert.deepEqual(one.paths,["code.ts"]);
 assert.equal(one.autoLaunch,false);
 assert.equal(one.autoMerge,false);
 assert.equal(one.requiresFreshWriterConsent,true);
 assert.equal(one.acceptance,"not-accepted");
 assert.equal(one.modelActual,"unknown");
 assert.equal((await journal.list({
  sessionId:evidence.sessionId,projectId:evidence.candidate.repositoryRoot
 })).length,1);
 assert.deepEqual(await journal.list({
  sessionId:"otra",projectId:evidence.candidate.repositoryRoot
 }),[]);
 const raw=readFileSync(journal.file,"utf8");
 assert.equal(raw.includes("Se detectaron defectos"),false,"No se guarda texto de modelo");
 assert.equal(raw.includes("No heredar permisos"),false,"No se guardan descripciones de hallazgos");
});
test("T08 jamás persiste propuestas fabricadas, no aplicables o corruptas",async t=>{
 const {evidence,registry,base}=fixture(t);
 const report=await runJudgmentDay({
  registry,author,judgeA:a,judgeB:b,evidence,requirements:"Validar"
 });
 const handoff=proposeJudgmentFixHandoff({report,evidence});
 const journal=new JudgmentFixProposalJournal(join(base,"fix.json"));
 await assert.rejects(async()=>journal.record({...handoff}),/not genuine/u);
 await journal.record(handoff);
 const corrupt='{"schema":"asen.judgment-fix-proposals/v1","revision":2,"proposals":[]}';
 writeFileSync(journal.file,corrupt);
 await assert.rejects(async()=>journal.list({
  sessionId:evidence.sessionId,projectId:evidence.candidate.repositoryRoot
 }),/Invalid Fix proposal journal/u);
 assert.equal(readFileSync(journal.file,"utf8"),corrupt,"No se sobrescriben registros corruptos");
});
