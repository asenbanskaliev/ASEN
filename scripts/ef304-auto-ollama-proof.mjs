/** EF-304 automatic phase: one real free Beam turn, zero Pi write tools.
 * A test driver deliberately simulates decisions ONLY inside disposable Git fixtures.
 * Nothing here is human consent or a live Writer grant.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {captureWriterAuthorizationSnapshot,assertWriterAuthorizationSnapshotCurrent,assertWriterAuthorizationSnapshotOutcome} from "../src/lifecycle/writer-authorization-snapshot.js";

const HASH=/^[0-9a-f]{40}$/u;
const MARKER="EF304_BEAM_PROPOSAL_READY";
const hash=value=>createHash("sha256").update(value).digest("hex");
const git=(dir,...args)=>execFileSync("git",["-C",dir,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();

export function parseBeamProposal(text){
 assert.ok(typeof text==="string"&&text.length>0&&text.length<=8192,"One bounded Pi answer is required");
 const trimmed=text.trim(),fence=trimmed.match(/^`"`(?:json)?\s*([\s\S]*?)\s*`"`$/iu);
 const data=JSON.parse(fence?fence[1]:trimmed);
 assert.ok(data&&typeof data==="object"&&!Array.isArray(data)&&Object.keys(data).sort().join(",")==="marker,path","Exact proposal JSON schema is required");
 assert.equal(data.path,"README.md","Model proposal must keep the approved fixture path");
 assert.equal(data.marker,MARKER,"Model proposal must keep the exact bounded marker");
 return Object.freeze({path:data.path,marker:data.marker});
}
export function mayApplyFixtureDecision({decision,revoked,scope,proposal}){
 return decision==="SIMULATED_ALLOW"&&revoked===false&&Array.isArray(scope)&&
  scope.length===1&&scope[0]==="README.md"&&proposal?.path==="README.md"&&proposal?.marker===MARKER;
}
export function readPiWitness(output){
 const events=output.trim().split(/\r?\n/u).filter(Boolean).map(line=>JSON.parse(line));
 const ended=events.filter(x=>x.type==="agent_end").length;
 const assistant=events.filter(x=>x.type==="message_end"&&x.message?.role==="assistant");
 const answer=assistant.flatMap(x=>x.message.content??[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
 assert.ok(ended>=1&&assistant.length>=1&&answer.length>0,"Actual native Pi agent_end and assistant message required");
 return {answer,agentEndEvents:ended,assistantMessages:assistant.length};
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),"asen-ef304-automatic-"));
 writeFileSync(join(dir,"README.md"),"# Disposable EF-304 fixture\n");
 writeFileSync(join(dir,"outside.txt"),"OUTSIDE_UNCHANGED\n");
 git(dir,"init","-q");
 git(dir,"add","README.md","outside.txt");
 git(dir,"-c","user.name=ASEN Test","-c","user.email=asen@example.invalid","commit","-qm","disposable baseline");
 const revision=git(dir,"rev-parse","HEAD");
 return {dir,candidate:{id:"ef304-"+revision.slice(0,10),repository:dir,revision,createdAt:"fixture"}};
}
function digestFiles(dir){
 return hash(readFileSync(join(dir,"README.md")))+":"+hash(readFileSync(join(dir,"outside.txt")));
}
export async function automaticProof(){
 const repo=resolve("."),sha=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL;
 assert.match(sha??"",HASH,"Exact SHA required");
 assert.equal(git(repo,"rev-parse","HEAD"),sha,"Refuse mismatched candidate");
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.GITHUB_EVENT_NAME,"push");
 assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1","Rerun must not replenish free quota");
 assert.equal(process.env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.ok(model==="beam"||model==="beam:cloud","Only registered free Ollama Beam");
 assert.ok((process.env.OLLAMA_API_KEY??"").length>=8,"Missing scoped provider key");
 assert.ok(process.env.RUNNER_TEMP&&resolve(process.env.RUNNER_TEMP)===process.env.RUNNER_TEMP,"Private runner temp is mandatory");
 const evidence=join(repo,"asen-acceptance-evidence");
 mkdirSync(evidence,{recursive:true});
 const destination=join(evidence,"ef304-automatic-ollama.json");
 const report={schema:"asen-ef304-automatic-ollama/v1",candidateSha:sha,
  provider:"ollama-cloud",model,humanConsentObserved:false,writerGrantIssued:false,
  realWriterAuthorized:false,providerHttpCallsObserved:null,automatedOnly:true,
  independentReviewPerformed:false,globalFull:false,scenarios:[]};
 const fixtures=[];
 try{
  let toolEvents=0;
  const runner=new PiProcessRunner({
   extraArgs:["--no-session","--provider","ollama-cloud","--model",model],
   providerExtension:"npm:pi-ollama-cloud@0.13.1",
   providerCredential:"OLLAMA_API_KEY",noTools:true,timeoutMs:120000,maxOutputBytes:200000,
   onToolExecution(){toolEvents++;}
  });
  const result=await runner.run({id:"ef304-auto-"+sha.slice(0,12),role:"worker",repository:repo,
   prompt:"Propose a harmless edit ONLY for a disposable test project. You have NO tools and NO human approval. Return ONLY a JSON object with exactly two keys, path and marker, whose exact values are README.md and EF304_BEAM_PROPOSAL_READY. No markdown, no other text. You must not claim consent or execute a write."});
  assert.equal(result.ok,true,"Native Pi Ollama request failed");
  assert.equal(toolEvents,0,"Model attempted to execute a tool");
  const witness=readPiWitness(result.output);
  const proposal=parseBeamProposal(witness.answer);
  report.modelWitness={piAgentEnded:true,assistantMessageObserved:true,
   agentEndEvents:witness.agentEndEvents,assistantMessages:witness.assistantMessages,
   answerSha256:hash(witness.answer),proposalDigest:hash(JSON.stringify(proposal)),toolEvents:0};
  const make=()=>{const value=fixture();fixtures.push(value.dir);return value;};
  // Simulated allow: production before/after writer snapshot guards real fixture bytes.
  {
   const f=make(),beforeOutside=hash(readFileSync(join(f.dir,"outside.txt")));
   const snap=captureWriterAuthorizationSnapshot(f.candidate,["README.md"]);
   assertWriterAuthorizationSnapshotCurrent(snap);
   assert.ok(mayApplyFixtureDecision({decision:"SIMULATED_ALLOW",revoked:false,scope:["README.md"],proposal}));
   writeFileSync(join(f.dir,proposal.path),"# Disposable EF-304 fixture\n"+proposal.marker+"\n");
   assert.deepEqual(assertWriterAuthorizationSnapshotOutcome(snap),["README.md"]);
   assert.equal(hash(readFileSync(join(f.dir,"outside.txt"))),beforeOutside);
   report.scenarios.push({id:"SIMULATED_ALLOW",passed:true,productionSnapshotBeforeAfter:true,
    modifiedOnly:"README.md",fixtureMarkerObserved:true,realHumanConsent:false});
  }
  // Denial: no grant is captured and no bytes change.
  {
   const f=make(),before=digestFiles(f.dir);
   assert.equal(mayApplyFixtureDecision({decision:"SIMULATED_DENY",revoked:false,scope:["README.md"],proposal}),false);
   assert.equal(digestFiles(f.dir),before);
   report.scenarios.push({id:"SIMULATED_DENY",passed:true,zeroWrites:true});
  }
  // Revocation before execution: even a prior in-memory test decision is unusable.
  {
   const f=make(),before=digestFiles(f.dir);
   assert.equal(mayApplyFixtureDecision({decision:"SIMULATED_ALLOW",revoked:true,scope:["README.md"],proposal}),false);
   assert.equal(digestFiles(f.dir),before);
   report.scenarios.push({id:"SIMULATED_REVOKE",passed:true,zeroWrites:true});
  }
  // Out of scope: preflight denial and production postflight tampering rejection.
  {
   const f=make(),before=digestFiles(f.dir),bad={...proposal,path:"outside.txt"};
   assert.equal(mayApplyFixtureDecision({decision:"SIMULATED_ALLOW",revoked:false,scope:["README.md"],proposal:bad}),false);
   assert.equal(digestFiles(f.dir),before);
   const snap=captureWriterAuthorizationSnapshot(f.candidate,["README.md"]);
   writeFileSync(join(f.dir,"outside.txt"),"UNAUTHORIZED_TEST_TAMPER\n");
   assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snap),/outside its exact scope/u);
   report.scenarios.push({id:"OUT_OF_SCOPE",passed:true,preflightDenied:true,productionPostflightRejected:true});
  }
  // A candidate changed after a supposed approval must not start Writer.
  {
   const f=make(),snap=captureWriterAuthorizationSnapshot(f.candidate,["README.md"]);
   writeFileSync(join(f.dir,"README.md"),"RACE_BEFORE_DISPATCH\n");
   assert.throws(()=>assertWriterAuthorizationSnapshotCurrent(snap),/unchanged workspace snapshot/u);
   report.scenarios.push({id:"STALE_SNAPSHOT",passed:true,productionPreflightRejected:true});
  }
  assert.equal(report.scenarios.length,5);
  report.status="PASS_AUTOMATED_OLLAMA_GUARDS_HUMAN_PENDING";
  writeFileSync(destination,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:report.status,scenarioCount:5,model,piAgentEnded:true,
   humanConsentObserved:false,realWriterAuthorized:false,globalFull:false}));
  return report;
 }catch(error){
  report.status="FAIL_OR_INCOMPLETE";
  report.failureStage=report.modelWitness?"FIXTURE_GUARDS":"PI_PROVIDER_OR_PROPOSAL";
  writeFileSync(destination,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.error("EF304_AUTO_OLLAMA_REJECTED: "+report.failureStage);
  throw error;
 }finally{
  for(const dir of fixtures)rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await automaticProof();}catch{process.exitCode=1;}
}
