/** R4-04: two real isolated Pi hosts. No model is invoked in this phase.
 * Native startup and registered commands are useful host evidence, but cannot
 * be promoted to any C01-C20 functional comparison.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync,readdirSync} from "node:fs";
import {join,resolve,dirname,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {buildShellAsenReadiness,validateShellAsenBaseline,validateShellAsenScenarios} from "./shell-asen-parity.mjs";
import {FIRST_FIVE_FIXTURE,fingerprintFirstFiveFixture} from "./r4-first-five-preflight.mjs";

const repo=dirname(dirname(fileURLToPath(import.meta.url)));
const require=createRequire(join(repo,"package.json"));
const SHA=/^[a-f0-9]{40}$/u;
const hash=value=>createHash("sha256").update(value).digest("hex");
const sourceNames=Object.freeze(["SHELL","ASEN"]);
const MODEL_CASE_IDS=Object.freeze(Array.from({length:20},(_,i)=>"C"+String(i+1).padStart(2,"0")));
const secretName=/^(?:.*(?:_KEY|_TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL).*)$/iu;

export function preparePairPlan({candidateSha,baseline,scenarios,modelBudget=0}){
 assert.match(candidateSha??"",SHA);
 assert.equal(modelBudget,0,"This real-host probe must be provider-free");
 validateShellAsenBaseline(baseline);
 const cases=validateShellAsenScenarios(scenarios);
 const rows=cases.map(c=>({id:c.id,scenario:c.mode,
  requiresHumanConsent:c.requiresHumanConsent,observations:[
   {source:"SHELL",status:"NOT_EXECUTED"},{source:"ASEN",status:"NOT_EXECUTED"}],
  blockers:[
   ...(c.requiresHumanConsent?["HUMAN_CONSENT_NOT_OBTAINED"]:[]),
   "MODEL_AND_FUNCTIONAL_CASE_NOT_RUN",
   "NO_INDEPENDENT_COMPARABLE_TRACES",
  ]}));
 assert.deepEqual(rows.map(x=>x.id),MODEL_CASE_IDS);
 return Object.freeze({schema:"asen-r4-native-pi-pair-plan/v1",
  candidateSha,referenceSha:baseline.reference.commit,version:baseline.reference.packageVersion,
  sources:sourceNames,cases:rows,requiredSlots:40,
  sourceCasesExecuted:0,full:false});
}
export function attestPairHostSessions({plan,hosts,runId,runAttempt}){
 assert.equal(plan?.schema,"asen-r4-native-pi-pair-plan/v1");
 assert.match(String(runId??""),/^[1-9][0-9]*$/u);
 assert.match(String(runAttempt??""),/^[1-9][0-9]*$/u);
 assert.ok(hosts&&Object.keys(hosts).sort().join(",")==="ASEN,SHELL",
  "Exactly two real Pi host sessions required");
 for(const source of sourceNames){
  const record=hosts[source];
  assert.equal(record?.source,source);
  assert.equal(record?.candidateSha,plan.candidateSha);
  assert.equal(record?.referenceSha,plan.referenceSha);
  assert.equal(record?.runtimeHost,"@earendil-works/pi-coding-agent");
  assert.equal(record?.runtimeVersion,"1.2.0");
  assert.match(record?.outputDigest??"",/^[a-f0-9]{64}$/u);
  assert.match(record?.projectFingerprint??"",/^[a-f0-9]{64}$/u);
  assert.equal(record?.sessionStartObserved,true,"No observed Pi session_start");
  assert.equal(record?.nativeExtensionLoaded,true,"Pi source extension not loaded");
  assert.equal(record?.startupCommandIssued,true);
  assert.equal(record?.modelRequests,0);
  assert.equal(record?.projectModified,false,"Real host unexpectedly changed the project");
  assert.equal(record?.userAuthorizationGranted,false);
 }
 assert.equal(hosts.SHELL.projectFingerprint,hosts.ASEN.projectFingerprint,
  "Different fixture content invalidates the pair");
 const rows=plan.cases.map(c=>({...c,observations:c.observations.map(o=>({
  ...o,hostBootVerified:true,scenarioExecuted:false}))}));
 return Object.freeze({
  schema:"asen-r4-two-real-pi-hosts/v1",mode:"PROVIDER_FREE_NATIVE_STARTUP_ONLY",
  candidateSha:plan.candidateSha,referenceSha:plan.referenceSha,
  hosts:sourceNames.map(source=>hosts[source]),runId:String(runId),runAttempt:String(runAttempt),
  requiredSlots:40,sourceCasesExecuted:0,verifiedCasePairs:0,
  cases:rows,independentReviewPerformed:false,humanConsentReceived:false,
  globalFull:false,
  disclaimer:"Both real Pi host sessions ran, but no model-driven C01-C20 paired scenario was executed; source extension startup, command dispatch and matching fixture are NOT FULL parity.",
 });
}
const safeEnv=(home,agentDir)=>{
 const env={};
 for(const key of ["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TMPDIR","TMP","TEMP"])
  if(process.env[key]&&!secretName.test(key))env[key]=process.env[key];
 return {...env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:agentDir,
  ASEN_NO_SKILL_REGISTRY:"1",PI_TELEMETRY:"0",PI_OFFLINE:"1",
  GIT_TERMINAL_PROMPT:"0",TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0",
  COLORTERM:""};
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const normalized=raw=>raw.replace(/\u001b\][^\u0007]*\u0007/gu,"")
 .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu,"")
 .replace(/\u001b[@-Z\\-_]/gu,"");
function installFixture(project){
 mkdirSync(join(project,"src"),{recursive:true});
 for(const [file,content] of Object.entries(FIRST_FIVE_FIXTURE.files)){
  const target=join(project,file);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content,{flag:"wx"});
 }
 return fingerprintFirstFiveFixture();
}
function checkReference(checkout,baseline){
 assert.ok(isAbsolute(checkout)&&realpathSync(checkout)===checkout,"Reference checkout must be absolute and canonical");
 const git=(...args)=>execFileSync("git",["-C",checkout,...args],{encoding:"utf8",timeout:6000}).trim();
 assert.equal(git("rev-parse","HEAD"),baseline.reference.commit,"Wrong Shell source commit");
 assert.equal(git("rev-parse","HEAD^{tree}"),baseline.reference.tree,"Wrong Shell tree");
 const pkg=JSON.parse(readFileSync(join(checkout,"package.json"),"utf8"));
 assert.equal(pkg.name,"gen"+"tle-pi");
 assert.equal(pkg.version,baseline.reference.packageVersion);
 assert.ok(existsSync(join(checkout,"extensions","gentle-shell.ts")),"Missing actual Shell extension");
 assert.ok(existsSync(join(checkout,"node_modules","@earendil-works","pi-coding-agent")),
  "Reference runtime dependencies were not provisioned");
}
async function runOne({source,project,home,probe,extension,binary,candidateSha,referenceSha,runRoot}){
 const ready=join(runRoot,"ready-"+source),shutdown=join(runRoot,"stop-"+source);
 const env=safeEnv(home,join(home,"agent"));
 const contents=[
  'import {existsSync,writeFileSync} from "node:fs";',
  'export default function(pi){',
  ' pi.on("before_agent_start",()=>{throw new Error("R4 forbids inference in host-only phase");});',
  ' pi.on("session_start",(_event,ctx)=>{',
  '  writeFileSync('+JSON.stringify(ready)+',JSON.stringify({kind:"session_start",source:'+JSON.stringify(source)+'}));',
  '  const p=setInterval(()=>{if(existsSync('+JSON.stringify(shutdown)+')){clearInterval(p);clearTimeout(t);ctx.shutdown();}},120);',
  '  const t=setTimeout(()=>{clearInterval(p);ctx.shutdown();},55000);',
  ' });','}'
 ].join("\n")+"\n";
 writeFileSync(probe,contents,{flag:"wx",mode:0o600});
 const {spawn}=require("node-pty");
 const args=[binary,"--no-extensions","--extension",extension,"--extension",probe,
  "--no-skills","--no-builtin-tools","--provider","openai","--model","gpt-4o"];
 const child=spawn(process.execPath,args,{cwd:project,env,cols:120,rows:38,name:"xterm-256color"});
 let buffer="",exited=null;
 child.onData(chunk=>{buffer=(buffer+chunk).slice(-180000);});
 child.onExit(result=>{exited=result;});
 let started=false,commandIssued=false;
 try{
  for(let attempt=0;attempt<160&&!existsSync(ready)&&!exited;attempt++)await sleep(250);
  started=existsSync(ready);
  assert.ok(started,"Real "+source+" Pi session did not emit session_start. Log "+normalized(buffer).slice(-1000));
  assert.ok(!/Failed to load extension|extension loading error|Error loading extension/iu.test(normalized(buffer)),
   "Real "+source+" extension failed loading");
  const command=source==="SHELL"?"/gentle:status":"/asen-status";
  const previous=buffer.length;
  child.write(command+"\r");commandIssued=true;
  for(let j=0;j<30&&!exited;j++){await sleep(200);if(buffer.length>previous+20)break;}
  assert.ok(buffer.length>previous+20,"Real "+source+" host did not respond to its source command");
  if(exited)throw Error("Real "+source+" Pi exited before requested shutdown");
  writeFileSync(shutdown,"1",{flag:"wx"});
  for(let i=0;i<100&&!exited;i++)await sleep(120);
  if(!exited)throw Error("Real "+source+" Pi shutdown was not observed");
  const view=normalized(buffer);
  return {source,candidateSha,referenceSha,runtimeHost:"@earendil-works/pi-coding-agent",
   runtimeVersion:"1.2.0",sessionStartObserved:true,
   nativeExtensionLoaded:true,startupCommandIssued:commandIssued,
   outputDigest:hash(buffer),projectFingerprint:fingerprintFirstFiveFixture(),
   modelRequests:0,projectModified:false,userAuthorizationGranted:false,
   exitCode:exited.exitCode,command,outputChars:view.length,
   outputSnippet:view.slice(-320)};
 }finally{if(!exited)try{child.kill();}catch{/*fail closed*/}}
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(process.env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 assert.equal(process.env.GITHUB_EVENT_NAME,"push");
 const sha=process.env.ASEN_EXPECTED_SHA;
 assert.match(sha??"",SHA);
 assert.equal(execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
 assert.ok(isAbsolute(process.env.RUNNER_TEMP??""));
 const baseline=JSON.parse(readFileSync(join(repo,"registry/parity/shell-asen-baseline-v1.json"),"utf8"));
 const scenarios=JSON.parse(readFileSync(join(repo,"registry/parity/shell-asen-case-readiness-v1.json"),"utf8"));
 const plan=preparePairPlan({candidateSha:sha,baseline,scenarios});
 const shell=resolve(process.env.ASEN_SHELL_CHECKOUT??"");
 checkReference(shell,baseline);
 const piMeta=JSON.parse(readFileSync(join(repo,"node_modules/@earendil-works/pi-coding-agent/package.json"),"utf8"));
 assert.equal(piMeta.version,"1.2.0");
 const bin=join(repo,"node_modules/@earendil-works/pi-coding-agent",
  typeof piMeta.bin==="string"?piMeta.bin:piMeta.bin.pi);
 const root=realpathSync(mkdtempSync(join(process.env.RUNNER_TEMP,"asen-two-pi-")));
 const hosts={};
 try{
  for(const source of sourceNames){
   const home=join(root,source,"home"),project=join(root,source,"project");
   mkdirSync(home,{recursive:true,mode:0o700});mkdirSync(project,{recursive:true});
   installFixture(project);
   const probe=join(root,source,"observe.ts");
   const extension=source==="SHELL"?join(shell,"extensions","gentle-shell.ts"):join(repo,"extensions","asen.ts");
   hosts[source]=await runOne({source,project,home,probe,extension,binary:bin,
    candidateSha:sha,referenceSha:plan.referenceSha,runRoot:root});
   for(const file of Object.keys(FIRST_FIVE_FIXTURE.files)){
    assert.equal(readFileSync(join(project,file),"utf8"),FIRST_FIVE_FIXTURE.files[file],
     "Real "+source+" host changed fixture file "+file);
   }
   assert.deepEqual(readdirSync(project).sort(),["README.md","src"]);
  }
  const report=attestPairHostSessions({plan,hosts,runId:process.env.GITHUB_RUN_ID,
   runAttempt:process.env.GITHUB_RUN_ATTEMPT});
  mkdirSync("asen-acceptance-evidence",{recursive:true});
  writeFileSync("asen-acceptance-evidence/two-real-pi-hosts.json",JSON.stringify(report,null,2)+"\n",
   {flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:"NATIVE_TWO_PI_HOSTS_OBSERVED",sha,
   hosts:report.hosts.map(x=>({source:x.source,command:x.command,outputChars:x.outputChars})),
   scenariosExecuted:0,casePairsCertified:0,globalFull:false}));
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main();}catch(error){console.error("R4_NATIVE_PI_PAIR_REJECTED: "+
 (error instanceof Error?error.message:"unknown"));process.exitCode=1;}
}
