import test from "node:test";
import assert from "node:assert/strict";
import {assessT09NativeTrialReadiness} from "../src/review/t09-native-trial-readiness.js";

const sha="a".repeat(40),model="nvidia/nemotron-3.5-lightning-30b-a3b";
const good=(id:"a"|"b")=>({
 worker:"t06-writer-"+id,scope:"t06-writer-"+id+".mjs",
 session:"t06-child-"+(id==="a"?"11111111-1111-4111-8111-111111111111":"22222222-2222-4222-8222-222222222222"),
 requestedModel:model,observedModel:model,
 processObserved:true,nativeResultOk:true,
 writeToolObserved:true,attributionVerified:true,
 attributionEntries:1,writeStarts:1,writeSuccesses:1,writeFailures:0,
 blockers:[],exactScope:true,syntaxOk:true,behaviorOk:true,
 passed:true,durationMs:id==="a"?17000:13000,
 fileSha256:(id==="a"?"b":"c").repeat(64)
});
const report=()=>({
 schema:"asen.t06.native-dual-writer/v1",sha,piVersion:"1.2.0",
 executionKind:"NATIVE_PI_RPC_WRITER_WITH_TWO_GITHUB_APPROVALS",
 consentMethod:"two-distinct-github-environment-human-approvals-not-native-pi-TUI",
 requestedModel:model,modelCostVerified:false,billingVerified:false,
 distinctWorktrees:true,distinctSessions:true,concurrent:true,
 observedWindowMs:18000,observedOverlapMs:12000,
 workers:[good("a"),good("b")],
 independentReview:{status:"NOT_RUN_DISTINCT_REVIEW_MODELS_UNCONFIGURED",reviews:[]},
 autoRetry:false,autoMerge:false,accepted:false,globalFull:false,
 result:"PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW"
});
const evaluate=(source:unknown,expectedSha=sha)=>
 assessT09NativeTrialReadiness({report:source,expectedSha});

test("T09 extrae solo intervalos reales declarados, sin equivalencia ni coste verificado",()=>{
 const x=evaluate(report());
 assert.equal(x.status,"candidate-evidence-only");
 assert.deepEqual(x.blockers,[]);
 assert.deepEqual(x.measurements,{
  workerCount:2,observedWindowMs:18000,observedOverlapMs:12000,
  workerDurationsMs:[17000,13000]
 });
 assert.equal(x.providerUsageVerified,false);
 assert.equal(x.billingVerified,false);
 assert.equal(x.referenceCompared,false);
 assert.equal(x.qualityIndependentlyVerified,false);
 assert.equal(x.authorized,false);
 assert.equal(x.acceptance,"not-accepted");
 assert.equal(x.globalFull,false);
 assert.ok(Object.isFrozen(x));
});
test("T09 bloquea el informe del ensayo fallido de T06 aun con dos Pi simultáneos",()=>{
 const failed={...report(),result:"BLOCKED_OR_PARTIAL_NEEDS_REVIEW",
  workers:[{...good("a"),writeToolObserved:false,attributionVerified:false,
   attributionEntries:0,writeStarts:0,writeSuccesses:0,passed:false},good("b")]};
 const x=evaluate(failed);
 assert.equal(x.status,"blocked");
 assert.equal(x.measurements,null);
 assert.equal(x.globalFull,false);
});
test("T09 rechaza métricas inventadas o internamente imposibles",()=>{
 for(const source of [
  {...report(),observedWindowMs:null},
  {...report(),observedWindowMs:-1},
  {...report(),observedWindowMs:500},
  {...report(),observedWindowMs:500000},
  {...report(),observedOverlapMs:50000},
  {...report(),observedOverlapMs:0},
  {...report(),observedOverlapMs:1000},
  {...report(),concurrent:false}
 ]){
  const x=evaluate(source);
  assert.equal(x.status,"blocked",JSON.stringify(source));
  assert.equal(x.measurements,null);
 }
});
test("T09 rechaza cambios de SHA, proveedor, origen, permisos, facturación y aceptación",()=>{
 const cases=[
  {...report(),sha:"d".repeat(40)},
  {...report(),executionKind:"SYNTHETIC"},
  {...report(),consentMethod:"simulado"},
  {...report(),modelCostVerified:true},
  {...report(),billingVerified:true},
  {...report(),accepted:true},
  {...report(),globalFull:true},
  {...report(),autoRetry:true},
  {...report(),autoMerge:true},
  {...report(),requestedModel:"unknown"},
  {...report(),piVersion:"fake"},
  {...report(),distinctSessions:false},
  {...report(),distinctWorktrees:false}
 ];
 for(const row of cases)
  assert.equal(evaluate(row).status,"blocked");
 assert.equal(evaluate(report(),"d".repeat(40)).status,"blocked");
});
test("T09 rechaza agentes no atribuidos, salidas sin escritura y métricas falsas",()=>{
 const edits=[
  {writeToolObserved:false},{attributionVerified:false},{attributionEntries:0},
  {writeStarts:0},{writeSuccesses:0},{writeFailures:1},
  {blockers:["pi-run-failed"]},{nativeResultOk:false},
  {observedModel:"unknown"},{requestedModel:"another/model"},
  {processObserved:false},{exactScope:false},{syntaxOk:false},
  {behaviorOk:false},{passed:false},{fileSha256:"sin huella"},
  {durationMs:null},{durationMs:0},{session:"t06-child-mala"},
  {scope:"otra.mjs"},{worker:"t06-writer-b"}
 ];
 for(const change of edits){
  const original=report();
  const changed={...original,workers:[{...good("a"),...change},good("b")]};
  assert.equal(evaluate(changed).status,"blocked",JSON.stringify(change));
 }
 const shared=good("a").session;
 const duplicate=report();
 assert.equal(evaluate({...duplicate,workers:[good("a"),{...good("b"),session:shared}]}).status,"blocked");
 assert.equal(evaluate({...duplicate,workers:[good("a")]}).status,"blocked");
});
test("T09 no reconoce como auténtico un informe sin estructura",()=>{
 for(const value of [undefined,null,[],42,"PASS",{},report().workers])
  assert.equal(evaluate(value).status,"blocked");
});

test("T09 acepta la versión Pi en el formato real del productor, sin aflojar el SHA",()=>{
 for(const version of ["1.2.0","pi 1.2.0","Pi 1.2.0"]){
  const result=evaluate({...report(),piVersion:version});
  assert.equal(result.status,"candidate-evidence-only",version);
  assert.equal(result.globalFull,false);
 }
 for(const version of ["pi 1.2.0 extra","pi 1.2.0-rc","pi 1.2.1",
  "otra pi 1.2.0","1.2.0 1.2.0","pi\\n1.2.0",null,42]){
  assert.equal(evaluate({...report(),piVersion:version}).status,"blocked",String(version));
 }
 assert.equal(evaluate({...report(),piVersion:"pi 1.2.0",sha:"f".repeat(40)}).status,"blocked");
});
