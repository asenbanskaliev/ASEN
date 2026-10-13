import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";
// @ts-expect-error Preflight is a small Node-side Actions helper.
const preflight=await import("../scripts/eco07-pi-recovery-preflight.mjs");
const {
 ECO07_RECOVERY_CONTRACT,
 observeEco07InstalledRuntimeForTest,
 observeEco07RecoveryCheckout,
 runEco07RecoveryPreflight,
 validateEco07InstalledRuntime,
 validateEco07RecoveryPreflight,
}=preflight;
// @ts-expect-error Provider selection is a small Node-side Actions helper.
import {validateEco07ProviderSelection} from "../scripts/eco07-provider-config.mjs";

const SHA="3dbd333d7ee03d2d756df60c21ad77fab96bd7c4";
const MERGE_SHA="1111111111111111111111111111111111111111";
const REPOSITORY="asenbanskaliev/ASEN";
const BRANCH="feat/strict-parity-prerequisites";
const validEnvironment=()=>({
 ASEN_TRIGGER_KIND:"manual",
 ASEN_REPOSITORY:REPOSITORY,
 ASEN_RUN_ATTEMPT:"1",
 ASEN_SELECTED_OS:"ubuntu-24.04",
 ASEN_EXPECTED_SHA:SHA,
 ASEN_GITHUB_SHA:SHA,
 ASEN_EVENT_HEAD_SHA:SHA,
 ASEN_DISPATCH_BRANCH:BRANCH,
 ASEN_EXPECTED_BRANCH:BRANCH,
 ASEN_ECO07_PROVIDER:"groq",
 ASEN_ECO07_MODEL:"openai/gpt-oss-120b",
});
const validPullRequestEnvironment=()=>({
 ...validEnvironment(),
 ASEN_TRIGGER_KIND:"pull_request",
 ASEN_GITHUB_SHA:MERGE_SHA,
 ASEN_EVENT_HEAD_SHA:SHA,
 ASEN_PR_NUMBER:"32",
 ASEN_PR_BASE_BRANCH:"main",
 ASEN_PR_HEAD_REPOSITORY:REPOSITORY,
 ASEN_PR_HEAD_BRANCH:BRANCH,
 ASEN_EVENT_LABEL:"eco07:run-ubuntu",
 ASEN_DISPATCH_BRANCH:"",
});
const validObservation=()=>({
 head:SHA,
 missingFiles:[],
 evidenceDestination:{exists:true,isDirectory:true,entries:[]},
});
function write(repository:string,file:string,contents="fixture"){
 const target=join(repository,file);mkdirSync(resolve(target,".."),{recursive:true});writeFileSync(target,contents);
}
function checkoutFixture(kind:"detached"|"loose"|"linked"){
 const root=mkdtempSync(join(tmpdir(),"eco07-preflight-")),repository=join(root,"worktree");mkdirSync(repository);
 for(const file of ECO07_RECOVERY_CONTRACT.requiredFiles)write(repository,file);
 mkdirSync(join(repository,ECO07_RECOVERY_CONTRACT.evidenceDirectory));
 if(kind==="linked"){
  const git=join(root,"common","worktrees","w1");mkdirSync(git,{recursive:true});
  write(repository,".git","gitdir: ../common/worktrees/w1\n");write(git,"HEAD","ref: refs/heads/feature\n");write(git,"commondir","../..\n");write(join(root,"common"),"packed-refs",`${SHA} refs/heads/feature\n`);
 }else{
  mkdirSync(join(repository,".git"));
  write(join(repository,".git"),"HEAD",kind==="detached"?`${SHA}\n`:"ref: refs/heads/feature\n");
  if(kind==="loose")write(join(repository,".git"),"refs/heads/feature",`${SHA}\n`);
 }
 return {root,repository};
}
function runtimeFixture(options:{integrity?:string;piVersion?:string;omitTsx?:boolean}={}){
 const fixture=checkoutFixture("detached"),piVersion=options.piVersion??"1.1.0";
 write(fixture.repository,"package.json",JSON.stringify({name:"fixture"}));
 write(fixture.repository,"package-lock.json",JSON.stringify({lockfileVersion:3,packages:{
  "node_modules/@earendil-works/pi-coding-agent":{version:"1.1.0",resolved:"https://registry.npmjs.org/@earendil-works/pi-coding-agent/-/pi-coding-agent-1.1.0.tgz",integrity:options.integrity??ECO07_RECOVERY_CONTRACT.piIntegrity},
  "node_modules/tsx":{version:"4.23.15"},
  "node_modules/typescript":{version:"5.9.3"},
 }}));
 write(fixture.repository,"node_modules/@earendil-works/pi-coding-agent/package.json",JSON.stringify({name:"@earendil-works/pi-coding-agent",version:piVersion,main:"dist/index.js",bin:{pi:"dist/bundle/cli.js"}}));
 write(fixture.repository,"node_modules/@earendil-works/pi-coding-agent/dist/index.js","export {};\n");
 write(fixture.repository,"node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js","export {};\n");
 if(!options.omitTsx){
  write(fixture.repository,"node_modules/tsx/package.json",JSON.stringify({name:"tsx",version:"4.23.15",main:"dist/loader.mjs"}));
  write(fixture.repository,"node_modules/tsx/dist/loader.mjs","export {};\n");
 }
 write(fixture.repository,"node_modules/typescript/package.json",JSON.stringify({name:"typescript",version:"5.9.3",bin:{tsc:"bin/tsc"}}));
 write(fixture.repository,"node_modules/typescript/bin/tsc","#!/usr/bin/env node\n");
 return fixture;
}

test("ECO-07 checkout observation handles detached, loose, and linked packed Git layouts",()=>{
 for(const kind of ["detached","loose","linked"] as const){
  const fixture=checkoutFixture(kind);
  try{assert.equal(observeEco07RecoveryCheckout(fixture.repository).head,SHA);}
  finally{rmSync(fixture.root,{recursive:true,force:true});}
 }
});

test("ECO-07 declared runtime values cannot substitute for installed dependencies",()=>{
 const fixture=checkoutFixture("detached");
 try{
  write(fixture.repository,"package-lock.json",JSON.stringify({lockfileVersion:3,packages:{}}));
  assert.throws(()=>runEco07RecoveryPreflight(validEnvironment(),fixture.repository),/installed|lockfile|Node/u);
  assert.ok(ECO07_RECOVERY_CONTRACT.requiredFiles.includes("package-lock.json"));
 }finally{rmSync(fixture.root,{recursive:true,force:true});}
});

test("ECO-07 installed runtime observation validates local Pi and tool entrypoints",()=>{
 const fixture=runtimeFixture();
 try{
  const observation=observeEco07InstalledRuntimeForTest(fixture.repository,"22.19.0");
  const result=validateEco07InstalledRuntime(observation);
  assert.equal(result.piVersion,"1.1.0");
  assert.match(result.piEntrypoint,/node_modules\/@earendil-works\/pi-coding-agent\/dist\/index\.js$/u);
  assert.throws(()=>validateEco07InstalledRuntime({...observation,nodeVersion:"24.0.0"}),/actual Node version/u);
 }finally{rmSync(fixture.root,{recursive:true,force:true});}
});

test("ECO-07 runtime containment compares canonical paths across macOS temp aliases",{skip:process.platform==="win32"},()=>{
 const fixture=runtimeFixture(),alias=join(fixture.root,"worktree-alias");
 try{
  symlinkSync(fixture.repository,alias,"dir");
  const observation=observeEco07InstalledRuntimeForTest(alias,"22.19.0");
  assert.equal(observation.piEntrypoint,"node_modules/@earendil-works/pi-coding-agent/dist/index.js");
  assert.equal(validateEco07InstalledRuntime(observation).piVersion,"1.1.0");
 }finally{rmSync(fixture.root,{recursive:true,force:true});}
});

test("ECO-07 installed runtime fails closed for bad pins and dependencies",()=>{
 for(const [options,pattern] of [
  [{integrity:"sha512-wrong"},/lockfile Pi pin or integrity/u],
  [{piVersion:"1.2.0"},/installed repository-local Pi/u],
  [{omitTsx:true},/installed tsx package/u],
 ] as const){
  const fixture=runtimeFixture(options);
  try{
   assert.throws(()=>validateEco07InstalledRuntime(observeEco07InstalledRuntimeForTest(fixture.repository,"22.19.0")),pattern);
  }finally{rmSync(fixture.root,{recursive:true,force:true});}
 }
});

test("ECO-07 preflight admits each enumerated runner without credentials or launch hooks",()=>{
 assert.deepEqual(ECO07_RECOVERY_CONTRACT.operatingSystems,["ubuntu-24.04","macos-15","windows-2025"]);
 for(const operatingSystem of ECO07_RECOVERY_CONTRACT.operatingSystems){
  const accessed:string[]=[];
  const environment=new Proxy({...validEnvironment(),ASEN_SELECTED_OS:operatingSystem},{
   get(target,key,receiver){
    const name=String(key);accessed.push(name);
    if(name.endsWith("_API_KEY"))throw new Error("preflight accessed a credential");
    return Reflect.get(target,key,receiver);
   },
  });
  const result=validateEco07RecoveryPreflight(environment,validObservation());
  assert.equal(result.operatingSystem,operatingSystem);
  assert.equal(result.provider,"groq");
  assert.ok(!accessed.some(key=>key.endsWith("_API_KEY")));
  assert.deepEqual(Object.keys(result).sort(),["branch","candidate","evidenceDirectory","eventHeadSha","githubSha","model","operatingSystem","provider","triggerKind"].sort());
 }
});

test("ECO-07 preflight admits manual dispatch and the exact labeled PR32 route",()=>{
 const manual=validateEco07RecoveryPreflight(validEnvironment(),validObservation());
 assert.equal(manual.triggerKind,"manual");
 assert.equal(manual.eventHeadSha,SHA);
 const pullRequest=validateEco07RecoveryPreflight(validPullRequestEnvironment(),validObservation());
 assert.equal(pullRequest.triggerKind,"pull_request");
 assert.equal(pullRequest.eventHeadSha,SHA);
 assert.equal(pullRequest.githubSha,MERGE_SHA);
 assert.throws(()=>validateEco07RecoveryPreflight({...validPullRequestEnvironment(),ASEN_GITHUB_SHA:SHA},validObservation()),/must remain the event merge SHA/u);
});

test("ECO-07 preflight rejects unapproved manual OS, SHA, branch, and metadata",()=>{
 const rejects=(environment:Record<string,string>,observation=validObservation(),pattern:RegExp)=>
  assert.throws(()=>validateEco07RecoveryPreflight(environment,observation),pattern);
 rejects({...validEnvironment(),ASEN_SELECTED_OS:"ubuntu-latest"},validObservation(),/operating system/);
 rejects({...validEnvironment(),ASEN_EXPECTED_SHA:"abc"},validObservation(),/expected SHA/);
 rejects({...validEnvironment(),ASEN_GITHUB_SHA:"1".repeat(40)},validObservation(),/GitHub SHA/);
 rejects(validEnvironment(),{...validObservation(),head:"1".repeat(40)},/checked-out HEAD/);
 rejects({...validEnvironment(),ASEN_DISPATCH_BRANCH:"main"},validObservation(),/dispatch branch/);
 rejects({...validEnvironment(),ASEN_EXPECTED_BRANCH:"main"},validObservation(),/approved branch/);
 rejects({...validEnvironment(),ASEN_REPOSITORY:"other/repository"},validObservation(),/repository/);
 rejects({...validEnvironment(),ASEN_RUN_ATTEMPT:"2"},validObservation(),/run attempt/);
 rejects({...validEnvironment(),ASEN_EVENT_HEAD_SHA:MERGE_SHA},validObservation(),/event head SHA/);
 rejects({...validEnvironment(),ASEN_TRIGGER_KIND:"push"},validObservation(),/trigger/);
});

test("ECO-07 PR route fails closed for every non-authorized label event",()=>{
 const rejects=(changes:Record<string,string>,pattern:RegExp,observation=validObservation())=>
  assert.throws(()=>validateEco07RecoveryPreflight({...validPullRequestEnvironment(),...changes},observation),pattern);
 rejects({ASEN_PR_HEAD_REPOSITORY:"fork/ASEN"},/head repository/);
 rejects({ASEN_EVENT_LABEL:""},/event label/);
 rejects({ASEN_EVENT_LABEL:"eco07:run-windows"},/event label/);
 rejects({ASEN_PR_NUMBER:"31"},/pull request/);
 rejects({ASEN_PR_BASE_BRANCH:"develop"},/base branch/);
 rejects({ASEN_PR_HEAD_BRANCH:"feat/other"},/head branch/);
 rejects({ASEN_SELECTED_OS:"macos-15"},/Ubuntu/);
 rejects({ASEN_RUN_ATTEMPT:"2"},/run attempt/);
 rejects({ASEN_PR_NUMBER:""},/pull request/);
 rejects({ASEN_EVENT_HEAD_SHA:"abc"},/event head SHA/);
 rejects({ASEN_EVENT_HEAD_SHA:MERGE_SHA},/event head SHA/);
 rejects({},/checked-out HEAD/,{...validObservation(),head:MERGE_SHA});
});

test("ECO-07 preflight requires pinned selections and pristine evidence output",()=>{
 assert.throws(()=>validateEco07RecoveryPreflight({...validEnvironment(),ASEN_ECO07_PROVIDER:"openrouter"},validObservation()),/provider/);
 assert.throws(()=>validateEco07RecoveryPreflight({...validEnvironment(),ASEN_ECO07_MODEL:"other"},validObservation()),/model/);
 assert.throws(()=>validateEco07RecoveryPreflight(validEnvironment(),{...validObservation(),missingFiles:["extensions/asen.ts"]}),/required file/);
 assert.throws(()=>validateEco07RecoveryPreflight(validEnvironment(),{...validObservation(),evidenceDestination:{exists:false,isDirectory:false,entries:[]}}),/evidence directory/);
 assert.throws(()=>validateEco07RecoveryPreflight(validEnvironment(),{...validObservation(),evidenceDestination:{exists:true,isDirectory:true,entries:["old.json"]}}),/not clean/);
});

test("ECO-07 provider selection validates model metadata without resolving a key",()=>{
 const environment=new Proxy({ASEN_ECO07_PROVIDER:"groq",ASEN_ECO07_MODEL:"openai/gpt-oss-120b"},{
  get(target,key,receiver){if(String(key).endsWith("_API_KEY"))throw new Error("credential resolution attempted");return Reflect.get(target,key,receiver);},
 });
 assert.deepEqual(validateEco07ProviderSelection(environment),{provider:"groq",model:"openai/gpt-oss-120b",credential:"GROQ_API_KEY"});
});

test("ECO-07 workflow preflights one selected OS before exposing credentials",()=>{
 const workflow=readFileSync(resolve(".github/workflows/eco07-groq-recovery.yml"),"utf8");
 const compact=workflow.replace(/\s+/gu," ");
 assert.ok(compact.includes("required: true type: choice"));
 assert.ok(compact.includes("runs-on: >- ${{ github.event_name == 'pull_request' && 'ubuntu-24.04' || inputs.os }}"));
 assert.ok(!workflow.includes("matrix:"));
 const boundary=workflow.indexOf("eco07-pi-recovery-preflight.mjs boundary");
 const install=workflow.indexOf("npm ci"),runtime=workflow.indexOf("eco07-pi-recovery-preflight.mjs runtime"),secret=workflow.indexOf("secrets.GROQ_API_KEY");
 assert.ok(boundary<install&&install<runtime&&runtime<secret);
 assert.ok(!workflow.includes("npm install -g"));
 assert.ok(workflow.includes("ASEN_GITHUB_SHA: ${{ github.sha }}"));
 assert.ok(compact.includes("ASEN_EVENT_HEAD_SHA: >- ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}"));
 assert.ok(workflow.includes("ASEN_EXPECTED_SHA: ${{ env.ASEN_RESOLVED_EXPECTED_SHA }}"));
 assert.ok(workflow.includes("ref: ${{ env.ASEN_RESOLVED_EXPECTED_SHA }}"));
 assert.ok(workflow.includes("ASEN_EXPECTED_BRANCH: feat/strict-parity-prerequisites"));
});
