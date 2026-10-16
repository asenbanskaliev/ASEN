import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {executeEvidenceCommand,addExecutedEvidence} from "../src/evidence/execution.js";
import {SkillLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";

const repository=resolve(".");
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8"}).trim();
assert.equal(revision,process.env.ASEN_EXPECTED_SHA,"Lifecycle candidate must be exact PR HEAD");
const provider=process.env.ASEN_PI_PROVIDER??"openrouter";
const model=process.env.ASEN_PI_MODEL??"nvidia/nemotron-3.5-lightning:free";
const providerExtension=process.env.ASEN_PI_PROVIDER_EXTENSION;

const candidate={id:"pr30-real-pi-lifecycle",repository,revision,createdAt:new Date().toISOString()};
const taskId="pr30-real-pi-lifecycle";
const evidence=new EvidenceStore();
const runner=new PiArtifactRunner(new PiProcessRunner({extraArgs:["--no-session","--provider",provider,"--model",model],providerExtension,timeoutMs:180000,noTools:true}));
const dispatcher=new Dispatcher(runner,evidence,1);
const flow=new SkillLifecycle(taskId,candidate);
const phases=[
 ["context-init","worker","project-context"],
 ["explore","explorer","exploration"],
 ["proposal","worker","proposal"],
 ["specification","worker","specification"],
 ["design","worker","design"],
 ["tasks","worker","task-plan"],
 ["apply","worker","apply-result"],
 ["verify","verifier","verification-report"],
 ["archive","worker","archive-report"]
];

for(const [phase,role,kind] of phases){
 if(phase==="apply"){
  for(const [id,evidenceKind] of [["real-pi-work-unit","work-unit"],["real-pi-scope","scope"],["real-pi-rollback","rollback"]])evidence.add(candidate,{id,kind:evidenceKind,status:"pass",summary:`Authenticated lifecycle ${evidenceKind}`,createdAt:new Date().toISOString()});
 }
 if(phase==="verify"){
  const probe='const {execFileSync}=require("node:child_process");const {readdirSync}=require("node:fs");const {join}=require("node:path");const npm=process.platform==="win32"?"npm.cmd":"npm";execFileSync(npm,["ci","--ignore-scripts"],{stdio:"ignore"});execFileSync(npm,["run","typecheck"],{stdio:"ignore"});const tests=readdirSync("tests",{recursive:true}).filter(path=>path.endsWith(".test.ts")).map(path=>join("tests",path));if(!tests.length)process.exit(1);execFileSync(process.execPath,["--import","tsx","--test",...tests],{stdio:"ignore"});';
  const proof=await executeEvidenceCommand(candidate,[process.execPath,"-e",probe],{cwd:repository,timeoutMs:300000});
  addExecutedEvidence(evidence,candidate,proof,{id:"real-pi-lifecycle-test",kind:"test",summary:"Installed exact-candidate lockfile dependencies and executed typecheck and behavioral tests in isolated worktree"});
 }
 const prompt=[
  "Return the functional result required by the loaded Skill.",
  "Plain text, Markdown, or JSON are acceptable unless the Skill itself requires a specific format.",
  "Follow the loaded Skill output contract.",
  "Do not provide repository, candidateId or revision; ASEN binds lifecycle identity.",
  "Keep the result concise and machine-readable."
 ].join("\n");
 let state;
 const maxAttempts=provider==="llm7"?3:1;
 let lastError;
 let successfulSkillPaths;
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const context=issueSkillContext(`${taskId}:${role}`,repository,candidate,{phase,risk:"low",...(phase==="apply"?{codeChange:true}:{} )});
  const skillPaths=selectSkills(context).map(skill=>skill.path);
  try{state=await flow.runPhase(dispatcher,{phase,context,skillPaths,prompt,evidence,risk:"low",...(phase==="apply"?{writeSurfaces:["docs/audit/"]}:{})});successfulSkillPaths=skillPaths;break;}
  catch(error){lastError=error;const transient=String(error).includes("Pi artifact requires a completed successful assistant message");if(!transient||attempt===maxAttempts)break;await new Promise(resolve=>setTimeout(resolve,attempt*2000));}
 }
 if(!state){
  const retryableStatus=String(lastError).match(/: Error: PI_ARTIFACT_RETRYABLE_STATUS=(429|502|503|504)$/)?.[1];
  if(retryableStatus)console.error(`ASEN_LIFECYCLE_RETRYABLE_STATUS=${retryableStatus}`);
  throw new Error(`Authenticated lifecycle phase ${phase} failed`);
 }
 assert.equal(state.records.at(-1)?.phase,phase);
 assert.equal(state.records.at(-1)?.artifact.kind,kind);
 console.log(JSON.stringify({phase,role,skills:successfulSkillPaths,result:"PASS"}));
}
assert.equal(flow.state.nextPhase,null);
assert.equal(flow.state.records.length,9);
console.log(JSON.stringify({candidate:revision,phases:9,nextPhase:flow.state.nextPhase,result:"PASS"}));
