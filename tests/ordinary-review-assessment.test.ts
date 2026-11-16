import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {registerOrdinaryReviewCommand,truncateClaim,boundedFindingClaims,REVIEW_FINDING_CLAIM_MAX_BYTES,REVIEW_FINDING_CLAIMS_MAX_BYTES} from "../src/review/ordinary-review-command.js";
import {isIssuedJudgmentFixHandoff} from "../src/review/odd-agent-review-flow.js";
import {createNativeRddControl,type ExecFileResult,type NativeRddObservation} from "../src/review/native-rdd-control.js";
import type {PiReviewRegistry,PiReviewerModel} from "../src/review/pi-model-reviewer.js";
import type {ReviewLens} from "../src/review/review-risk.js";

type Command=Parameters<Parameters<typeof registerOrdinaryReviewCommand>[0]>[1];
const author={provider:"author-provider",id:"writer"},reviewer={provider:"review-provider",id:"reviewer-one"},reviewerTwo={provider:"review-provider",id:"reviewer-two"};
const DEFAULT_LENSES=["risk","resilience","reliability"];
function git(root:string,...args:string[]):string{return execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();}
function assessmentData(data:Record<string,unknown>):NativeRddObservation{
 const payload={schema:"gentle-ai.review-assessment/v1",changed_paths:1,changed_lines:1,reasons:[],candidate:{kind:"current-changes"},...data};
 return Object.freeze({operation:"assess",status:"available",data:Object.freeze(payload),reviewAuthority:false,deliveryAuthority:false}) as NativeRddObservation;
}
function unconfigured():NativeRddObservation{
 return Object.freeze({operation:"assess",status:"unavailable",reason:"unconfigured",reviewAuthority:false,deliveryAuthority:false}) as NativeRddObservation;
}
function repository(t:TestContext):string{
 const root=resolve(mkdtempSync(join(tmpdir(),"asen-review-assessment-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 git(root,"init","-q");git(root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","-q","--allow-empty","-m","base");
 writeFileSync(join(root,"target.txt"),"committed base\n");git(root,"add","target.txt");git(root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","-q","-m","track target");
 writeFileSync(join(root,"target.txt"),"candidate\n");
 return root;
}
function editorAnswer(title:string):string{
 if(title.includes("untracked"))return "[]";
 if(title.includes("Rutas exactas"))return '["target.txt"]';
 return "Check the task requirements";
}
/** One interactive workspace review driven by a host-injected read-only native control whose own notifications are recorded. */
function setup(t:TestContext,observation:NativeRddObservation|(()=>NativeRddObservation),allowExternalReview=true,lensChoices:Partial<Record<ReviewLens|"jd-judge-a"|"jd-judge-b"|"jd-fix-agent",{model?:string;thinking?:"high"}>>={},failFixProfile=false,fixHooks?:NonNullable<Parameters<typeof registerOrdinaryReviewCommand>[4]>,judgeVerdict:"pass"|"fail"="pass"){
 const root=repository(t),messages:string[]=[],trace:{operation:string,notified:string[]}[]=[],modelCalls:string[]=[],consentPrompts:{title:string;message:string}[]=[];
 const control={async observe(operation:string,context:{ui:{notify(message:string,level:"info"|"error"):void}}):Promise<NativeRddObservation>{
  const notified:string[]=[];trace.push({operation,notified});
  context.ui.notify=(message:string)=>{notified.push(message);};
  return typeof observation==="function"?observation():observation;
 }};
 const commands=new Map<string,Command>();
 registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),control as never,async(_context,lens)=>{if(lens==="jd-fix-agent"&&failFixProfile)throw new Error("No se pudo cargar el perfil Fix");return lensChoices[lens];},undefined,fixHooks);
 const registry={getAvailable:()=>[author,reviewer,reviewerTwo],hasConfiguredAuth:(model:PiReviewerModel)=>model.provider!=="author-provider",
  streamSimple:(model:PiReviewerModel)=>{
   modelCalls.push(model.provider+"/"+model.id);
   const answer={verdict:judgeVerdict,summary:"Reviewed the exact diff",findings:judgeVerdict==="fail"?[{id:"R-1",severity:"high",path:"target.txt",description:"Corregir defecto confirmado"}]:[]};
   return (async function*(){yield {type:"done" as const,reason:"stop" as const,message:{content:[{type:"text",text:JSON.stringify(answer)}],role:"assistant",provider:model.provider}};})();
  }} as unknown as PiReviewRegistry;
 const context={cwd:root,hasUI:true,modelRegistry:registry,model:author,sessionManager:{getSessionId:()=>"session-assess"},
  ui:{notify:(message:string)=>messages.push(message),select:async(_title:string,options:string[])=>options[0],editor:async(title:string)=>editorAnswer(title),confirm:async(title:string,message:string)=>{consentPrompts.push({title,message});return allowExternalReview;}}};
 return {handler:commands.get("asen-review")!.handler,context,messages,trace,modelCalls,consentPrompts};
}

test("workspace review keeps the default risk triple when native assess is unavailable",async t=>{
 const state=setup(t,unconfigured());
 const result=await state.handler("workspace",state.context) as {status:string,risk:{riskId:string;reason:string;severity:string;lenses:string[];independentVerifier:boolean},acceptance:string,deliveryAuthority:boolean};
 assert.equal(result.status,"passed-awaiting-tests");
 assert.equal(result.risk.riskId,"pi-independent-review");
 assert.equal(result.risk.reason,"Review the exact current workspace snapshot");
 assert.equal(result.risk.severity,"high");
 assert.deepEqual([...result.risk.lenses],DEFAULT_LENSES);
 assert.equal(result.risk.independentVerifier,true);
 assert.deepEqual(state.trace.map(call=>call.operation),["assess"]);
 assert.deepEqual(state.trace[0]!.notified,[],"the internal assessment must not add a notification of its own");
 assert.equal(state.messages.length,1);
 assert.equal(result.acceptance,"not-accepted");assert.equal(result.deliveryAuthority,false);
});

test("native assess passive risk lowers severity, lenses and the independent verifier",async t=>{
 const state=setup(t,assessmentData({risk:"passive",reasons:[{code:"docs_only"}],review_due:false,review_due_reason:"passive"}));
 const result=await state.handler("workspace",state.context) as {risk:{severity:string;lenses:string[];reason:string;independentVerifier:boolean}};
 assert.equal(result.risk.severity,"low");
 assert.deepEqual([...result.risk.lenses],["risk"]);
 assert.equal(result.risk.independentVerifier,false);
 assert.match(result.risk.reason,/native assess risk passive/u);
 assert.match(result.risk.reason,/native reason docs_only/u);
});

test("native assess medium risk maps to its own lens set without recommended lenses",async t=>{
 const state=setup(t,assessmentData({risk:"medium"}));
 const result=await state.handler("workspace",state.context) as {risk:{severity:string;lenses:string[]}};
 assert.equal(result.risk.severity,"low");
 assert.deepEqual([...result.risk.lenses],["risk","reliability"]);
});

test("recommended lenses from native assess replace the default triple in wire order",async t=>{
 const state=setup(t,assessmentData({risk:"high",lenses:["readability","risk","readability","nonsense"]}));
 const result=await state.handler("workspace",state.context) as {risk:{severity:string;lenses:string[];independentVerifier:boolean}};
 assert.equal(result.risk.severity,"high");
 assert.deepEqual([...result.risk.lenses],["readability","risk"]);
 assert.equal(result.risk.independentVerifier,true);
 assert.deepEqual(state.trace[0]!.notified,[]);
});

test("unusable assessment risk payloads fall back to the default triple",async t=>{
 for(const payload of [{risk:"critical"},{risk:{}},{},[]] as Record<string,unknown>[]){
  const state=setup(t,assessmentData(payload));
  const result=await state.handler("workspace",state.context) as {status:string,risk:{riskId:string;severity:string;reason:string;lenses:string[];independentVerifier:boolean}};
  assert.equal(result.status,"passed-awaiting-tests");
  assert.equal(result.risk.riskId,"pi-independent-review");
  assert.equal(result.risk.severity,"high");
  assert.deepEqual([...result.risk.lenses],DEFAULT_LENSES);
  assert.equal(result.risk.reason,"Review the exact current workspace snapshot");
  assert.equal(result.risk.independentVerifier,true);
 }
});

test("unusable recommended lenses keep the assessed tier lens set",async t=>{
 for(const payload of [{risk:"high",lenses:["security","ops"]},{risk:"high",lenses:"risk"},{risk:"medium",lenses:[1,2]}] as Record<string,unknown>[]){
  const state=setup(t,assessmentData(payload));
  const result=await state.handler("workspace",state.context) as {risk:{severity:string;reason:string;lenses:string[]}};
  assert.equal(result.risk.severity,payload.risk==="high"?"high":"low");
  assert.deepEqual([...result.risk.lenses],payload.risk==="high"?DEFAULT_LENSES:["risk","reliability"]);
  assert.match(result.risk.reason,new RegExp(`native assess risk ${payload.risk}`,"u"));
 }
});

test("an assessment whose context went stale falls back without extra messages",async t=>{
 const state=setup(t,()=>Object.freeze({operation:"assess",status:"unavailable",reason:"stale_context",reviewAuthority:false,deliveryAuthority:false}) as NativeRddObservation);
 const result=await state.handler("workspace",state.context) as {status:string,risk:{lenses:string[]}};
 assert.equal(result.status,"passed-awaiting-tests");
 assert.deepEqual([...result.risk.lenses],DEFAULT_LENSES);
 assert.equal(state.messages.length,1);
});

test("explicit native assess keeps its read-only notification and no authority",async t=>{
 const root=repository(t),messages:string[]=[],commands=new Map<string,Command>(),executed:string[][]=[];
 const stdout=JSON.stringify({schema:"gentle-ai.review-assessment/v1",risk:"medium",reasons:[{code:"changed_files"}],changed_paths:1,changed_lines:12,candidate:{kind:"current-changes"}});
 const control=createNativeRddControl({executable:()=>process.execPath,execute:async request=>{executed.push([...request.arguments]);return {stdout,stderr:"",exitCode:0,signal:null,timedOut:false,outputLimitExceeded:false} as ExecFileResult;}});
 registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),control);
 const context={cwd:root,hasUI:false,sessionManager:{getSessionId:()=>"session-assess"},ui:{notify:(message:string)=>messages.push(message)}};
 const result=await commands.get("asen-review")!.handler("native assess",context) as NativeRddObservation;
 assert.equal(result.status,"available");assert.equal(result.operation,"assess");
 assert.equal(result.data.risk,"medium");
 assert.equal(result.reviewAuthority,false);assert.equal(result.deliveryAuthority,false);
 assert.deepEqual(messages,[JSON.stringify(result,null,2)]);
 assert.deepEqual(executed,[["review","assess","--cwd",root,"--json"]]);
});

test("workspace review derives its risk through the configured read-only transport without extra messages",async t=>{
 const root=repository(t),messages:string[]=[],executed:string[][]=[];
 const stdout=JSON.stringify({schema:"gentle-ai.review-assessment/v1",risk:"high",lenses:["reliability","risk"],reasons:[{code:"shared_contract"}],changed_paths:2,changed_lines:40,candidate:{kind:"current-changes"}});
 const control=createNativeRddControl({executable:()=>process.execPath,execute:async request=>{executed.push([...request.arguments]);return {stdout,stderr:"",exitCode:0,signal:null,timedOut:false,outputLimitExceeded:false} as ExecFileResult;}});
 const commands=new Map<string,Command>();
 registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),control);
 const registry={getAvailable:()=>[author,reviewer],hasConfiguredAuth:(model:PiReviewerModel)=>model.provider!=="author-provider",
  streamSimple:(model:PiReviewerModel)=>{
   const answer={verdict:"pass",summary:"Reviewed the exact diff",findings:[]};
   return (async function*(){yield {type:"done" as const,reason:"stop" as const,message:{content:[{type:"text",text:JSON.stringify(answer)}],role:"assistant",provider:model.provider}};})();
  }} as unknown as PiReviewRegistry;
 const context={cwd:root,hasUI:true,modelRegistry:registry,model:author,sessionManager:{getSessionId:()=>"session-assess"},
  ui:{notify:(message:string)=>messages.push(message),select:async(_title:string,options:string[])=>options[0],editor:async(title:string)=>editorAnswer(title),confirm:async()=>true}};
 const result=await commands.get("asen-review")!.handler("workspace",context) as {status:string,risk:{severity:string;lenses:readonly string[];reason:string;independentVerifier:boolean}};
 assert.equal(result.status,"passed-awaiting-tests");
 assert.equal(result.risk.severity,"high");
 assert.deepEqual([...result.risk.lenses],["reliability","risk"]);
 assert.equal(result.risk.independentVerifier,true);
 assert.match(result.risk.reason,/native assess risk high; native reason shared_contract/u);
 assert.deepEqual(executed,[["review","assess","--cwd",root,"--json"]]);
 assert.equal(messages.length,1,"the read-only assessment is folded into the plan, not announced as a second message");
});

test("workspace review without an interactive host stays unavailable before any assessment",async t=>{
 const root=repository(t),messages:string[]=[];let observed=0;
 const commands=new Map<string,Command>();
 registerOrdinaryReviewCommand((name,command)=>commands.set(name,command),{async observe(){observed++;return unconfigured();}} as never);
 const context={cwd:root,hasUI:false,sessionManager:{getSessionId:()=>"session-assess"},ui:{notify:(message:string)=>messages.push(message)}};
 const result=await commands.get("asen-review")!.handler("workspace",context);
 assert.deepEqual(result,{status:"unavailable",reason:"Revisión independiente no disponible: se requiere una sesión Pi interactiva, modelo autor conocido y un modelo revisor autenticado distinto."});
 assert.equal(observed,0);assert.equal(messages.length,1);
});

test("finding claim truncation keeps the last whole character inside the byte bound",()=>{
 assert.equal(REVIEW_FINDING_CLAIM_MAX_BYTES,1024);
 assert.equal(REVIEW_FINDING_CLAIMS_MAX_BYTES,8192);
 assert.deepEqual(truncateClaim("a short claim",REVIEW_FINDING_CLAIM_MAX_BYTES),{text:"a short claim",truncated:false});
 const long="x".repeat(1200),cutLong=truncateClaim(long,REVIEW_FINDING_CLAIM_MAX_BYTES);
 assert.equal(Buffer.byteLength(cutLong.text),1024);assert.equal(cutLong.truncated,true);assert.equal(cutLong.text,long.slice(0,1024));
 const accented="é".repeat(700),cutAccent=truncateClaim(accented,1024);
 assert.equal(Buffer.byteLength(cutAccent.text),1024);assert.equal(cutAccent.text.length,512);
 assert.equal(cutAccent.truncated,true);assert.equal(accented.startsWith(cutAccent.text),true);
 const cutAstral=truncateClaim("😀".repeat(3),6);
 assert.equal(cutAstral.text,"😀");assert.equal(Buffer.byteLength(cutAstral.text),4);assert.equal(cutAstral.truncated,true);
 assert.deepEqual(truncateClaim("😀",0),{text:"",truncated:true});
 assert.deepEqual(truncateClaim("",1024),{text:"",truncated:false});
});

test("bounded finding claims stop at the total byte bound and mark later ids omitted",()=>{
 const ids=["c1","c2","c3","c4","c5","c6","c7","c8","c9","c10"];
 const bounded=boundedFindingClaims(ids,ids.map(id=>({id,claim:"y".repeat(1000)})))!;
 assert.deepEqual(Object.keys(bounded.claims),ids.slice(0,8));
 assert.deepEqual([...bounded.truncated],[]);
 assert.deepEqual([...bounded.omitted],["c9","c10"]);
 assert.equal(Buffer.byteLength(Object.values(bounded.claims).join(""),"utf8"),8000);
});

test("a per-claim cut is recorded as truncated and still counts toward the total bound",()=>{
 const ids=["f1","f2","f3","f4","f5","f6","f7","f8","f9","f10"];
 const long="x".repeat(1500);
 const findings=ids.map((id,index)=>({id,claim:index===9?"short claim":long}));
 const bounded=boundedFindingClaims(ids,findings)!;
 assert.deepEqual(Object.keys(bounded.claims),ids.slice(0,8));
 assert.deepEqual([...bounded.truncated],ids.slice(0,8));
 assert.deepEqual([...bounded.omitted],["f9","f10"]);
 assert.equal(Buffer.byteLength(bounded.claims["f1"]!,"utf8"),REVIEW_FINDING_CLAIM_MAX_BYTES);
});

test("empty or unmatched claim ids produce no bounded claim envelope",()=>{
 assert.equal(boundedFindingClaims([],[]),undefined);
 assert.equal(boundedFindingClaims(["missing"],[{id:"other",claim:"text"}]),undefined);
 assert.equal(boundedFindingClaims(["a"],[{id:"a",claim:"one"},{id:"a",claim:"two"}]),undefined);
 const partial=boundedFindingClaims(["a","ghost"],[{id:"a",claim:"kept"}])!;
 assert.equal(partial.claims.a,"kept");
 assert.deepEqual([...partial.omitted],[]);assert.deepEqual([...partial.truncated],[]);
});

test("explicit workspace 4r makes exactly four consented no-tools model calls and never binds RDD approval",async t=>{
 const state=setup(t,assessmentData({risk:"passive"}));
 const result=await state.handler("workspace 4r",state.context) as {
  status:string;lenses:string[];reviews:Array<{lens:string;verdict:string}>;findings:unknown[];
  acceptance:string;deliveryAuthority:boolean;nativeRddAdmission:string;
 };
 assert.equal(result.status,"4r-analysis-complete");
 assert.deepEqual(result.lenses,["risk","resilience","readability","reliability"]);
 assert.equal(result.reviews.length,4);assert.deepEqual(result.reviews.map(review=>review.lens),result.lenses);
 assert.equal(state.modelCalls.length,4);
 assert.equal(state.consentPrompts.length,1);
 assert.match(state.consentPrompts[0]!.message,/CUATRO llamadas/u);
 assert.equal(result.acceptance,"not-accepted");assert.equal(result.deliveryAuthority,false);
 assert.equal(result.nativeRddAdmission,"not-attempted");
 assert.equal(state.messages.length,1);
});

test("explicit workspace 4r refuses all external calls after a declined four-model-call consent",async t=>{
 const state=setup(t,unconfigured(),false);
 const result=await state.handler("workspace 4r",state.context) as {status:string};
 assert.equal(result.status,"cancelled");
 assert.equal(state.modelCalls.length,0);
 assert.equal(state.consentPrompts.length,1);
 assert.match(state.consentPrompts[0]!.message,/CUATRO llamadas/u);
});

test("specialized 4R route selects the configured authenticated reviewer per lens",async t=>{
 const state=setup(t,unconfigured(),true,{risk:{model:"review-provider/reviewer-two"}});
 const result=await state.handler("workspace 4r",state.context) as {status:string;reviews:Array<{lens:string;reviewerId:string}>};
 assert.equal(result.status,"4r-analysis-complete");
 assert.deepEqual(state.modelCalls,[
  "review-provider/reviewer-two","review-provider/reviewer-one",
  "review-provider/reviewer-one","review-provider/reviewer-one"
 ]);
 assert.equal(result.reviews[0]!.reviewerId,"pi-model:review-provider/reviewer-two");
 assert.match(state.consentPrompts[0]!.message,/risk = review-provider\/reviewer-two/u);
});

test("unknown 4R profile model and unprovable effort block before consent or provider use",async t=>{
 const absent=setup(t,unconfigured(),true,{risk:{model:"missing/not-authenticated"}});
 await assert.rejects(async()=>await absent.handler("workspace 4r",absent.context),/unavailable, unauthenticated/u);
 assert.equal(absent.modelCalls.length,0);assert.equal(absent.consentPrompts.length,0);
 const thinking=setup(t,unconfigured(),true,{risk:{thinking:"high"}});
 await assert.rejects(async()=>await thinking.handler("workspace 4r",thinking.context),/cannot prove applying/u);
 assert.equal(thinking.modelCalls.length,0);assert.equal(thinking.consentPrompts.length,0);
});

test("adaptive 4R executes one low-risk lens with exact informed consent",async t=>{
 const state=setup(t,assessmentData({risk:"passive",lenses:["readability"]}));
 const result=await state.handler("workspace adaptive",state.context) as {status:string;lenses:string[];independentVerification:string;acceptance:string;deliveryAuthority:boolean};
 assert.equal(result.status,"adaptive-analysis-complete");
 assert.deepEqual(result.lenses,["readability"]);
 assert.equal(state.modelCalls.length,1);
 assert.match(state.consentPrompts[0]!.title,/1 revisiones/u);
 assert.match(state.consentPrompts[0]!.message,/1 llamadas separadas/u);
 assert.equal(result.independentVerification,"not-required");
 assert.equal(result.acceptance,"not-accepted");assert.equal(result.deliveryAuthority,false);
});

test("adaptive 4R preserves medium risk recommendations with two model calls",async t=>{
 const state=setup(t,assessmentData({risk:"medium"}));
 const result=await state.handler("workspace adaptive",state.context) as {status:string;lenses:string[];independentVerification:string};
 assert.equal(result.status,"adaptive-analysis-complete");
 assert.deepEqual(result.lenses,["risk","reliability"]);
 assert.equal(state.modelCalls.length,2);
 assert.equal(state.consentPrompts.length,1);
 assert.match(state.consentPrompts[0]!.message,/2 llamadas separadas/u);
 assert.equal(result.independentVerification,"not-required");
});

test("adaptive high-risk reviewer cannot bypass mandatory risk and reliability",async t=>{
 const state=setup(t,assessmentData({risk:"high",lenses:["readability"]}));
 const result=await state.handler("workspace adaptive",state.context) as {status:string;lenses:string[];independentVerification:string};
 assert.deepEqual(result.lenses,["risk","reliability","readability"]);
 assert.equal(state.modelCalls.length,3);
 assert.match(state.consentPrompts[0]!.message,/3 llamadas separadas/u);
 assert.equal(result.independentVerification,"required-not-run");
});

test("declining adaptive review blocks all model calls and grants no side effects",async t=>{
 const state=setup(t,assessmentData({risk:"high"}),false);
 const result=await state.handler("workspace adaptive",state.context) as {status:string};
 assert.equal(result.status,"cancelled");
 assert.equal(state.modelCalls.length,0);
 assert.equal(state.consentPrompts.length,1);
});

test("adaptive review rejects missing model routing before cost consent",async t=>{
 const state=setup(t,assessmentData({risk:"medium"}),true,{reliability:{model:"unknown/missing"}});
 await assert.rejects(async()=>await state.handler("workspace adaptive",state.context),/unavailable, unauthenticated/u);
 assert.equal(state.modelCalls.length,0);
 assert.equal(state.consentPrompts.length,0);
});

test("workspace judgment-day invokes two distinct authenticated judges and never auto-fixes",async t=>{
 const state=setup(t,unconfigured());
 const result=await state.handler("workspace judgment-day",state.context) as {
  status:string;judges:Array<{judge:string;reviewerId:string}>;acceptance:string;
  deliveryAuthority:boolean;autoMerge:boolean;fixAgent:string;nativeRddAdmission:string;
 };
 assert.equal(result.status,"analysis-complete");
 assert.deepEqual(state.modelCalls,["review-provider/reviewer-one","review-provider/reviewer-two"]);
 assert.deepEqual(result.judges.map(x=>x.judge),["jd-judge-a","jd-judge-b"]);
 assert.equal(state.consentPrompts.length,1);
 assert.match(state.consentPrompts[0]!.message,/DOS llamadas/u);
 assert.equal(result.acceptance,"not-accepted");assert.equal(result.autoMerge,false);
 assert.equal(result.deliveryAuthority,false);assert.equal(result.fixAgent,"not-launched");
 assert.equal(result.nativeRddAdmission,"not-attempted");
});

test("workspace judgment-day blocks all calls if consent is denied",async t=>{
 const state=setup(t,unconfigured(),false);
 const result=await state.handler("workspace judgment-day",state.context) as {status:string};
 assert.equal(result.status,"cancelled");
 assert.equal(state.modelCalls.length,0);
 assert.equal(state.consentPrompts.length,1);
});

test("workspace judgment-day rejects duplicated or unauthenticated judge routing before consent",async t=>{
 const duplicate=setup(t,unconfigured(),true,{"jd-judge-b":{model:"review-provider/reviewer-one"}});
 await assert.rejects(async()=>await duplicate.handler("workspace judgment-day",duplicate.context),/must be different/u);
 assert.equal(duplicate.modelCalls.length,0);assert.equal(duplicate.consentPrompts.length,0);
 const missing=setup(t,unconfigured(),true,{"jd-judge-b":{model:"not-authenticated/missing"}});
 await assert.rejects(async()=>await missing.handler("workspace judgment-day",missing.context),/must be different/u);
 assert.equal(missing.modelCalls.length,0);assert.equal(missing.consentPrompts.length,0);
});


test("resiliencia 4R: error del perfil Fix conserva los dictámenes con hallazgos y bloquea la reparación",async t=>{
 // Sin hallazgos no hace falta resolver perfil Fix: ese caso es 'not-needed'.
 // Con fallos confirmados la ruta es necesaria y debe bloquearse si falla.
 const state=setup(t,unconfigured(),true,{},true,undefined,"fail");
 const result=await state.handler("workspace judgment-day",state.context) as {
  status:string;judges:Array<{judge:string}>;
  fixAgent:string;fixHandoff:{status:string;blockers:string[];autoLaunch:boolean};
  acceptance:string;
 };
 assert.equal(result.status,"findings-require-review");
 assert.deepEqual(result.judges.map(x=>x.judge),["jd-judge-a","jd-judge-b"]);
 assert.deepEqual(state.modelCalls,["review-provider/reviewer-one","review-provider/reviewer-two"]);
 assert.equal(result.fixAgent,"not-launched");
 assert.equal(result.fixHandoff.status,"blocked");
 assert.ok(result.fixHandoff.blockers.some(x=>/profile lookup unavailable/u.test(x)));
 assert.equal(result.fixHandoff.autoLaunch,false);
 assert.equal(result.acceptance,"not-accepted");
});


test("T08 propuesta de dos jueces se persiste sin autorizar Writer y se consulta solo en lectura",async t=>{
 const received:{genuine:boolean;status:string;paths:readonly string[]}[]=[];
 const id="b".repeat(64);
 const hooks:NonNullable<Parameters<typeof registerOrdinaryReviewCommand>[4]>={
  record:async(_context,proposal)=>{
   received.push({genuine:isIssuedJudgmentFixHandoff(proposal),status:proposal.status,paths:proposal.paths});
   return {id};
  },
  list:async()=>[]
 };
 const state=setup(t,unconfigured(),true,{},false,hooks,"fail");
 const result=await state.handler("workspace judgment-day",state.context) as {
  status:string;fixStorage:string;fixProposalId:string;
  fixHandoff:{status:string;writerAuthority:boolean};
  acceptance:string;autoMerge:boolean
 };
 assert.equal(result.status,"findings-require-review");
 assert.deepEqual(state.modelCalls,["review-provider/reviewer-one","review-provider/reviewer-two"]);
 assert.deepEqual(received,[{genuine:true,status:"fix-planning-required",paths:["target.txt"]}]);
 assert.equal(result.fixStorage,"stored");
 assert.equal(result.fixProposalId,id);
 assert.equal(result.fixHandoff.writerAuthority,false);
 assert.equal(result.acceptance,"not-accepted");
 assert.equal(result.autoMerge,false);
 assert.deepEqual(await state.handler("fixes",state.context),[]);
});

test("T08 error persistiendo Fix no invalida revisión genuina ni inicia otro Worker",async t=>{
 let calls=0;
 const hooks:NonNullable<Parameters<typeof registerOrdinaryReviewCommand>[4]>={
  record:async()=>{calls++;throw new Error("disco inaccesible");},
  list:async()=>[]
 };
 const state=setup(t,unconfigured(),true,{},false,hooks,"fail");
 const result=await state.handler("workspace judgment-day",state.context) as {
  status:string;fixStorage:string;fixProposalId?:string;
  acceptance:string;fixAgent:string;fixHandoff:{status:string}
 };
 assert.equal(result.status,"findings-require-review");
 assert.equal(result.fixStorage,"unavailable");
 assert.equal(result.fixProposalId,undefined);
 assert.equal(result.fixHandoff.status,"fix-planning-required");
 assert.equal(result.fixAgent,"not-launched");
 assert.deepEqual(state.modelCalls,["review-provider/reviewer-one","review-provider/reviewer-two"]);
 assert.equal(calls,1);
 assert.equal(result.acceptance,"not-accepted");
});
