import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {availableIndependentPiReviewers,runIndependentPiReview,runPiLensReview,isIssuedPiLensReview,type PiReviewRegistry,type PiReviewEvent,type PiReviewerModel} from "../src/review/pi-model-reviewer.js";
import {consolidatePiLensReviews,isIssuedPiLensBundle} from "../src/review/review-results.js";
import type {ReviewLens} from "../src/review/review-risk.js";

const author={provider:"provider-a",id:"writer"},reviewer={provider:"provider-b",id:"reviewer"};
function fixture(t:unknown,sensitivePath?:string,reviewLenses:ReviewLens[]=["risk"]){
 const root=mkdtempSync(join(tmpdir(),"asen-pi-reviewer-repo-")),parent=mkdtempSync(join(tmpdir(),"asen-pi-reviewer-view-"));
 (t as {after(callback:()=>void):void}).after(()=>{rmSync(root,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});});
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"src.txt"),"before\n");git("add","src.txt");git("commit","-qm","base");
 if(sensitivePath){writeFileSync(join(root,sensitivePath),"sensitive-test-marker\n");git("add",sensitivePath);git("commit","-qm","add sensitive path");writeFileSync(join(root,sensitivePath),"changed sensitive-test-marker\n");}
 writeFileSync(join(root,"src.txt"),"after\n");
 const workspace=openWorkspaceReview({repositoryRoot:resolve(root),intendedUntracked:[],sessionId:"s",reviewerId:"provider-b/reviewer",viewParent:resolve(parent),risk:{riskId:"T05",reason:"test review",severity:"high",lenses:reviewLenses}});
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

test("a 4R specialist uses an isolated lens prompt and remains read-only",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response());
 const result=await runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Verify safety",lens:"risk"});
 assert.equal(isIssuedPiLensReview(result),true);
 assert.equal(result.candidateTreeIdentity,evidence.candidate.treeIdentity);
 assert.equal(result.requestId,evidence.requestId);
 const call=models.called() as {context:{systemPrompt:string;messages:unknown[]}};
 assert.match(call.context.systemPrompt,/Specialization: risk/u);
 assert.match(call.context.systemPrompt,/no tools, no edits/u);
 assert.equal("tools" in call.context,false);
 closeWorkspaceReview(workspace);
});

test("unrequested, invented or forged specialist lens cannot use the model",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response());
 await assert.rejects(()=>runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Verify safety",lens:"readability"}),/not present/u);
 await assert.rejects(()=>runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Verify safety",lens:"unknown" as never}),/Unknown independent review lens/u);
 assert.equal(models.called(),undefined);
 closeWorkspaceReview(workspace);
});

test("4R aggregation requires all genuine reports bound to same review request and candidate",async t=>{
 const {workspace,evidence}=fixture(t,undefined,["risk","reliability"]),models=registry(response());
 const a=await runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Review",lens:"risk"});
 const b=await runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Review",lens:"reliability"});
 const expected={requestId:evidence.requestId,sessionId:evidence.sessionId,candidateTreeIdentity:evidence.candidate.treeIdentity,candidateRevision:evidence.candidate.revision,lenses:["risk","reliability"] as ReviewLens[]};
 const bundle=consolidatePiLensReviews(expected,[b,a]);
 assert.equal(isIssuedPiLensBundle(bundle),true);assert.equal(bundle.status,"pass");assert.equal(bundle.deliveryAuthority,false);
 assert.deepEqual(bundle.lenses,["risk","reliability"]);
 await Promise.resolve(assert.throws(()=>consolidatePiLensReviews(expected,[a]),/Incomplete 4R/u));
 assert.throws(()=>consolidatePiLensReviews(expected,[a,a]),/forged, duplicated/u);
 assert.throws(()=>consolidatePiLensReviews(expected,[{...a},b]),/forged, duplicated/u);
 assert.throws(()=>consolidatePiLensReviews({...expected,candidateRevision:"different"},[a,b]),/another candidate/u);
 closeWorkspaceReview(workspace);
});

test("4R preserves blocking findings rather than synthesizing an approval",async t=>{
 const {workspace,evidence}=fixture(t),models=registry(response("fail",[{id:"r1",severity:"high",path:"src.txt",description:"Specific security risk"}]));
 const a=await runPiLensReview({registry:models.value,model:reviewer,author,evidence,requirements:"Security",lens:"risk"});
 const bundle=consolidatePiLensReviews({requestId:evidence.requestId,sessionId:evidence.sessionId,candidateTreeIdentity:evidence.candidate.treeIdentity,candidateRevision:evidence.candidate.revision,lenses:["risk"]},[a]);
 assert.equal(bundle.status,"fail");assert.equal(bundle.findings.length,1);assert.equal(bundle.findings[0]!.finding.severity,"high");
 assert.equal(bundle.acceptance,"not-accepted");
 closeWorkspaceReview(workspace);
});

test("T03 rechaza modelos Pi falsificados, controles y duplicados antes de ofrecer revisión 4R",()=>{
 const valid={provider:"nvidia",id:"meta-llama/llama-3.3-70b-instruct"};
 const malformed:PiReviewerModel[]=[
  {provider:"nvidia\nengancho",id:"modelo"},
  {provider:"nvidia/otro",id:"modelo"},
  {provider:"nvidia",id:"modelo\nmalicioso"},
  {provider:"nvidia",id:"modelo//invalido"},
  {provider:"nvidia",id:"modelo/../escape"},
  {provider:"nvidia",id:""},
  {provider:"nvidia",id:"model\u0000evil"}
 ];
 const unique={provider:"nvidia",id:"modelo-unico"};
 const entries=[author,valid,{...valid},unique,...malformed];
 const eligible=availableIndependentPiReviewers({
  getAvailable:()=>entries,
  hasConfiguredAuth:()=>true,
  streamSimple:()=>{throw new Error("No se debe ejecutar ninguna llamada");}
 },author);
 assert.deepEqual(eligible,[unique]);
 assert.equal(Object.isFrozen(eligible),true);
 assert.equal(Object.isFrozen(eligible[0]!),true);
 assert.deepEqual(availableIndependentPiReviewers({
  getAvailable:()=>malformed,
  hasConfiguredAuth:()=>true,
  streamSimple:()=>{throw new Error("Sin ejecución");}
 },author),[]);
});


test("Excluye modelos virtuales de Pi 1.2 sin llamar al transporte",async t=>{
 const {workspace,evidence}=fixture(t);
 const virtual={provider:"nvidia",id:"alias",api:"pi-virtual"};
 let calls=0;
 const models:PiReviewRegistry={getAvailable:()=>[virtual,reviewer],hasConfiguredAuth:()=>true,streamSimple(){calls++;return (async function*(){})();}};
 assert.deepEqual(availableIndependentPiReviewers(models,author),[reviewer]);
 await assert.rejects(()=>runIndependentPiReview({registry:models,model:virtual,author,evidence,requirements:"Comprobar independencia"}),/unavailable/u);
 assert.equal(calls,0);closeWorkspaceReview(workspace);
});


test("Pi 1.2: el razonamiento separado no forma parte del veredicto y las herramientas siguen bloqueadas",async t=>{
 const {workspace,evidence}=fixture(t);
 const execute=(content:unknown[])=>runIndependentPiReview({registry:registry("",[{type:"done",reason:"stop",message:{content}}]).value,model:reviewer,author,evidence,requirements:"Revisión exacta"});
 const final={type:"text",text:response()};
 const valid=await execute([{type:"thinking",thinking:"No copiar este razonamiento",thinkingSignature:"opaco"},final]);
 assert.equal(valid.verdict,"pass");assert.equal(valid.summary,"Reviewed exact candidate bytes");assert.equal(JSON.stringify(valid).includes("No copiar"),false);
 await assert.rejects(()=>execute([{type:"thinking",thinking:"x".repeat(24001)},final]),/exceeds its bound/u);
 await assert.rejects(()=>execute([{type:"thinking",thinking:"x",name:"write"},final]),/non-text output/u);
 await assert.rejects(()=>execute([{type:"toolCall",id:"1",name:"write",arguments:{}},final]),/non-text output/u);
 await assert.rejects(()=>execute([{type:"thinking",thinking:"{\"verdict\":\"pass\"}"}]),SyntaxError);
 closeWorkspaceReview(workspace);
});
