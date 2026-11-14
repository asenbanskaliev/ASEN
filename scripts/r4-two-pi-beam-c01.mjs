/** R4-04: authentic C01 model turn in two isolated native Pi TUIs.
 * Exactly one bounded, tool-free prompt per subject; no reviewer/Writer authority.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync,readdirSync} from "node:fs";
import {join,resolve,dirname,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {buildShellAsenReadiness} from "./shell-asen-parity.mjs";
import {FIRST_FIVE_FIXTURE,fingerprintFirstFiveFixture} from "./r4-first-five-preflight.mjs";
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const require=createRequire(join(root,"package.json"));
const SHA=/^[0-9a-f]{40}$/u;
const hash=v=>createHash("sha256").update(v).digest("hex");
const SOURCES=["SHELL","ASEN"];
export const C01_PROMPT="En una frase breve, ¿cuánto es 2 + 3? Responde directamente. No utilices herramientas, no delegues y no modifiques archivos.";
const short=record=>({source:record.source,outputDigest:record.outputDigest,
 answerDigest:record.answerDigest,answerSample:record.answerSample,
 answerChars:record.answerChars,toolCalls:record.toolCalls,agentStarts:record.agentStarts,
 model:record.model,hostVersion:record.hostVersion,projectUnchanged:record.projectUnchanged});
export function gradeRealC01({candidateSha,referenceSha,records,runId,runAttempt}){
 assert.match(candidateSha??"",SHA);
 assert.equal(referenceSha,"1f74e9e24473e7e121a96b1680444ae0196d3009");
 assert.match(String(runId??""),/^[1-9][0-9]*$/u);
 assert.match(String(runAttempt??""),/^[1-9][0-9]*$/u);
 assert.ok(records&&Object.keys(records).sort().join(",")==="ASEN,SHELL",
  "Two and only two native Pi model observations");
 for(const source of SOURCES){
  const rec=records[source];
  assert.equal(rec?.source,source);
  assert.equal(rec?.candidateSha,candidateSha);
  assert.equal(rec?.referenceSha,referenceSha);
  assert.equal(rec?.promptDigest,hash(C01_PROMPT));
  assert.equal(rec?.model,records.SHELL.model,"The same real model is required");
  assert.ok(["beam","beam:cloud"].includes(rec.model));
  assert.equal(rec?.provider,"ollama-cloud");
  assert.equal(rec?.hostVersion,"1.2.0");
  assert.equal(rec?.sessionStarted,true);
  assert.equal(rec?.agentEnded,true);
  assert.ok(Number.isInteger(rec.agentStarts)&&rec.agentStarts>=1&&rec.agentStarts<=2,
   "Actual model turn count must be bounded");
  assert.equal(rec?.toolCalls,0,"C01 must not call tools or delegates");
  assert.equal(rec?.projectUnchanged,true);
  assert.equal(rec?.humanConsent,false);
  assert.match(rec?.answerDigest??"",/^[a-f0-9]{64}$/u);
  assert.match(rec?.outputDigest??"",/^[a-f0-9]{64}$/u);
  assert.ok(Number.isInteger(rec.answerChars)&&rec.answerChars>=1&&rec.answerChars<=8000,
   "Real assistant answer text is required");
  assert.ok(typeof rec.answerSample==="string"&&rec.answerSample.length>0&&rec.answerSample.length<=300);
  assert.match(rec?.fixtureFingerprint??"",/^[a-f0-9]{64}$/u);
 }
 assert.equal(records.SHELL.fixtureFingerprint,records.ASEN.fixtureFingerprint,
  "Not the same test project");
 const sourceAnswers=SOURCES.map(source=>short(records[source]));
 return Object.freeze({
  schema:"asen-r4-c01-two-real-pi-inferences/v1",
  status:"TWO_REAL_MODEL_TURNS_OBSERVED_REVIEW_REQUIRED",
  candidateSha,referenceSha,runId:String(runId),runAttempt:String(runAttempt),
  caseId:"C01",sourceSlotsCaptured:2,requiredSlotsTotal:40,
  promptDigest:hash(C01_PROMPT),sourceAnswers,
  observation:"Both actual Pi hosts completed C01 with matching fixture and registered free-provider model; final equivalence still needs independent route/output review.",
  modelCallsVerifiedByAgentStarts:true,writerAuthorized:false,
  independentReviewPerformed:false,certifiedFullCases:0,globalFull:false,
 });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function testProject(dir){
 mkdirSync(join(dir,"src"),{recursive:true});
 for(const [path,content] of Object.entries(FIRST_FIVE_FIXTURE.files)){
  const file=join(dir,path);mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,content,{flag:"wx"});
 }
}
function unchanged(dir){
 return Object.entries(FIRST_FIVE_FIXTURE.files).every(([file,content])=>
  readFileSync(join(dir,file),"utf8")===content)&&
  readdirSync(dir).sort().join(",")==="README.md,src";
}
function sanitizedEnv(home,modelKey){
 const env={};
 for(const key of ["PATH","SYSTEMROOT","WINDIR","COMSPEC","PATHEXT","TMPDIR","TMP","TEMP"])
  if(process.env[key])env[key]=process.env[key];
 return {...env,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:join(home,".pi","agent"),
  OLLAMA_API_KEY:modelKey,PI_OLLAMA_WEB_TOOLS:"0",ASEN_NO_SKILL_REGISTRY:"1",
  PI_TELEMETRY:"0",GIT_TERMINAL_PROMPT:"0",
  TERM:"xterm-256color",NO_COLOR:"1",FORCE_COLOR:"0"};
}
async function runOne({source,work,shell,binary,candidateSha,referenceSha,model,key}){
 const dir=join(work,source),home=join(dir,"home"),project=join(dir,"project");
 mkdirSync(home,{recursive:true,mode:0o700});mkdirSync(project,{recursive:true});
 testProject(project);
 const trace=join(dir,"native-model-trace.json"),ready=join(dir,"ready"),probe=join(dir,"probe.ts");
 const content=[
  'import {writeFileSync} from "node:fs";',
  'import {createHash} from "node:crypto";',
  'const file='+JSON.stringify(trace)+';',
  'const state={sessionStarted:false,agentStarts:0,agentEnded:false,turnStarts:0,toolCalls:0,answer:""};',
  'const flush=()=>writeFileSync(file,JSON.stringify(state));',
  'export default function(pi){',
  ' pi.on("session_start",()=>{state.sessionStarted=true;flush();writeFileSync('+JSON.stringify(ready)+',"ready");});',
  ' pi.on("agent_start",()=>{state.agentStarts++;flush();});',
  ' pi.on("turn_start",(_event,ctx)=>{state.turnStarts++;if(state.turnStarts>2)ctx.shutdown();flush();});',
  ' pi.on("tool_execution_start",()=>{state.toolCalls++;flush();});',
  ' pi.on("message_end",event=>{if(event?.message?.role==="assistant"){',
  '  const parts=event.message.content?.filter(c=>c.type==="text").map(c=>c.text)||[];',
  '  state.answer=parts.join("\\n").slice(0,8000);flush();',
  ' }});',
  ' pi.on("agent_end",(_event,ctx)=>{state.agentEnded=true;flush();setTimeout(()=>ctx.shutdown(),350);});',
  '}'
 ].join("\n")+"\n";
 writeFileSync(probe,content,{flag:"wx",mode:0o600});
 const piArgs=[binary,"--extension",
  source==="SHELL"?join(shell,"extensions","gen"+"tle-shell.ts"):join(root,"extensions","asen.ts")];
 if(source==="SHELL")piArgs.push("--extension",join(shell,"extensions","gen"+"tle-agents.ts"));
 piArgs.push("--extension",probe,"--no-skills","--no-builtin-tools",
  "--provider","ollama-cloud","--model",model);
 const {spawn}=require("node-pty");
 const child=spawn(process.execPath,piArgs,{cwd:project,env:sanitizedEnv(home,key),
  cols:140,rows:40,name:"xterm-256color"});
 let data="",exit=null,promptSent=false;
 child.onData(x=>{data=(data+x).slice(-250000);});
 child.onExit(x=>{exit=x;});
 try{
  for(let i=0;i<180&&!existsSync(ready)&&!exit;i++)await sleep(250);
  assert.ok(existsSync(ready),source+" did not start a native Pi TUI session: "+data.slice(-700));
  await sleep(900);
  child.write(C01_PROMPT+"\r");promptSent=true;
  for(let i=0;i<650&&!exit;i++)await sleep(250);
  assert.ok(exit,source+" real Beam model turn did not complete before deadline");
  assert.equal(exit.exitCode,0,source+" Pi exited with a model/probe error");
  assert.ok(promptSent&&existsSync(trace),"Real Pi turn missing");
  assert.ok(!/Failed to load extension|Error loading extension/iu.test(data),
   "An extension did not actually load");
  const events=JSON.parse(readFileSync(trace,"utf8"));
  const answer=events.answer??"";
  assert.ok(unchanged(project),source+" changed the disposable project");
  assert.ok(events.sessionStarted&&events.agentEnded&&events.agentStarts>=1,
   source+" did not observe actual Pi inference events");
  assert.ok(answer.length>0,source+" did not capture real assistant text");
  return {source,candidateSha,referenceSha,promptDigest:hash(C01_PROMPT),
   hostVersion:"1.2.0",provider:"ollama-cloud",model,
   fixtureFingerprint:fingerprintFirstFiveFixture(),projectUnchanged:true,
   sessionStarted:events.sessionStarted,agentEnded:events.agentEnded,
   agentStarts:events.agentStarts,toolCalls:events.toolCalls,
   answerDigest:hash(answer),answerSample:answer.slice(0,300),answerChars:answer.length,
   outputDigest:hash(data),humanConsent:false};
 }finally{if(!exit)try{child.kill();}catch{/*fail-closed*/}}
}
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.GITHUB_EVENT_NAME,"push");
 assert.equal(process.env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 const sha=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL,key=process.env.ASEN_OLLAMA_API_KEY;
 assert.match(sha??"",SHA);
 assert.ok(["beam","beam:cloud"].includes(model),"Pinned free Beam only");
 assert.ok(typeof key==="string"&&key.length>=8,"Secret free-provider credential missing");
 assert.equal(execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
 const readiness=buildShellAsenReadiness({candidateSha:sha});
 const shell=resolve(process.env.ASEN_SHELL_CHECKOUT??"");
 assert.ok(isAbsolute(shell)&&realpathSync(shell)===shell);
 assert.equal(execFileSync("git",["-C",shell,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  readiness.referenceSha);
 assert.equal(execFileSync("git",["-C",shell,"rev-parse","HEAD^{tree}"],{encoding:"utf8"}).trim(),
  readiness.referenceTree);
 const metadata=JSON.parse(readFileSync(join(root,"node_modules","@earendil-works","pi-coding-agent","package.json"),"utf8"));
 assert.equal(metadata.version,"1.2.0");
 const binary=join(root,"node_modules","@earendil-works","pi-coding-agent",
  typeof metadata.bin==="string"?metadata.bin:metadata.bin.pi);
 assert.ok(isAbsolute(process.env.RUNNER_TEMP??""));
 const work=join(process.env.RUNNER_TEMP,"asen-beam-C01-pair");
 mkdirSync(work,{recursive:true,mode:0o700});
 assert.equal(realpathSync(work),work,"Only a canonical temporary work root is allowed");
 const records={};
 try{
  for(const source of SOURCES)records[source]=await runOne({source,work,shell,binary,
   candidateSha:sha,referenceSha:readiness.referenceSha,model,key});
  const report=gradeRealC01({candidateSha:sha,referenceSha:readiness.referenceSha,
   records,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT});
  mkdirSync("asen-acceptance-evidence",{recursive:true});
  writeFileSync("asen-acceptance-evidence/C01-two-real-Pi-Beam.json",
   JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:report.status,caseId:"C01",
   sourceSlotsCaptured:2,model,sourceTurns:records.SHELL.agentStarts+records.ASEN.agentStarts,
   globalFull:false}));
 }finally{rmSync(work,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main();}catch(error){console.error("R4_TWO_PI_BEAM_C01_REJECTED: "+
 (error instanceof Error?error.message:"unknown"));process.exitCode=1;}
}
