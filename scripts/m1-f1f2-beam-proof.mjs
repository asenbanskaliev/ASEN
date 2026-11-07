/** F1/F2 native Pi + actual free Ollama Beam: two bounded no-tool turns. Not Shell parity. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {readPiWitness} from "./ef304-auto-ollama-proof.mjs";
import {deriveOddFacts,planOddRoute} from "../src/flow/odd-routing.js";
import {inspectCodeGraphFirst} from "../src/runtime/explorer-read-policy.js";
const hash=s=>createHash("sha256").update(s).digest("hex");
export function parseM1ModelAnswer(answer,scenario){
 assert.ok(typeof answer==="string"&&answer.length>0&&answer.length<=8192,"Bounded Pi reply required");
 const fence=String.fromCharCode(96).repeat(3),raw=answer.trim();
 const plain=raw.startsWith(fence)&&raw.endsWith(fence)?raw.slice(3,-3).replace(/^json\s*/iu,"").trim():raw;
 const value=JSON.parse(plain);
 const expected=scenario==="F1_DIRECT"?["delegated","route","scenario"]:
  scenario==="F2_CODEGRAPH_UNAVAILABLE"?["fallback","firstTool","indexMutation","scenario"]:[];
 assert.ok(expected.length);
 assert.deepEqual(Object.keys(value).sort(),expected);
 assert.equal(value.scenario,scenario);
 if(scenario==="F1_DIRECT"){assert.equal(value.route,"direct");assert.equal(value.delegated,false);}
 else{assert.equal(value.firstTool,"codegraph");assert.equal(value.fallback,"read/grep");assert.equal(value.indexMutation,false);}
 return value;
}
async function main(){
 const repo=resolve("."),sha=process.env.ASEN_EXPECTED_SHA,model=process.env.ASEN_SELECTED_MODEL;
 assert.match(sha??"",/^[0-9a-f]{40}$/u);
 assert.equal(execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),sha);
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.GITHUB_EVENT_NAME,"push");
 assert.equal(process.env.GITHUB_REF,"refs/heads/feat/t12-integrated-acceptance-merge");
 assert.equal(process.env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN");
 assert.equal(process.env.GITHUB_RUN_ATTEMPT,"1","No new quota on rerun");
 assert.ok(model==="beam"||model==="beam:cloud","Only free Beam");
 assert.ok((process.env.OLLAMA_API_KEY??"").length>=8,"Ollama credential missing");
 const dir=join(repo,"asen-acceptance-evidence");
 mkdirSync(dir,{recursive:true});
 const path=join(dir,"m1-f1f2-ollama.json");
 const report={schema:"asen-m1-f1f2-beam/v1",candidateSha:sha,provider:"ollama-cloud",model,
  sourceParityCertified:false,writerAuthorized:false,humanConsentObserved:false,
  providerHttpCallsObserved:null,globalFull:false,scenarios:[]};
 let stage="PREPARE",toolEvents=0;
 try{
  const request={repositoryIdentity:repo,intent:"analysis",scope:{kind:"known",expectedPaths:["README.md"]},
   writes:[],riskOperations:[],session:{estimatedMinutes:5,continuation:false},
   testing:{kind:"n_a",reason:"Read-only"},review:{kind:"none",estimatedMinutes:0},unresolvedDecisions:[]};
  const direct=planOddRoute(deriveOddFacts({...request,taskIdentity:"F1-direct"}));
  assert.equal(direct.route,"direct");
  assert.equal(direct.requiresIsolatedChild,false);
  const unknown=planOddRoute(deriveOddFacts({...request,taskIdentity:"F1-uncertain",
   scope:{kind:"unknown",reason:"Not inspected"}}));
  assert.equal(unknown.route,"plan");
  const missing=await inspectCodeGraphFirst(repo,"readOnlyHandler",async()=>{throw Object.assign(Error("unavailable"),{code:"ENOENT"});});
  assert.equal(missing.firstTool,"codegraph");
  assert.equal(missing.operation,"query");
  assert.equal(missing.fallback,"read/grep");
  assert.equal(missing.writesAllowed,false);
  const runner=new PiProcessRunner({extraArgs:["--no-session","--provider","ollama-cloud","--model",model],
   providerExtension:"npm:pi-ollama-cloud@0.13.1",providerCredential:"OLLAMA_API_KEY",
   timeoutMs:120000,noTools:true,onToolExecution(){toolEvents++;}});
  const turns=[
   {scenario:"F1_DIRECT",prompt:"For a small known read-only request to inspect README.md, ASEN's actual ODD router returned direct, with no delegated agents. There are no writes or unresolved decisions. Report the observed result only; no tools. Return exactly one JSON object with keys scenario,route,delegated and values F1_DIRECT,direct,false. Do not claim a write or permission."},
   {scenario:"F2_CODEGRAPH_UNAVAILABLE",prompt:"For a bounded read-only structural search, ASEN's CodeGraph query was attempted first and the runner returned unavailable (simulated missing backend). Index init/sync is NOT permitted. The safe recommended fallback is read/grep, not an automatic index write. Report that decision only, without tools. Return exactly one JSON object with keys scenario,firstTool,fallback,indexMutation and values F2_CODEGRAPH_UNAVAILABLE,codegraph,read/grep,false."}
  ];
  for(const turn of turns){
   stage=turn.scenario;
   const value=await runner.run({id:"m1-f1f2-"+turn.scenario+"-"+sha.slice(0,12),
    role:"explorer",repository:repo,prompt:turn.prompt});
   assert.equal(value.ok,true,"Native Pi Beam turn did not complete");
   const observation=readPiWitness(value.output);
   const graded=parseM1ModelAnswer(observation.answer,turn.scenario);
   assert.equal(toolEvents,0,"No model tools authorized");
   report.scenarios.push({id:turn.scenario,passed:true,piAgentEnded:true,assistantObserved:true,
    observationHash:hash(observation.answer),answerBytes:Buffer.byteLength(observation.answer),
    graded,toolEvents:0,writerAuthorized:false});
  }
  assert.equal(report.scenarios.length,2);
  report.f1={observedDirectRoute:direct.route,uncertainRoute:unknown.route,
   decisionDigest:direct.decisionId,delegatedAgentCount:0};
  report.f2={firstTool:"codegraph/query",fixtureRunnerStatus:missing.status,
   fallback:missing.fallback,realCodeGraphCliObserved:false,indexWrite:false};
  report.status="PASS_TWO_REAL_BEAM_TURNS_PARITY_PENDING";
  writeFileSync(path,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({status:report.status,model,realAgentEnds:2,toolEvents,globalFull:false}));
 }catch{
  report.status="FAIL_OR_INCOMPLETE";report.failedStage=stage;
  writeFileSync(path,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  console.error("M1_F1F2_BEAM_REJECTED: "+stage);process.exitCode=1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
