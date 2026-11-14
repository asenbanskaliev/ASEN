import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import {planWorkUnitBoundary,type ReadyWorkUnitBoundary} from "../src/delivery/work-unit-policy.js";
import {recordCompletedWorkUnit} from "../src/delivery/work-unit-evidence.js";
import {recordWorkUnitReviewCandidate} from "../src/delivery/work-unit-review-candidate.js";
import {assertOrdinaryReviewCheckoutGenuine,claimOrdinaryReviewCheckout,claimOrdinaryReviewRequest} from "../src/review/ordinary-review-controller.js";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";

type Command=Parameters<Parameters<typeof registerOrdinaryReviewCommand>[0]>[1];
type BaseContext=Parameters<Command["handler"]>[1];
interface Component{render(width:number):string[];invalidate():void;handleInput?(data:string):void}
type Custom=(factory:(tui:{requestRender():void},theme:unknown,bindings:{matches(data:string,action:"tui.select.cancel"|"tui.select.confirm"):boolean}|undefined,done:(value:unknown)=>void)=>Component)=>Promise<unknown>;
type Context=BaseContext&{ui:BaseContext["ui"]&{custom?:Custom}};
const tracker="odd/tasks/ui-runtime-delivery-order.md",repositoryIdentity="https://github.com/acme/asen";
const success="Candidato y sesión verificados; revisión nativa RDD pendiente. No hay autorización de entrega.";
const scopeError={message:"Review scope or candidate changed; no view published"};
function git(root:string,...args:string[]):string{return execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
function setup(t:TestContext,kind:"commit"|"pr_slice"="commit",onModal?:(component:Component,closed:()=>number)=>void|Promise<void>){
 const parent=realpathSync(mkdtempSync(join(tmpdir(),"asen-review-command-ui-"))),root=join(parent,"repository");mkdirSync(root);
 t.after(()=>rmSync(parent,{recursive:true,force:true}));git(root,"init","-q");
 const commit=()=>git(root,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","test(review): candidate");commit();commit();
 const revision=git(root,"rev-parse","HEAD"),treeIdentity=git(root,"rev-parse","HEAD^{tree}"),parentIdentity=git(root,"rev-parse","HEAD^");
 const paths=["src/review/ordinary-review-command.ts","tests/ordinary-review-command-ui.test.ts","README.md",tracker];
 const boundary=planWorkUnitBoundary({featureIdentity:"R21-RV1",taskIdentity:"review-command-ui",taskDocumentPath:tracker,purpose:"Wire the candidate-only command view",behaviorIds:["candidate-only-modal"],currentBranch:"feat/review-command-ui",defaultBranch:"main",authoredAdditions:180,authoredDeletions:0,expectedChangedPaths:paths,rollbackBoundaries:["Revert candidate command view"],generatedArtifacts:[],previousReviewedBoundary:null,focusedTests:{kind:"required"},runtimeHarness:{kind:"n_a",reason:"Public command fixture"},documentation:{kind:"required"},deliveryRelationship:{kind:"single"}}) as ReadyWorkUnitBoundary;
 const record=recordCompletedWorkUnit(boundary,{featureIdentity:boundary.featureIdentity,taskIdentity:boundary.taskIdentity,taskDocumentPath:tracker,boundaryId:boundary.boundaryId,repositoryIdentity,purpose:boundary.purpose,deliveryRelationship:boundary.deliveryRelationship,previousReviewedBoundary:null,rollbackBoundary:boundary.rollbackBoundaries[0]!,commit:{identity:revision,treeIdentity,parentIdentity,message:"feat(review): candidate view",currentTreeIdentity:treeIdentity},authoredAdditions:180,authoredDeletions:0,changedPaths:[...boundary.expectedChangedPaths],behaviorPaths:[paths[0]!],focusedTestPaths:[paths[1]!],documentationPaths:["README.md"],generatedArtifacts:[],focusedTests:{status:"pass",command:"node --import tsx --test tests/ordinary-review-command-ui.test.ts",scenario:"Public fixture evidence",exitCode:0,summary:"Focused checks passed"},runtimeHarness:{status:"n_a",reason:"Public command fixture"},documentation:{status:"required",paths:["README.md"]},taskDocumentCommitIdentity:revision});
 const candidate=recordWorkUnitReviewCandidate(record,{kind,identity:kind==="commit"?revision:`${repositoryIdentity}/pull/1`,revision,treeIdentity,repositoryIdentity,featureIdentity:record.featureIdentity,taskIdentity:record.taskIdentity,taskDocumentPath:tracker,boundaryId:record.boundaryId,previousReviewedBoundary:null,deliveryRelationship:record.deliveryRelationship});
 let command:Command|undefined;const controller=registerOrdinaryReviewCommand((name,value)=>{assert.equal(name,"asen-review");command=value;});assert.ok(command);
 const request=controller.prepare(candidate,{authorId:"PRIVATE_AUTHOR",reviewerId:"PRIVATE_REVIEWER",sessionId:"session"});
 let sessionId="session",opens=0,closes=0,providerReads=0;const messages:Array<[string,string]>=[];
 const custom:Custom=async factory=>{opens++;const component=factory({requestRender(){}},{},{matches:(data,action)=>data===`host:${action}`},()=>{closes++;});await onModal?.(component,()=>closes);return undefined;};
 const context:Context={cwd:realpathSync(root),hasUI:true,sessionManager:{getSessionId:()=>sessionId},ui:{notify:(message,level)=>messages.push([message,level]),custom}};
 for(const key of ["modelRegistry","model"])Object.defineProperty(context,key,{get(){providerReads++;throw new Error("Candidate display must not read provider state");}});
 return {command,request,context,root:realpathSync(root),revision,treeIdentity,parentIdentity,commit,messages,opens:()=>opens,closes:()=>closes,providerReads:()=>providerReads,setSession:(value:string)=>{sessionId=value;}};
}
function expected(state:ReturnType<typeof setup>,kind:"commit"|"pr_slice"):string[]{return [`Review candidate: ${kind}`,`Revision: ${state.revision}`,`Tree: ${state.treeIdentity}`,`Parent: ${state.parentIdentity}`,"Review state: review-needed","Native status: unavailable","Native acknowledgement: not-acknowledged","Delivery approval: not-approved"];}
function noSuccess(state:ReturnType<typeof setup>){assert.deepEqual(state.messages,[]);assert.equal(state.providerReads(),0);assert.throws(()=>state.command.handler(state.request.requestId,state.context),{message:"No existe solicitud pendiente en esta instancia de ASEN"});}

test("public prepared command renders both exact candidate kinds, closes through host keys and preserves checkout provenance",async t=>{
 for(const kind of ["commit","pr_slice"] as const){const frames:string[][]=[];const state=setup(t,kind,(component,closed)=>{const lines=component.render(140);frames.push(lines);component.handleInput?.(`host:tui.select.${kind==="commit"?"cancel":"confirm"}`);assert.equal(closed(),1);});
  const result=await state.command.handler(state.request.requestId,state.context);assertOrdinaryReviewCheckoutGenuine(result);
  assert.equal(state.opens(),1);assert.deepEqual(frames,[expected(state,kind)]);assert.doesNotMatch(frames.flat().join("\n"),/PRIVATE_|example\.invalid|repository|findings|PASS/u);
  assert.deepEqual(state.messages,[[success,"info"]]);assert.equal(state.providerReads(),0);assert.equal(git(state.root,"status","--porcelain"),"");assert.equal(git(state.root,"rev-parse","HEAD"),state.revision);
  assert.equal(claimOrdinaryReviewCheckout(result),result);assert.throws(()=>claimOrdinaryReviewCheckout(result));
 }
});

test("no UI or no custom capability preserves the synchronous checkout and notification",t=>{
 for(const unavailable of ["headless","missing-custom"] as const){const state=setup(t);if(unavailable==="headless")state.context.hasUI=false;else delete state.context.ui.custom;
  const result=state.command.handler(state.request.requestId,state.context);assert.equal(result instanceof Promise,false);assertOrdinaryReviewCheckoutGenuine(result);
  assert.equal(claimOrdinaryReviewCheckout(result),result);assert.equal(state.opens(),0);assert.equal(state.providerReads(),0);assert.deepEqual(state.messages,[[success,"info"]]);assert.equal(git(state.root,"status","--porcelain"),"");
 }
});

test("abort before or during the modal publishes no later candidate labels or success",async t=>{
 for(const when of ["before","during"] as const){const abort=new AbortController(),frames:string[][]=[];const state=setup(t,"commit",component=>{abort.abort();frames.push(component.render(140));component.handleInput?.("host:tui.select.cancel");});state.context.signal=abort.signal;if(when==="before")abort.abort();
  await assert.rejects(Promise.resolve().then(()=>state.command.handler(state.request.requestId,state.context)),scopeError);
  assert.deepEqual(frames,when==="before"?[]:[["Review unavailable"]]);assert.equal(state.opens(),when==="before"?0:1);noSuccess(state);assert.equal(git(state.root,"status","--porcelain"),"");
 }
});

test("session, manager, active root and signal drift fail closed at subsequent UI boundaries",async t=>{
 for(const drift of ["session","manager","cwd","signal"] as const){const frames:string[][]=[];const other=drift==="cwd"?setup(t):undefined;const state=setup(t,"commit",component=>{frames.push(component.render(140));
  if(drift==="session")state.setSession("other");else if(drift==="manager")state.context.sessionManager={getSessionId:()=>"session"};else if(drift==="cwd")state.context.cwd=other!.root;else state.context.signal=new AbortController().signal;
  frames.push(component.render(140));component.handleInput?.("host:tui.select.cancel");});state.context.signal=new AbortController().signal;
  await assert.rejects(Promise.resolve().then(()=>state.command.handler(state.request.requestId,state.context)),scopeError);
  assert.deepEqual(frames,[expected(state,"commit"),["Review unavailable"]]);noSuccess(state);assert.equal(git(state.root,"status","--porcelain"),"");assert.equal(git(state.root,"rev-parse","HEAD"),state.revision);
 }
});

test("dirty or stale Git during the modal invalidates further display without extra writes or approval",async t=>{
 for(const change of ["dirty","stale"] as const){const frames:string[][]=[];let changedHead="",changedStatus="";const state=setup(t,"commit",component=>{frames.push(component.render(140));if(change==="dirty")writeFileSync(join(state.root,"PRIVATE.txt"),"PRIVATE DATA");else state.commit();changedHead=git(state.root,"rev-parse","HEAD");changedStatus=git(state.root,"status","--porcelain");frames.push(component.render(140));component.handleInput?.("host:tui.select.cancel");});
  await assert.rejects(Promise.resolve().then(()=>state.command.handler(state.request.requestId,state.context)),scopeError);assert.deepEqual(frames,[expected(state,"commit"),["Review unavailable"]]);noSuccess(state);
  assert.equal(git(state.root,"rev-parse","HEAD"),changedHead);assert.equal(git(state.root,"status","--porcelain"),changedStatus);assert.equal(change==="dirty"?changedStatus:"",change==="dirty"?"?? PRIVATE.txt":"");
 }
});

test("binding and pre-binding host failures retain the exact rejection and retire the prepared request",t=>{
 for(const failure of ["session","host"] as const){const state=setup(t);if(failure==="session")state.setSession("foreign");else state.context.sessionManager={getSessionId(){throw new Error("PRIVATE HOST FAILURE");}};
  assert.throws(()=>state.command.handler(state.request.requestId,state.context),{message:"Solicitud de revisión rechazada y retirada"});
  assert.deepEqual(state.messages,[["No se pudo verificar la solicitud; se requiere una preparación nueva.","error"]]);assert.equal(state.opens(),0);assert.equal(state.providerReads(),0);
  assert.throws(()=>claimOrdinaryReviewRequest(state.request,"session"),{message:"La preparación ya fue consumida"});assert.throws(()=>state.command.handler(state.request.requestId,state.context),{message:"No existe solicitud pendiente en esta instancia de ASEN"});
  assert.equal(git(state.root,"status","--porcelain"),"");assert.equal(git(state.root,"rev-parse","HEAD"),state.revision);
 }
});

test("usage and unavailable workspace mode retain prior behavior without consuming the prepared request",async t=>{
 const state=setup(t);state.context.hasUI=false;assert.equal(state.command.handler("invalid",state.context),"Uso: /asen-review <solicitud-id> | /asen-review workspace | /asen-review native status | /asen-review native assess (solo lectura; revisión manual ASEN no es aprobación Go)");
 const legacyContext={cwd:state.root,hasUI:false,sessionManager:state.context.sessionManager,ui:state.context.ui};const unavailable=await state.command.handler("workspace",legacyContext);assert.deepEqual(unavailable,{status:"unavailable",reason:"Revisión independiente no disponible: se requiere una sesión Pi interactiva, modelo autor conocido y un modelo revisor autenticado distinto."});
 const result=state.command.handler(state.request.requestId,state.context);assertOrdinaryReviewCheckoutGenuine(result);assert.equal(claimOrdinaryReviewCheckout(result),result);assert.equal(state.opens(),0);assert.equal(state.providerReads(),0);assert.deepEqual(state.messages,[["Uso: /asen-review <solicitud-id> | /asen-review workspace | /asen-review native status | /asen-review native assess (solo lectura; revisión manual ASEN no es aprobación Go)","info"],["Revisión independiente no disponible: se requiere una sesión Pi interactiva, modelo autor conocido y un modelo revisor autenticado distinto.","error"],[success,"info"]]);assert.equal(git(state.root,"status","--porcelain"),"");
});
