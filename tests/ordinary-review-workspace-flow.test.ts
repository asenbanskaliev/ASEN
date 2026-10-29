import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {chmodSync,cpSync,mkdirSync,mkdtempSync,readdirSync,renameSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerOrdinaryReviewCommand} from "../src/review/ordinary-review-command.js";
import type {PiReviewEvent,PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";

const author={provider:"author-provider",id:"writer"},reviewer1={provider:"review-provider",id:"reviewer-one"},reviewer2={provider:"review-provider",id:"reviewer-two"};
function repo(t:unknown){
 const root=mkdtempSync(join(tmpdir(),"asen-public-review-flow-"));(t as {after(callback:()=>void):void}).after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");writeFileSync(join(root,"target.txt"),"before\n");git("add","target.txt");git("commit","-qm","base");writeFileSync(join(root,"target.txt"),"first candidate\n");
 return {root:resolve(root)};
}
function setup(t:unknown,responses:readonly {verdict:"pass"|"fail";findings:readonly unknown[]}[]){
 const {root}=repo(t),commands=new Map<string,any>(),messages:string[]=[];registerOrdinaryReviewCommand((name,command)=>commands.set(name,command));
 let calls=0,selected:PiReviewerModel|undefined;
 const registry:PiReviewRegistry={getAvailable:()=>[author,reviewer1,reviewer2],hasConfiguredAuth:model=>model.provider!=="author-provider",
  streamSimple:(model,_context,_options)=>{selected=model;const answer=responses[calls++]!;return (async function*(){
   yield {type:"done" as const,reason:"stop" as const,message:{content:[{type:"text",text:JSON.stringify({verdict:answer.verdict,summary:"Reviewed exact diff",findings:answer.findings})}],role:"assistant",provider:model.provider}};
  })();}
 };
 const context={cwd:root,hasUI:true,modelRegistry:registry,model:author,sessionManager:{getSessionId:()=>"session-1"},
  ui:{notify:(message:string)=>messages.push(message),select:async(_title:string,options:string[])=>options[0],editor:async(title:string):Promise<string>=>title.includes("untracked")?"[]":title.includes("Rutas exactas")?'["target.txt"]':"Check the task requirements",confirm:async()=>true}};
 return {handler:commands.get("asen-review").handler,context,messages,calls:()=>calls,selected:()=>selected};
}

test("public Pi command runs independent review then one path-bounded correction and new reviewer",async t=>{
 const state=setup(t,[
  {verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"The changed behavior is wrong."}]},
  {verdict:"pass",findings:[]},
 ]);
 const first=await state.handler("workspace",state.context);
 assert.equal(first.status,"correction-required");assert.deepEqual(first.allowedCorrectionPaths,["target.txt"]);assert.ok(first.correctionId);
 assert.equal(state.selected()?.id,"reviewer-one");assert.equal(first.acceptance,"not-accepted");assert.equal(first.deliveryAuthority,false);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const second=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(second.status,"corrected-passed-awaiting-tests");assert.equal(second.correction.validation,"pass");
 assert.equal(second.candidate.treeIdentity!==first.candidate.treeIdentity,true);
 assert.equal(second.reviewerId,"pi-model:review-provider/reviewer-two");assert.equal(second.tests.status,"not-run");assert.equal(second.acceptance,"not-accepted");
 assert.equal(state.calls(),2);assert.equal(state.messages.length,2);
});

test("bounded correction blocks newly changed files outside reviewer findings",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Correct this changed file."}]},{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context);writeFileSync(join(state.context.cwd,"target.txt"),"corrected\n");writeFileSync(join(state.context.cwd,"other.txt"),"out of scope\n");
 execFileSync("git",["-C",state.context.cwd,"add","other.txt"]);
 const second=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(second.status,"blocked");assert.deepEqual(second.allowedPaths,["target.txt"]);assert.deepEqual(second.outsideReview,["other.txt"]);assert.equal(state.calls(),1);
 execFileSync("git",["-C",state.context.cwd,"rm","--cached","-q","other.txt"]);unlinkSync(join(state.context.cwd,"other.txt"));
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");assert.equal(state.calls(),1);
});

test("correction change inside the original review scope but outside findings is blocked before Git writes and view creation",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Correct this changed file."}]}]);
 const root=state.context.cwd;
 writeFileSync(join(root,"other.txt"),"original other\n");
 execFileSync("git",["-C",root,"add","other.txt"]);execFileSync("git",["-C",root,"commit","-qm","add other file"]);
 state.context.ui.editor=async title=>title.includes("untracked")?"[]":title.includes("Rutas exactas")?'["target.txt","other.txt"]':"Check the task requirements";
 const first=await state.handler("workspace",state.context);assert.equal(first.status,"correction-required");
 const target="new corrected target for preflight\n",outside="unapproved correction delta for preflight\n";
 writeFileSync(join(root,"target.txt"),target);writeFileSync(join(root,"other.txt"),outside);
 const oid=(input:string)=>execFileSync("git",["-C",root,"hash-object","--stdin"],{input,encoding:"utf8"}).trim();
 const has=(id:string)=>{try{execFileSync("git",["-C",root,"cat-file","-e",id],{stdio:"ignore"});return true;}catch{return false;}};
 const ids=[oid(target),oid(outside)];assert.deepEqual(ids.map(has),[false,false]);
 const parent=mkdtempSync(join(tmpdir(),"asen-correction-preflight-")),prior=process.env.TMPDIR;
 try{
  process.env.TMPDIR=parent;
  const result=await state.handler("workspace correction "+first.correctionId,state.context);
  assert.equal(result.status,"blocked");assert.deepEqual(result.outsideReview,["other.txt"]);
  assert.deepEqual(result.allowedPaths,["target.txt"]);assert.equal(state.calls(),1);
  assert.deepEqual(ids.map(has),[false,false]);assert.deepEqual(readdirSync(parent),[]);
 }finally{if(prior===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=prior;rmSync(parent,{recursive:true,force:true});}
});

test("unchanged correction blocks before materialization and can be retried after a real fix",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Correct this changed file."}]},{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context);assert.equal(first.status,"correction-required");
 const parent=mkdtempSync(join(tmpdir(),"asen-correction-unchanged-")),prior=process.env.TMPDIR;
 try{
  process.env.TMPDIR=parent;
  const blocked=await state.handler("workspace correction "+first.correctionId,state.context);
  assert.equal(blocked.status,"blocked");assert.deepEqual(blocked.changedPaths,[]);assert.equal(state.calls(),1);assert.deepEqual(readdirSync(parent),[]);
  writeFileSync(join(state.context.cwd,"target.txt"),"corrected after retry\n");
  const result=await state.handler("workspace correction "+first.correctionId,state.context);
  assert.equal(result.status,"corrected-passed-awaiting-tests");assert.equal(state.calls(),2);
 }finally{if(prior===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=prior;rmSync(parent,{recursive:true,force:true});}
});

test("unexpected untracked files block dispatch to the external reviewer",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);writeFileSync(join(state.context.cwd,"outside-scope.txt"),"must not be sent");
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"blocked");assert.deepEqual(result.unexpectedFiles,["outside-scope.txt"]);assert.equal(state.calls(),0);
});

test("a modified tracked file outside the selected review scope blocks model dispatch",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd;
 writeFileSync(join(root,"outside.txt"),"before\n");
 execFileSync("git",["-C",root,"add","outside.txt"]);execFileSync("git",["-C",root,"commit","-qm","add outside file"]);
 writeFileSync(join(root,"outside.txt"),"after\n");
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"blocked");assert.deepEqual(result.outsideReview,["outside.txt"]);assert.equal(state.calls(),0);
});

test("a deleted tracked file outside the selected review scope blocks model dispatch",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd;
 writeFileSync(join(root,"outside.txt"),"before\n");
 execFileSync("git",["-C",root,"add","outside.txt"]);execFileSync("git",["-C",root,"commit","-qm","add outside file"]);
 unlinkSync(join(root,"outside.txt"));
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"blocked");assert.deepEqual(result.outsideReview,["outside.txt"]);assert.equal(state.calls(),0);
});

test("an explicitly included untracked file must also be selected for review",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);writeFileSync(join(state.context.cwd,"new.txt"),"new\n");
 state.context.ui.editor=async(title:string)=>title.includes("untracked")?'["new.txt"]':title.includes("Rutas exactas")?'["target.txt"]':"Check the task requirements";
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"blocked");assert.deepEqual(result.outsideReview,["new.txt"]);assert.equal(state.calls(),0);
});

test("selected tracked deletion is reviewed and a correction retains the original selection",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Restore the required behavior."}]},{verdict:"pass",findings:[]}]);
 unlinkSync(join(state.context.cwd,"target.txt"));
 const first=await state.handler("workspace",state.context);
 assert.equal(first.status,"correction-required");assert.equal(state.calls(),1);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected\n");
 state.context.ui.editor=async()=>{throw new Error("correction must retain its original review scope");};
 const second=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(second.status,"corrected-passed-awaiting-tests");assert.equal(second.acceptance,"not-accepted");assert.equal(state.calls(),2);
});

test("selected scope can include both sides of a file-to-directory replacement",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd;
 unlinkSync(join(root,"target.txt"));mkdirSync(join(root,"target.txt"));writeFileSync(join(root,"target.txt","nested.txt"),"new\n");
 execFileSync("git",["-C",root,"add","-A"]);
 state.context.ui.editor=async(title:string)=>title.includes("untracked")?"[]":title.includes("Rutas exactas")?'["target.txt","target.txt/nested.txt"]':"Check the task requirements";
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"passed-awaiting-tests");assert.equal(result.acceptance,"not-accepted");assert.equal(state.calls(),1);
});

test("selected scope can include both sides of a case-only rename",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd;
 execFileSync("git",["-C",root,"mv","target.txt","TARGET.txt"]);
 state.context.ui.editor=async(title:string)=>title.includes("untracked")?"[]":title.includes("Rutas exactas")?'["target.txt","TARGET.txt"]':"Check the task requirements";
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"passed-awaiting-tests");assert.equal(result.acceptance,"not-accepted");assert.equal(state.calls(),1);
});

test("duplicate and unsafe review scope paths are rejected before provider dispatch",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);
 for(const paths of ['["target.txt","target.txt"]','["../outside"]']){
  state.context.ui.editor=async(title:string)=>title.includes("Rutas exactas")?paths:"Check the task requirements";
  await assert.rejects(()=>state.handler("workspace",state.context),/alcance de revisión/u);
 }
 assert.equal(state.calls(),0);
});

test("real submodules remain fail-closed even when unchanged or staged with a new commit",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd;
 const child=mkdtempSync(join(tmpdir(),"asen-review-submodule-"));t.after(()=>rmSync(child,{recursive:true,force:true}));
 const git=(where:string,...args:string[])=>execFileSync("git",["-C",where,...args],{stdio:"ignore"});
 git(child,"init","-q");git(child,"config","user.name","ASEN test");git(child,"config","user.email","asen@example.invalid");
 writeFileSync(join(child,"child.txt"),"one\n");git(child,"add","child.txt");git(child,"commit","-qm","initial");
 git(root,"-c","protocol.file.allow=always","submodule","add","-q",child,"linked");git(root,"add",".gitmodules","linked");git(root,"commit","-qm","add submodule");
 await assert.rejects(()=>state.handler("workspace",state.context),/links and gitlinks/u);assert.equal(state.calls(),0);
 const linked=join(root,"linked");writeFileSync(join(linked,"child.txt"),"two\n");git(linked,"add","child.txt");git(linked,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","-qm","changed");git(root,"add","linked");
 await assert.rejects(()=>state.handler("workspace",state.context),/changed gitlinks cannot be projected/u);assert.equal(state.calls(),0);
});

test("interrupted reviewer leaves no approval and a retry reviews the current candidate once",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]},{verdict:"pass",findings:[]}]),controller=new AbortController();
 Object.assign(state.context,{signal:controller.signal});
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){for await(const event of events){controller.abort();yield event;}})();};
 await assert.rejects(()=>state.handler("workspace",state.context),/cancelled/u);
 assert.equal(state.calls(),1);assert.equal(state.messages.length,0);
 delete (state.context as typeof state.context&{signal?:AbortSignal}).signal;
 const retry=await state.handler("workspace",state.context);
 assert.equal(retry.status,"passed-awaiting-tests");assert.equal(retry.acceptance,"not-accepted");
 assert.equal(state.calls(),2);assert.equal(state.messages.length,1);
});

test("concurrent workspace mutation while the reviewer is running invalidates its candidate",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){
  for await(const event of events){
   writeFileSync(join(state.context.cwd,"target.txt"),"concurrent edit during review\n");
   yield event;
  }
 })();};
 await assert.rejects(()=>state.handler("workspace",state.context),/candidate is stale|source changed|projection changed|candidate drifted/iu);
 assert.equal(state.calls(),1);
 assert.equal(state.messages.length,0,"a stale reviewer response must not be presented as a result");
});

test("changes during the consent dialog stop dispatch to the reviewer",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);
 state.context.ui.confirm=async()=>{writeFileSync(join(state.context.cwd,"target.txt"),"changed while waiting for consent\n");return true;};
 await assert.rejects(()=>state.handler("workspace",state.context),/stale|drift|changed/u);
 assert.equal(state.calls(),0);assert.equal(state.messages.length,0);
});

test("a replaced project during selection is rejected before consent or reviewer dispatch",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),root=state.context.cwd,original=root+"-original";
 t.after(()=>rmSync(original,{recursive:true,force:true}));let confirmations=0;
 state.context.ui.select=async(_title,options)=>{renameSync(root,original);cpSync(original,root,{recursive:true});return options[0];};
 state.context.ui.confirm=async()=>{confirmations++;return true;};
 await assert.rejects(()=>state.handler("workspace",state.context),/session or project changed/u);
 assert.equal(confirmations,0);assert.equal(state.calls(),0);
});

test("a session change while the reviewer is running invalidates the correction",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]},{verdict:"pass",findings:[]}]);
 let sessionId="session-1";state.context.sessionManager.getSessionId=()=>sessionId;
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){
  for await(const event of events){yield event;sessionId="session-2";}
 })();};
 await assert.rejects(()=>state.handler("workspace correction "+first.correctionId,state.context),/session or project changed/u);
 assert.equal(state.messages.length,1);sessionId="session-1";
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");assert.equal(state.calls(),2);
});

test("a declined correction with workspace drift invalidates its previous request",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]}]);
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 state.context.ui.confirm=async()=>{writeFileSync(join(state.context.cwd,"target.txt"),"changed during consent\n");return false;};
 await assert.rejects(()=>state.handler("workspace correction "+first.correctionId,state.context),/stale|drift|changed/u);
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");assert.equal(state.calls(),1);
});

test("cancellation after the final reviewer event cannot bind or notify a result",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]),controller=new AbortController();
 Object.assign(state.context,{signal:controller.signal});
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){
  for await(const event of events)yield event;
  controller.abort();
 })();};
 await assert.rejects(()=>state.handler("workspace",state.context),/cancelled/u);
 assert.equal(state.calls(),1);assert.equal(state.messages.length,0);
});

test("cancelled correction review can be retried, but concurrent attempts remain blocked",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]},{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const select=state.context.ui.select;
 let release!:()=>void,entered!:()=>void;
 const selected=new Promise<void>(resolve=>{entered=resolve;});
 state.context.ui.select=async()=>{entered();return await new Promise<undefined>(resolve=>{release=()=>resolve(undefined);});};
 const pending=state.handler("workspace correction "+first.correctionId,state.context);
 await selected;
 const parallel=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(parallel.status,"blocked");assert.equal(state.calls(),1);
 release();assert.equal((await pending).status,"cancelled");
 state.context.ui.select=select;
 const retry=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(retry.status,"corrected-passed-awaiting-tests");assert.equal(retry.reviewerId,"pi-model:review-provider/reviewer-two");
 assert.equal(retry.acceptance,"not-accepted");assert.equal(state.calls(),2);
 const reused=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(reused.status,"blocked");
});

test("an interrupted correction response requires a fresh review before it can pass",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]},{verdict:"pass",findings:[]},{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const controller=new AbortController(),registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 Object.assign(state.context,{signal:controller.signal});
 registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){for await(const event of events)yield event;controller.abort();})();};
 await assert.rejects(()=>state.handler("workspace correction "+first.correctionId,state.context),/cancelled/u);
 assert.equal(state.calls(),2);assert.equal(state.messages.length,1);
 registry.streamSimple=stream;delete (state.context as typeof state.context&{signal?:AbortSignal}).signal;
 const retry=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(retry.status,"corrected-passed-awaiting-tests");assert.equal(retry.acceptance,"not-accepted");assert.equal(state.calls(),3);
});

test("a duplicate initial review cannot replace an in-flight correction",async t=>{
 const failure={verdict:"fail" as const,findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]};
 const state=setup(t,[failure,failure,{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context),select=state.context.ui.select;
 let release!:()=>void,entered!:()=>void;
 const selected=new Promise<void>(resolve=>{entered=resolve;});
 state.context.ui.select=async()=>{entered();return await new Promise<undefined>(resolve=>{release=()=>resolve(undefined);});};
 const pending=state.handler("workspace correction "+first.correctionId,state.context);
 await selected;state.context.ui.select=select;
 const duplicate=await state.handler("workspace",state.context);
 assert.equal(duplicate.status,"correction-required");assert.notEqual(duplicate.correctionId,first.correctionId);
 const parallel=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(parallel.status,"blocked");
 release();assert.equal((await pending).status,"cancelled");
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const retry=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(retry.status,"corrected-passed-awaiting-tests");assert.equal(state.calls(),3);
});

test("a correction cannot reuse a review after the Git base changes",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]}]);
 const first=await state.handler("workspace",state.context);
 const oldBase=execFileSync("git",["-C",state.context.cwd,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 execFileSync("git",["-C",state.context.cwd,"add","target.txt"]);
 execFileSync("git",["-C",state.context.cwd,"commit","-qm","advance base"]);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const result=await state.handler("workspace correction "+first.correctionId,state.context);
 assert.equal(result.status,"blocked");assert.match(result.reason,/base del candidato cambi/iu);assert.equal(state.calls(),1);
 execFileSync("git",["-C",state.context.cwd,"update-ref","HEAD",oldBase]);
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");assert.equal(state.calls(),1);
});

test("a correction is invalidated when its repository is replaced by an identical clone",async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]}]);
 const first=await state.handler("workspace",state.context),root=state.context.cwd,original=root+"-original";
 t.after(()=>rmSync(original,{recursive:true,force:true}));
 renameSync(root,original);cpSync(original,root,{recursive:true});
 writeFileSync(join(root,"target.txt"),"corrected candidate\n");
 await assert.rejects(()=>state.handler("workspace correction "+first.correctionId,state.context),/repository changed/u);
 rmSync(root,{recursive:true,force:true});renameSync(original,root);
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");assert.equal(state.calls(),1);
});

test("a fresh identical review does not revive an invalidated correction ID",async t=>{
 const failure={verdict:"fail" as const,findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]};
 const state=setup(t,[failure,failure]);
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"outside.txt"),"unexpected\n");
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");
 unlinkSync(join(state.context.cwd,"outside.txt"));
 const fresh=await state.handler("workspace",state.context);
 assert.equal(fresh.status,"correction-required");assert.notEqual(fresh.correctionId,first.correctionId);
 assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");
});

test("a correction started by a failed notification cannot continue after its request is retired",async t=>{
 const failure={verdict:"fail" as const,findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]};
 const state=setup(t,[failure]),select=state.context.ui.select;
 let release!:()=>void,entered!:()=>void,nested:Promise<unknown>|undefined;
 const selected=new Promise<void>(resolve=>{entered=resolve;});
 state.context.ui.notify=(message:string)=>{
  const result=JSON.parse(message) as {correctionId:string};
  state.context.ui.select=async()=>{entered();return await new Promise<string>(resolve=>{release=()=>resolve("review-provider/reviewer-two");});};
  nested=state.handler("workspace correction "+result.correctionId,state.context);
  throw new Error("notification failed");
 };
 await assert.rejects(()=>state.handler("workspace",state.context),/notification failed/u);
 await selected;assert.ok(nested);release();
 await assert.rejects(()=>nested!,/no longer live/u);
 state.context.ui.select=select;assert.equal(state.calls(),1);
});

test("a failed view cleanup cannot announce or reuse a correction result",{skip:process.platform==="win32"?"POSIX fixture mutates directory mode bits":false},async t=>{
 const state=setup(t,[{verdict:"fail",findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]},{verdict:"pass",findings:[]}]);
 const first=await state.handler("workspace",state.context);
 writeFileSync(join(state.context.cwd,"target.txt"),"corrected candidate\n");
 const parent=mkdtempSync(join(tmpdir(),"asen-review-cleanup-test-")),prior=process.env.TMPDIR;
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 try{
  process.env.TMPDIR=parent;
  registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){
   for await(const event of events)yield event;
   const views=readdirSync(parent).filter(name=>name.startsWith("asen-review-view-"));assert.equal(views.length,1);
   const root=join(parent,views[0]!);chmodSync(root,0o700);writeFileSync(join(root,"foreign.txt"),"leave untouched\n");
  })();};
  await assert.rejects(()=>state.handler("workspace correction "+first.correctionId,state.context),/contains unowned data/u);
  assert.equal(state.messages.length,1);assert.equal(state.calls(),2);
  assert.equal((await state.handler("workspace correction "+first.correctionId,state.context)).status,"blocked");
 }finally{
  registry.streamSimple=stream;if(prior===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=prior;
  rmSync(parent,{recursive:true,force:true});
 }
});

test("a failed initial review cleanup emits no finding or correction",{skip:process.platform==="win32"?"POSIX fixture mutates directory mode bits":false},async t=>{
 const failure={verdict:"fail" as const,findings:[{id:"F-1",severity:"high",path:"target.txt",description:"Fix the behavior."}]};
 const state=setup(t,[failure,failure]),parent=mkdtempSync(join(tmpdir(),"asen-review-cleanup-test-")),prior=process.env.TMPDIR;
 const registry=state.context.modelRegistry!,stream=registry.streamSimple.bind(registry);
 try{
  process.env.TMPDIR=parent;
  registry.streamSimple=(model,request,options)=>{const events=stream(model,request,options);return (async function*(){
   for await(const event of events)yield event;
   const views=readdirSync(parent).filter(name=>name.startsWith("asen-review-view-"));assert.equal(views.length,1);
   const root=join(parent,views[0]!);chmodSync(root,0o700);writeFileSync(join(root,"foreign.txt"),"leave untouched\n");
  })();};
  await assert.rejects(()=>state.handler("workspace",state.context),/contains unowned data/u);
  assert.equal(state.messages.length,0);
  registry.streamSimple=stream;
  const fresh=await state.handler("workspace",state.context);
  assert.equal(fresh.status,"correction-required");assert.equal(state.calls(),2);
 }finally{
  registry.streamSimple=stream;if(prior===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=prior;
  rmSync(parent,{recursive:true,force:true});
 }
});
