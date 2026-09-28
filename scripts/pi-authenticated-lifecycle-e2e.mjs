import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {PiArtifactRunner} from "../src/agents/pi-artifact-runner.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {SkillLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";

const repository=resolve(".");
const revision=execFileSync("git",["rev-parse","HEAD"],{cwd:repository,encoding:"utf8"}).trim();
assert.equal(revision,process.env.ASEN_EXPECTED_SHA,"Lifecycle candidate must be exact PR HEAD");
const provider=process.env.ASEN_PI_PROVIDER??"openrouter";
const model=process.env.ASEN_PI_MODEL??"qwen/qwen3.8-27b:free";
const providerExtension=process.env.ASEN_PI_PROVIDER_EXTENSION;

const candidate={id:"pr30-real-pi-lifecycle",repository,revision,createdAt:new Date().toISOString()};
const taskId="pr30-real-pi-lifecycle";
const evidence=new EvidenceStore();
const runner=new PiArtifactRunner(new PiProcessRunner({extraArgs:["--no-session","--provider",provider,"--model",model],providerExtension,timeoutMs:180000}));
const dispatcher=new Dispatcher(runner,evidence,1);
const flow=new SkillLifecycle(taskId,candidate);
const phases=[
 ["context-init","worker","project-context"],
 ["explore","explorer","exploration"],
 ["proposal","worker","proposal"],
 ["specification","worker","specification"],
 ["design","worker","design"],
 ["tasks","worker","task-plan"]
];

for(const [phase,role,kind] of phases){
 const context=issueSkillContext(`${taskId}:${role}`,repository,candidate,{phase,risk:"low"});
 const skillPaths=selectSkills(context).map(skill=>skill.path);
 const prompt=[
  "Return one machine-readable lifecycle artifact.",
  "Your entire final response must be exactly one JSON object with only kind and content.",
  "Do not use Markdown fences or commentary.",
  `Use exactly this kind: ${kind}`,
  "Set content to a short non-empty statement describing completion of this phase.",
  `Required JSON shape: {"kind":"${kind}","content":"..."}`
 ].join("\n");
 let state;
 try{state=await flow.runPhase(dispatcher,{phase,context,skillPaths,prompt,evidence,risk:"low"});}
 catch(error){throw new Error(`Authenticated lifecycle phase ${phase} failed: ${String(error)}`); }
 assert.equal(state.records.at(-1)?.phase,phase);
 assert.equal(state.records.at(-1)?.artifact.kind,kind);
 console.log(JSON.stringify({phase,role,skills:skillPaths,result:"PASS"}));
}
assert.equal(flow.state.nextPhase,"apply");
assert.equal(flow.state.records.length,6);
console.log(JSON.stringify({candidate:revision,phases:6,nextPhase:flow.state.nextPhase,result:"PASS"}));
