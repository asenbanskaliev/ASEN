import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
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
  ui:{notify:(message:string)=>messages.push(message),select:async(_title:string,options:string[])=>options[0],editor:async(title:string)=>title.includes("untracked")?"[]":"Check the task requirements",confirm:async()=>true}};
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
 assert.equal(second.status,"blocked");assert.deepEqual(second.allowedPaths,["target.txt"]);assert.deepEqual(second.changedPaths,["other.txt","target.txt"]);assert.equal(state.calls(),1);
});

test("unexpected untracked files block dispatch to the external reviewer",async t=>{
 const state=setup(t,[{verdict:"pass",findings:[]}]);writeFileSync(join(state.context.cwd,"outside-scope.txt"),"must not be sent");
 const result=await state.handler("workspace",state.context);
 assert.equal(result.status,"blocked");assert.deepEqual(result.unexpectedFiles,["outside-scope.txt"]);assert.equal(state.calls(),0);
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
