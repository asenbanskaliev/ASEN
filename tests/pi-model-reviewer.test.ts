import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {availableIndependentPiReviewers,runIndependentPiReview,type PiReviewRegistry,type PiReviewEvent,type PiReviewerModel} from "../src/review/pi-model-reviewer.js";

const author={provider:"provider-a",id:"writer"},reviewer={provider:"provider-b",id:"reviewer"};
function fixture(t:unknown,sensitivePath?:string){
 const root=mkdtempSync(join(tmpdir(),"asen-pi-reviewer-repo-")),parent=mkdtempSync(join(tmpdir(),"asen-pi-reviewer-view-"));
 (t as {after(callback:()=>void):void}).after(()=>{rmSync(root,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"src.txt"),"before\n");git("add","src.txt");git("commit","-qm","base");
 if(sensitivePath){writeFileSync(join(root,sensitivePath),"sensitive-test-marker\n");git("add",sensitivePath);git("commit","-qm","add sensitive path");writeFileSync(join(root,sensitivePath),"changed sensitive-test-marker\n");}
 writeFileSync(join(root,"src.txt"),"after\n");
 const workspace=openWorkspaceReview({repositoryRoot:resolve(root),intendedUntracked:[],sessionId:"s",reviewerId:"provider-b/reviewer",viewParent:resolve(parent),risk:{riskId:"T05",reason:"test review",severity:"high",lenses:["risk"]}});
 return {workspace,evidence:readWorkspaceReviewEvidence(workspace)};
}
function response(verdict:"pass"|"fail"="pass",findings:unknown[]=[]):string{return JSON.stringify({verdict,summary:"Reviewed exact candidate bytes",findings});}
function registry(text:string,events:PiReviewEvent[]=[{type:"done",reason:"stop",message:{content:[{type:"text",text}],provider:"provider-b",role:"assistant"}}]){
 let call:{model:PiReviewerModel;context:unknown;options:unknown}|undefined;
 const value:PiReviewRegistry={getAvailable:()=>[author,reviewer],hasConfiguredAuth:model=>model.provider==="provider-b",
  streamSimple:(model,context,options)=>{call={model,context,options};return (async function*(){for(const event of events)yield event;})();}
 };
 return {value,called:()=>call};
}

test("uses a fresh no-tools model call over genuine complete candidate evidence",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response()),available=availableIndependentPiReviewers(models.value,author);
 assert.deepEqual(available,[reviewer]);
 const result=await runIndependentPiReview({registry:models.value,model:reviewer,author,evidence,requirements:"Check the exact change",});
 assert.equal(result.verdict,"pass");assert.equal(result.reviewerId,"pi-model:provider-b/reviewer");assert.equal(result.findings.length,0);
 const call=models.called() as {model:PiReviewerModel;context:{systemPrompt:string;messages:unknown[]};options:{maxTokens:number}};
 assert.equal(call.model.id,"reviewer");assert.equal(call.context.messages.length,1);assert.match(call.context.systemPrompt,/untrusted data/u);assert.equal(call.options.maxTokens,2_000);
 assert.equal("tools" in call.context,false);
 const message=call.context.messages[0] as {content:{text:string}[]},payload=JSON.parse(message.content[0]!.text);
 assert.equal(payload.candidate.treeIdentity,evidence.candidate.treeIdentity);assert.equal(payload.candidateFiles[0].content,"after\n");
 closeWorkspaceReview(workspace);
});

test("rejects the author model, unauthenticated models, forged evidence, and malformed pass findings",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response("pass",[{id:"f1",severity:"high",path:"src.txt",description:"bug"}]));
 assert.deepEqual(availableIndependentPiReviewers({getAvailable:()=>[author],hasConfiguredAuth:()=>true,streamSimple:models.value.streamSimple},author),[]);
 await assert.rejects(()=>runIndependentPiReview({registry:models.value,model:author,author,evidence,requirements:"review"}),/unavailable or equals/u);
 await assert.rejects(()=>runIndependentPiReview({registry:models.value,model:reviewer,author,evidence:{...evidence},requirements:"review"}),/controller-issued/u);
 await assert.rejects(()=>runIndependentPiReview({registry:models.value,model:reviewer,author,evidence,requirements:"review"}),/blocking findings/u);
 closeWorkspaceReview(workspace);
});

test("requires findings for FAIL and rejects reviewer tool use",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response("fail"));
 await assert.rejects(()=>runIndependentPiReview({registry:models.value,model:reviewer,author,evidence,requirements:"review"}),/requires at least one finding/u);
 const toolCall=registry("",[{type:"toolcall_start"}]);
 await assert.rejects(()=>runIndependentPiReview({registry:toolCall.value,model:reviewer,author,evidence,requirements:"review"}),/tool call/u);
 closeWorkspaceReview(workspace);
});

test("refuses sensitive-path evidence before calling the external reviewer",async t=>{
 const {workspace,evidence}=fixture(t,".env.local"),models=registry(response());
 await assert.rejects(()=>runIndependentPiReview({registry:models.value,model:reviewer,author,evidence,requirements:"review"}),/sensitive path/u);
 assert.equal(models.called(),undefined);
 closeWorkspaceReview(workspace);
});
