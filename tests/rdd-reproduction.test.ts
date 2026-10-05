import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,createHmac,randomBytes} from "node:crypto";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import {EvidenceStore,saveEvidence,loadEvidence} from "../src/evidence/store.js";
import {authorizeImplementation,verifySkillEvidence} from "../src/verify/verifier.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import type {Candidate} from "../src/core/types.js";
import {executeRddRepositoryInspection,prepareRddRepositoryInspection,type RddRepositoryInspectionSnapshot} from "../src/defects/rdd-repository-inspection.js";
import {recordRddReproduction,type RddReproductionInput} from "../src/defects/rdd-reproduction.js";
import {bindRddDefectEvidence,type RddDefectBindingInput} from "../src/defects/rdd-defect-binding.js";
import {parseRddPolicyBytes} from "../src/defects/rdd-policy-source.js";
import {authorizeRepositoryOperation,type RepositoryOperationBinding} from "../src/repository/operation-policy.js";
import {executeNodePassingObservation,executeNodeTestObservation,type TestObservation} from "../src/test/tdd-observation.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {issueOddDecision} from "./helpers/odd-routing.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";

const repositoryUrl="https://github.example/acme/app",issueUrl=`${repositoryUrl}/issues/17`,testPath="reproduction.test.mjs";
const policyBytes=[...new TextEncoder().encode('{"schemaVersion":1,"reviewMode":"enabled","issueApproval":{"requiredLabels":["kind:defect","status:approved"]}}')];
const policyIdentity=createHash("sha256").update("asen.rdd-policy.v1\0").update(Uint8Array.from(policyBytes)).digest("hex"),policy=parseRddPolicyBytes(Uint8Array.from(policyBytes),policyIdentity);
let sequence=0;
const git=(repository:string,...args:string[])=>execFileSync("git",["-C",repository,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
const commit=(repository:string,message:string)=>{git(repository,"add",".");git(repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m",message);return git(repository,"rev-parse","HEAD");};
const source=(defect=true,control=false)=>`import assert from "node:assert/strict";import test from "node:test";\ntest("defect case",()=>assert.equal(1,${defect?2:1}));\ntest("negative control",()=>assert.equal(1,${control?2:1}));\n`;

async function inspection(mainCommitIdentity:string):Promise<RddRepositoryInspectionSnapshot>{
 const binding:RepositoryOperationBinding={host:"github.example",owner:"acme",repository:"app",sessionId:`reproduction-${++sequence}`,actor:"maintainer",action:"remote_read"};
 const claim=prepareRddRepositoryInspection({binding,repositoryUrl,branch:"main",observedMainCommitIdentity:mainCommitIdentity,expectedMainCommitIdentity:mainCommitIdentity,issueUrl,policyLocator:".asen/rdd-policy.json"},policy);
 return executeRddRepositoryInspection(claim,authorizeRepositoryOperation(binding),binding,{read(){return {repositoryUrl,branch:"main",observedMainCommitIdentity:mainCommitIdentity,issueUrl,issueNumber:17,issueState:"open",issueLabels:["kind:defect","status:approved"],policyLocator:".asen/rdd-policy.json",policyBytes:[...policyBytes],policyContentIdentity:policyIdentity,pullRequestAudit:{complete:true,truncated:false,saturated:false,totalCount:0,rows:[]}};}});
}
async function fixture(t:TestContext,options:{controlFails?:boolean;productionDiff?:boolean;extraTestDiff?:boolean;skippedParent?:boolean;merge?:boolean;unchangedExecuted?:boolean}={}){
 const repository=await mkdtemp(join(tmpdir(),"asen-rdd-reproduction-"));t.after(()=>rm(repository,{recursive:true,force:true}));git(repository,"init","-q");
 await writeFile(join(repository,"README.md"),"baseline\n");await writeFile(join(repository,"reproduction.test.mjs"),source(false));if(options.unchangedExecuted)await writeFile(join(repository,"unchanged.test.mjs"),'import test from "node:test";test("unchanged control",()=>{});\n');commit(repository,"seed");
 const mainCommitIdentity=git(repository,"rev-parse","HEAD");if(options.merge){git(repository,"checkout","-q","-b","side");await writeFile(join(repository,"README.md"),"side\n");commit(repository,"side");git(repository,"checkout","-q","--detach",mainCommitIdentity);}if(options.skippedParent){await writeFile(join(repository,"README.md"),"intermediate\n");commit(repository,"intermediate");}
 await writeFile(join(repository,"reproduction.test.mjs"),source(true,options.controlFails));if(options.productionDiff)await writeFile(join(repository,"production.js"),"export const changed=true;\n");if(options.extraTestDiff)await writeFile(join(repository,"other.test.mjs"),"// undeclared\n");
 let revision=commit(repository,"candidate");if(options.merge){execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","merge","-q","--no-ff","-m","merge","side"],{stdio:"ignore"});revision=git(repository,"rev-parse","HEAD");}const candidate:Candidate={id:`candidate-${++sequence}`,repository,revision,createdAt:"2025-01-01T00:00:00.000Z"};
 const paths=options.unchangedExecuted?[testPath,"unchanged.test.mjs"]:[testPath],[first,second]=await Promise.all([executeNodeTestObservation(candidate,paths),executeNodeTestObservation(candidate,paths)]);
 const snapshot=await inspection(mainCommitIdentity),input:RddReproductionInput={repositoryUrl,issueUrl,mainCommitIdentity,candidate:{id:candidate.id,repository,revision},reproductionCaseIds:["defect case"],negativeControlCaseIds:options.unchangedExecuted?["negative control","unchanged control"]:["negative control"]};return {repository,candidate,snapshot,input,first,second};
}
async function nondeterministic(t:TestContext){const repository=await mkdtemp(join(tmpdir(),"asen-rdd-variable-"));t.after(()=>rm(repository,{recursive:true,force:true}));git(repository,"init","-q");await writeFile(join(repository,testPath),source(false));commit(repository,"seed");const mainCommitIdentity=git(repository,"rev-parse","HEAD"),state=await mkdtemp(join(tmpdir(),"asen-rdd-counter-")),counter=join(state,"counter.txt");t.after(()=>rm(state,{recursive:true,force:true}));sequence++;await writeFile(counter,"1");await writeFile(join(repository,testPath),`import assert from "node:assert/strict";import {readFileSync,writeFileSync} from "node:fs";import test from "node:test";const p=${JSON.stringify(counter)},n=Number(readFileSync(p,"utf8"));writeFileSync(p,String(n+1));test("defect case",()=>assert.equal(n,99));test("negative control",()=>assert.equal(1,1));\n`);const revision=commit(repository,"variable assertions"),candidate:Candidate={id:`candidate-${sequence}`,repository,revision,createdAt:"2025-01-01T00:00:00.000Z"},first=await executeNodeTestObservation(candidate,[testPath]),second=await executeNodeTestObservation(candidate,[testPath]),snapshot=await inspection(mainCommitIdentity),input:RddReproductionInput={repositoryUrl,issueUrl,mainCommitIdentity,candidate:{id:candidate.id,repository,revision},reproductionCaseIds:["defect case"],negativeControlCaseIds:["negative control"]};return {candidate,first,second,snapshot,input};}

test("RED: records two deterministic genuine failing observations and passing controls",async (t:TestContext)=>{
 const value=await fixture(t),before=structuredClone(value.input),result=recordRddReproduction(value.snapshot,value.input,value.first,value.second);
 assert.deepEqual(value.input,before);assert.deepEqual(result,{schemaVersion:1,repositoryUrl,issueUrl,mainCommitIdentity:value.input.mainCommitIdentity,candidate:value.input.candidate,reproductionCaseIds:["defect case"],negativeControlCaseIds:["negative control"],observation:{adapterId:"node-test",commandFingerprint:value.first.commandFingerprint,testPaths:[testPath],executedCaseIds:["defect case","negative control"],failingCaseIds:["defect case"],assertionFingerprint:value.first.assertionFingerprint,failureKind:"assertion"},repeatedRuns:2});
 const visit=(item:unknown):void=>{if(typeof item!=="object"||item===null)return;assert.equal(Object.isFrozen(item),true);for(const child of Object.values(item))visit(child);};visit(result);
 for(const forbidden of ["causalInvariant","conflict","verdict","operatorFlows","journey","rollback","forecast","evidenceStore","lifecycle","review","mutation","delivery","merge","readiness","authority"])assert.equal(forbidden in result,false);
});

test("rejects D1 clones, forgeries, and successful snapshot reuse",async (t:TestContext)=>{
 const clone=await fixture(t);assert.throws(()=>recordRddReproduction(structuredClone(clone.snapshot),clone.input,clone.first,clone.second),/genuine|issued/i);
 const forged=await fixture(t);assert.throws(()=>recordRddReproduction({...forged.snapshot} as RddRepositoryInspectionSnapshot,forged.input,forged.first,forged.second),/genuine|issued/i);
 const reused=await fixture(t);recordRddReproduction(reused.snapshot,reused.input,reused.first,reused.second);assert.throws(()=>recordRddReproduction(reused.snapshot,reused.input,reused.first,reused.second),/consumed|claimed/i);
});

test("burns snapshot and both observations before malformed caller input",async (t:TestContext)=>{
 const value=await fixture(t),malformed={...value.input,reproductionCaseIds:[]} as RddReproductionInput;assert.throws(()=>recordRddReproduction(value.snapshot,malformed,value.first,value.second),/reproduction/i);
 assert.throws(()=>recordRddReproduction(value.snapshot,value.input,value.first,value.second),/consumed|claimed/i);
 const fresh=await fixture(t);assert.throws(()=>recordRddReproduction(fresh.snapshot,fresh.input,value.first,value.second),/claimed/i);assert.throws(()=>recordRddReproduction(fresh.snapshot,fresh.input,fresh.first,fresh.second),/consumed|claimed/i);
});

test("rejects observation reuse, candidate binding mismatch, and passing substitutions",async (t:TestContext)=>{
 const mismatch=await fixture(t);assert.throws(()=>recordRddReproduction(mismatch.snapshot,{...mismatch.input,candidate:{...mismatch.input.candidate,id:"other"}},mismatch.first,mismatch.second),/candidate|binding/i);
 const passing=await fixture(t);await writeFile(join(passing.repository,"reproduction.test.mjs"),source(false));const passRevision=commit(passing.repository,"passing"),passCandidate={...passing.candidate,revision:passRevision};const pass=await executeNodePassingObservation(passCandidate,[testPath]);const passSnapshot=await inspection(passing.input.mainCommitIdentity);assert.throws(()=>recordRddReproduction(passSnapshot,{...passing.input,candidate:{id:passCandidate.id,repository:passCandidate.repository,revision:passCandidate.revision}},pass as unknown as TestObservation,pass as unknown as TestObservation),/issued|claimed|observation/i);
});

test("rejects control failures, unexpected/all-pass observations, and nondeterminism",async (t:TestContext)=>{
 const control=await fixture(t,{controlFails:true});assert.throws(()=>recordRddReproduction(control.snapshot,control.input,control.first,control.second),/failing|control/i);
 const allPass=await fixture(t);await writeFile(join(allPass.repository,"reproduction.test.mjs"),source(false));const revision=commit(allPass.repository,"all pass");await assert.rejects(()=>executeNodeTestObservation({...allPass.candidate,revision},[testPath]),/failing test run/i);
 const variable=await nondeterministic(t);assert.throws(()=>recordRddReproduction(variable.snapshot,variable.input,variable.first,variable.second),/nondeterministic/i);
});

test("rejects dirty and untracked candidates",async (t:TestContext)=>{
 for(const untracked of [false,true]){const value=await fixture(t);await writeFile(join(value.repository,untracked?"injected.js":"README.md"),"dirty\n");assert.throws(()=>recordRddReproduction(value.snapshot,value.input,value.first,value.second),/unchanged|untracked|candidate/i);}
});

test("rejects non-direct lineage and non-test or undeclared diffs",async (t:TestContext)=>{
 for(const options of [{skippedParent:true},{merge:true},{productionDiff:true},{extraTestDiff:true}]){const value=await fixture(t,options);assert.throws(()=>recordRddReproduction(value.snapshot,value.input,value.first,value.second),/parent|diff|test path/i);}
});

test("requires exact bounded plain declarations and ordered disjoint complete cases",async (t:TestContext)=>{
 for(const change of [(input:RddReproductionInput)=>({...input,reproductionCaseIds:["negative control"]}),(input:RddReproductionInput)=>({...input,negativeControlCaseIds:["defect case"]}),(input:RddReproductionInput)=>({...input,reproductionCaseIds:["defect case","defect case"]}),(input:RddReproductionInput)=>Object.assign(Object.create(input),{})]){const value=await fixture(t);assert.throws(()=>recordRddReproduction(value.snapshot,change(value.input) as RddReproductionInput,value.first,value.second),/plain|case|ordered|duplicate|disjoint/i);}
});

test("correction RED: requires changed paths to equal every executed test path",async (t:TestContext)=>{const value=await fixture(t,{unchangedExecuted:true});assert.throws(()=>recordRddReproduction(value.snapshot,value.input,value.first,value.second),/exact.*test path|diff/i);});

test("correction RED: rejects caller proxies without invoking traps",async (t:TestContext)=>{
 const wrap=<T extends object>(value:T,counter:{value:number})=>new Proxy(value,{getPrototypeOf(){counter.value++;return Reflect.getPrototypeOf(value);},ownKeys(){counter.value++;return Reflect.ownKeys(value);},getOwnPropertyDescriptor(_target,key){counter.value++;return Reflect.getOwnPropertyDescriptor(value,key);},get(_target,key,receiver){counter.value++;return Reflect.get(value,key,receiver);}});
 for(const boundary of ["input","candidate","reproduction","controls"] as const){const value=await fixture(t),counter={value:0};let input:RddReproductionInput;if(boundary==="input")input=wrap(value.input,counter);else if(boundary==="candidate")input={...value.input,candidate:wrap(value.input.candidate,counter)};else if(boundary==="reproduction")input={...value.input,reproductionCaseIds:wrap([...value.input.reproductionCaseIds],counter)};else input={...value.input,negativeControlCaseIds:wrap([...value.input.negativeControlCaseIds],counter)};assert.throws(()=>recordRddReproduction(value.snapshot,input,value.first,value.second),/proxy|plain/i);assert.equal(counter.value,0,boundary);}
});

test("correction RED: sanitizes candidate inspection failures",async (t:TestContext)=>{const value=await fixture(t),secret="private-filename.js";await writeFile(join(value.repository,secret),"secret\n");assert.throws(()=>recordRddReproduction(value.snapshot,value.input,value.first,value.second),(error:unknown)=>error instanceof Error&&error.message==="Reproduction candidate inspection failed"&&!error.message.includes(secret));});


function d3Input(value:Awaited<ReturnType<typeof fixture>>):RddDefectBindingInput{
 return {invariantIds:["approved-issue","current-main","deterministic-reproduction"],operatorFlows:[{id:"inspect-reproduce",from:"approved issue",to:"reproduced defect",failureTo:"blocked"}],runtimeJourney:{command:[process.execPath,"--test","--test-reporter=tap",...value.first.testPaths],commandFingerprint:value.first.commandFingerprint,result:"reproduced",candidateId:value.candidate.id,candidateRevision:value.candidate.revision,limitations:["review and delivery remain outside D3"]},rollback:{boundary:"candidate",targetRevision:value.input.mainCommitIdentity,procedure:["discard the direct-child reproduction candidate"]},forecast:{changedLines:240,verificationEffort:"focused deterministic verification",remainingUncertainty:["independent HIGH verification pending"],deferredVerification:["Pi Free and OpenRouter reserved for final verification","full CI reserved for the large-batch gate"]}};
}
test("D3 binds genuine D2 evidence once and preserves descriptive-only authority",async(t:TestContext)=>{
 const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),bound=bindRddDefectEvidence(evidence,d3Input(value));
 assert.equal(bound.reproduction,evidence);assert.deepEqual(bound.runtimeJourney.command,[process.execPath,"--test","--test-reporter=tap",...value.first.testPaths]);assert.equal(bound.runtimeJourney.commandFingerprint,value.first.commandFingerprint);assert.equal(bound.runtimeJourney.candidateId,value.candidate.id);assert.equal(bound.runtimeJourney.candidateRevision,value.candidate.revision);assert.equal(bound.rollback.boundary,"candidate");assert.equal(bound.rollback.targetRevision,value.input.mainCommitIdentity);assert.ok(bound.forecast.changedLines<390);
 for(const forbidden of ["authority","review","mutation","delivery","merge","readiness","persistence"])assert.equal(forbidden in bound,false);
 assert.throws(()=>bindRddDefectEvidence(evidence,d3Input(value)),/consumed/i);
});
test("D3 rejects journey drift, unsafe rollback, and over-budget plans after consuming genuine evidence",async(t:TestContext)=>{
 for(const mutate of [(v:RddDefectBindingInput)=>{(v.runtimeJourney as {candidateId:string}).candidateId="other";},(v:RddDefectBindingInput)=>{(v.runtimeJourney as {candidateRevision:string}).candidateRevision="f".repeat(40);},(v:RddDefectBindingInput)=>{(v.runtimeJourney as {commandFingerprint:string}).commandFingerprint="other";},(v:RddDefectBindingInput)=>{(v.rollback as {boundary:string}).boundary="workspace";},(v:RddDefectBindingInput)=>{(v.rollback as {targetRevision:string}).targetRevision="e".repeat(40);},(v:RddDefectBindingInput)=>{(v.forecast as {changedLines:number}).changedLines=390;}]){
  const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value);mutate(input);assert.throws(()=>bindRddDefectEvidence(evidence,input),/journey|rollback|390|forecast/i);assert.throws(()=>bindRddDefectEvidence(evidence,d3Input(value)),/consumed/i);
 }
});

test("D3 requires the complete invariant set and burns genuine evidence on rejection",async(t:TestContext)=>{
 for(const missing of ["approved-issue","current-main","deterministic-reproduction"]){
  const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value);(input as unknown as {invariantIds:string[]}).invariantIds=input.invariantIds.filter(id=>id!==missing);assert.throws(()=>bindRddDefectEvidence(evidence,input),/required invariant/i);assert.throws(()=>bindRddDefectEvidence(evidence,d3Input(value)),/consumed/i);
 }
});

test("D3 requires a distinct fail-closed operator destination",async(t:TestContext)=>{
 for(const flow of [{id:"unsafe",from:"approved issue",to:"reproduced defect",failureTo:"continue"},{id:"same",from:"approved issue",to:"reproduced defect",failureTo:"reproduced defect"}]){
  const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value);(input as unknown as {operatorFlows:typeof flow[]}).operatorFlows=[flow];assert.throws(()=>bindRddDefectEvidence(evidence,input),/blocked|destinations/i);
 }
});

test("D3 budget must state deferred verification explicitly",async(t:TestContext)=>{
 const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value);(input.forecast as unknown as {deferredVerification:string[]}).deferredVerification=[];assert.throws(()=>bindRddDefectEvidence(evidence,input),/deferred verification|bounded exact array/i);
});

test("D3 rejects decorated caller containers without invoking proxy traps",async(t:TestContext)=>{
 const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value),counter={value:0};
 const proxy=new Proxy(input,{getPrototypeOf(){counter.value++;return Object.prototype;},ownKeys(){counter.value++;return [];},get(){counter.value++;return undefined;}});
 assert.throws(()=>bindRddDefectEvidence(evidence,proxy),/proxy|plain/i);assert.equal(counter.value,0);
});
test("D3 output is deeply immutable descriptive evidence",async(t:TestContext)=>{
 const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),bound=bindRddDefectEvidence(evidence,d3Input(value));
 const visit=(item:unknown):void=>{if(typeof item!=="object"||item===null)return;assert.equal(Object.isFrozen(item),true);for(const child of Object.values(item))visit(child);};visit(bound);
});

test("D3 rejects a runtime command unrelated to the observed test path",async(t:TestContext)=>{const value=await fixture(t),evidence=recordRddReproduction(value.snapshot,value.input,value.first,value.second),input=d3Input(value);(input.runtimeJourney as unknown as {command:string[]}).command=["node","--test","different.mjs"];assert.throws(()=>bindRddDefectEvidence(evidence,input),/executed test path/i);});

 test("D3 rechaza comandos falsos y contenedores con accesores sin ejecutarlos",async(t:TestContext)=>{
 for(const caso of ["comando","lista","flujos","hueco","flujo-abierto"]){
  const v=await fixture(t),e=recordRddReproduction(v.snapshot,v.input,v.first,v.second),i=d3Input(v);let llamadas=0;
  if(caso==="comando")(i.runtimeJourney as unknown as {command:string[]}).command=["falso",testPath];
  if(caso==="lista")Object.defineProperty(i.invariantIds,"0",{enumerable:true,get(){llamadas++;return "approved-issue";}});
  if(caso==="flujos")Object.defineProperty(i.operatorFlows,"0",{enumerable:true,get(){llamadas++;return {id:"f",from:"a",to:"b",failureTo:"blocked"};}});
  if(caso==="hueco")(i.forecast as unknown as {remainingUncertainty:string[]}).remainingUncertainty=new Array(1);
  if(caso==="flujo-abierto")(i as unknown as {operatorFlows:object[]}).operatorFlows=[...i.operatorFlows,{id:"abierto",from:"a",to:"b",failureTo:"continue"}];
  assert.throws(()=>bindRddDefectEvidence(e,i));assert.equal(llamadas,0);
  assert.throws(()=>bindRddDefectEvidence(e,d3Input(v)),/consumed/i);
 }
});

async function d4Bound(t:TestContext){
 const v=await fixture(t),reproduction=recordRddReproduction(v.snapshot,v.input,v.first,v.second);
 return {v,bound:bindRddDefectEvidence(reproduction,d3Input(v))};
}
test("D4 admite binding genuino una vez y recupera datos sin emitir procedencia",async(t:TestContext)=>{
 const {v,bound}=await d4Bound(t),store=new EvidenceStore(),item=store.addDefectIntake(v.candidate,bound);
 assert.equal(item.kind,"defect-intake");
 assert.equal(item.status,"pass");
 assert.deepEqual(item.defect,bound);
 assert.throws(()=>store.addDefectIntake(v.candidate,bound),/consumed/);
 const path=join(v.repository,"../",`intake-${sequence}.json`),key=randomBytes(32);
 t.after(()=>rm(path,{force:true}));
 await saveEvidence(path,v.candidate,store,key);
 const restored=await loadEvidence(path,v.candidate,key);
 assert.deepEqual(restored.forCandidate(v.candidate),store.forCandidate(v.candidate));
 assert.throws(()=>new EvidenceStore().addDefectIntake(v.candidate,restored.forCandidate(v.candidate)[0]!.defect!),/genuine/);
 for(const other of [{...v.candidate,id:"otro"},{...v.candidate,repository:"otro"},{...v.candidate,revision:"f".repeat(40)},{...v.candidate,createdAt:"otro"}])await assert.rejects(()=>loadEvidence(path,other,key),/mismatch/);
 await assert.rejects(()=>loadEvidence(path,v.candidate,randomBytes(32)),/integrity/);
 assert.equal(Object.isFrozen(restored.forCandidate(v.candidate)[0]!.defect!.runtimeJourney.command),true);
 const hook='data:text/javascript,import{registerHooks}from"node:module";registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.endsWith(".js"))return n(s.slice(0,-3)+".ts",c);throw e}}})';
 const childCode=`import assert from "node:assert/strict";import{EvidenceStore,loadEvidence}from ${JSON.stringify(new URL("../src/evidence/store.ts",import.meta.url).href)};
 const c=JSON.parse(process.env.ASEN_D4_CANDIDATE);
 const s=await loadEvidence(process.env.ASEN_D4_PATH,c,Buffer.from(process.env.ASEN_D4_KEY,"hex"));
 const item=s.forCandidate(c)[0];
 assert.throws(()=>new EvidenceStore().addDefectIntake(c,item.defect),/genuine/);console.log(JSON.stringify({items:s.forCandidate(c).length,kind:item.kind,live:false}));`;
 const output=execFileSync(process.execPath,["--experimental-transform-types","--import",hook,"--input-type=module","-e",childCode],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:{...process.env,ASEN_D4_CANDIDATE:JSON.stringify(v.candidate),ASEN_D4_PATH:path,ASEN_D4_KEY:key.toString("hex")}});
 assert.deepEqual(JSON.parse(output),{items:1,kind:"defect-intake",live:false});
});
test("D4 consume el binding antes de rechazar identidad inválida",async(t:TestContext)=>{
 for(const tipo of ["identidad","proxy","accessor"]){
  const {v,bound}=await d4Bound(t),store=new EvidenceStore();let llamadas=0;
  let candidate:Candidate={...v.candidate,id:"otro"};
  if(tipo==="proxy")candidate=new Proxy(v.candidate,{getPrototypeOf(){llamadas++;
 return Object.prototype;}});
  if(tipo==="accessor"){candidate={...v.candidate};Object.defineProperty(candidate,"id",{enumerable:true,get(){llamadas++;
 return v.candidate.id;}});}
  assert.throws(()=>store.addDefectIntake(candidate,bound),/mismatch|plain|shape/);
 assert.equal(llamadas,0);
  assert.throws(()=>store.addDefectIntake(v.candidate,bound),/consumed/);
 assert.equal(store.forCandidate(v.candidate).length,0);
 }
});
test("D4 rechaza clones y registros firmados con deriva semántica",async(t:TestContext)=>{
 const {v,bound}=await d4Bound(t),store=new EvidenceStore();
 assert.throws(()=>store.addDefectIntake(v.candidate,structuredClone(bound)),/genuine/);
 store.addDefectIntake(v.candidate,bound);
 const path=join(v.repository,"../",`intake-tamper-${sequence}.json`),key=randomBytes(32);
 t.after(()=>rm(path,{force:true}));
 await saveEvidence(path,v.candidate,store,key);
 const original=JSON.parse(await readFile(path,"utf8"));
 const mutations=[(r:any)=>r.value.items[0].defect.extra=true,(r:any)=>r.value.items[0].defect.reproduction.observation.extra=true,(r:any)=>r.value.items[0].defect.reproduction.candidate.id="otro",(r:any)=>r.value.items[0].defect.runtimeJourney.command=["falso"],(r:any)=>r.value.items[0].defect.operatorFlows[0].failureTo="continuar",(r:any)=>r.value.items[0].defect.rollback.targetRevision="f".repeat(40),(r:any)=>r.value.items[0].defect.forecast.changedLines=390,(r:any)=>r.value.items[0].status="fail",(r:any)=>r.value.items[0].id="falso",(r:any)=>r.value.items[0].defect.reproduction.issueUrl+="0",(r:any)=>r.value.items[0].defect.reproduction.observation.assertionFingerprint="falso",(r:any)=>r.value.items[0].defect.reproduction.observation.failingCaseIds=["negative control"]];
 for(const mutate of mutations){const raw=structuredClone(original);mutate(raw);
 raw.mac=createHmac("sha256",key).update("asen.evidence.v2\0").update(JSON.stringify(raw.value)).digest("hex");
 await writeFile(path,JSON.stringify(raw));
 await assert.rejects(()=>loadEvidence(path,v.candidate,key));}
 const legacy=structuredClone(original);
 legacy.value.version=1;
 legacy.mac=createHmac("sha256",key).update(JSON.stringify(legacy.value)).digest("hex");
 await writeFile(path,JSON.stringify(legacy));
 await assert.rejects(()=>loadEvidence(path,v.candidate,key),/semantics|legacy/);
});
test("D5 exige intake genuino para autorización y Dispatcher; recuperación conserva el gate",async(t:TestContext)=>{
 const v=await fixture(t),store=new EvidenceStore();
 for(const kind of ["work-unit","scope","rollback"] as const)store.add(v.candidate,{id:kind,kind,status:"pass",summary:"acotada",createdAt:"ahora"});
 const context=issueSkillContext("d5-worker",v.repository,v.candidate,{phase:"apply",defect:true}),skills=selectSkills(context),decision=issueOddDecision({taskId:"d5-worker",repository:v.repository,paths:["src/"],writes:[{path:"src/",changeKind:"behavior"}]}),plan=buildOrchestrationPlan({taskId:"d5-worker",repository:v.repository,prompt:"corregir",candidate:v.candidate},decision),applicability=decideLifecycleApplicability(plan.decision,{taskIdentity:"d5-worker",repositoryIdentity:v.repository,candidate:{id:v.candidate.id,repository:v.candidate.repository,revision:v.candidate.revision},explicitMode:"unspecified",affectedSubsystems:["defect"],expectedPaths:["src/"],requiredArtifacts:[]}),writerAdmission=issueOrganicWriterAdmission(applicability,["src/"]),request={id:"d5-worker",role:"worker" as const,repository:v.repository,candidate:v.candidate,skillContext:context,skillPaths:skills.map(s=>s.path),writeSurfaces:["src/"],writerAdmission,prompt:"corregir"};
 let llamadas=0;const dispatcher=new Dispatcher({run:async r=>{llamadas++;return{id:r.id,ok:true,output:"observado"};}},store);
 assert.throws(()=>authorizeImplementation(v.candidate,context,store),/defect-intake/);
 await assert.rejects(()=>dispatcher.dispatch(request),/defect-intake/);assert.equal(llamadas,0);
 const binding=bindRddDefectEvidence(recordRddReproduction(v.snapshot,v.input,v.first,v.second),d3Input(v));store.addDefectIntake(v.candidate,binding);
 assert.equal(authorizeImplementation(v.candidate,context,store).target,"IMPLEMENTING");
 assert.equal((await dispatcher.dispatch(request)).ok,true);assert.equal(llamadas,1);
 await assert.rejects(()=>dispatcher.dispatch(request),/unused worker context/);assert.equal(llamadas,1);
 const path=join(v.repository,"d5-evidence.json"),key=randomBytes(32);await saveEvidence(path,v.candidate,store,key);const recovered=await loadEvidence(path,v.candidate,key);
 assert.equal(verifySkillEvidence(v.candidate,skills.map(s=>s.id),recovered,"mutation").ok,true);
 for(const other of [{...v.candidate,id:"otro"},{...v.candidate,repository:"otro"},{...v.candidate,revision:"f".repeat(40)}])assert.equal(verifySkillEvidence(other,skills.map(s=>s.id),recovered,"mutation").ok,false);
 assert.throws(()=>new EvidenceStore().addDefectIntake(v.candidate,recovered.forCandidate(v.candidate).find(i=>i.kind==="defect-intake")!.defect!),/genuine/);
});
