import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHmac,randomBytes} from "node:crypto";
import {mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";
import {createSkillLifecycle,lifecyclePhases,saveLifecycle,type LifecyclePhase,type SkillLifecycle} from "../src/lifecycle/skill-lifecycle.js";
import {issueStructuredLifecycleApplicability} from "./helpers/lifecycle-applicability.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {fixtureArtifactRunner} from "./lifecycle-pi-fixture.js";
import {gitCandidate,passingEvidence,passingReview} from "./execution-evidence-helper.js";
import {admitRouteEvidence} from "./helpers/route-evidence.js";

const repository=await realpath(".");
const revision=spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout.trim();
const candidate={id:"gsp05i1-c3",repository,revision,createdAt:"now"};
const fixture=resolve("tests/fixtures/recover-selected-lifecycle.ts");
const roles:Record<LifecyclePhase,"explorer"|"worker"|"verifier">={
 "context-init":"worker",explore:"explorer",proposal:"worker",specification:"worker",design:"worker",tasks:"worker",apply:"worker",verify:"verifier",archive:"worker",
};
const kinds:Record<LifecyclePhase,string>={
 "context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report",
};

const child=(file:string,task:string,key:Buffer,mode="inspect-resave",overrides:Partial<typeof candidate>={})=>spawnSync(
 process.execPath,
 ["--import","tsx",fixture,file,task,overrides.id??candidate.id,overrides.repository??candidate.repository,overrides.revision??candidate.revision,mode],
 {cwd:resolve("."),encoding:"utf8",env:{...process.env,ASEN_RECOVERY_KEY:key.toString("base64url")},timeout:20000},
);
async function selected(task:string,bound=candidate){
 return createSkillLifecycle(await issueStructuredLifecycleApplicability(task,bound,["README.md"],"not-applicable","unspecified"));
}
async function advance(flow:SkillLifecycle,task:string,bound=candidate){
 const evidence=new EvidenceStore();
 admitRouteEvidence(evidence,bound);
 for(const [id,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(bound,{id,kind,status:"pass",summary:id,createdAt:"now"});
 await passingEvidence(evidence,bound,"test");
 await passingReview(evidence,bound,"review");
 for(const phase of lifecyclePhases){
  const role=roles[phase];
  const context=issueSkillContext(`${task}:${role}`,bound.repository,bound,{phase});
  const skillPaths=selectSkills(context).map(skill=>skill.path);
  const runner=fixtureArtifactRunner(()=>({kind:kinds[phase],content:phase,repository:bound.repository,candidateId:bound.id,revision:bound.revision}));
  await flow.runPhase(new Dispatcher(runner,evidence),{
   phase,context,skillPaths,prompt:phase,evidence,risk:"low",...(phase==="apply"?{writeSurfaces:["src/"]}:{}),
  });
 }
}
async function temp(t:test.TestContext,prefix:string){
 const dir=await mkdtemp(join(tmpdir(),prefix));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 return join(dir,"flow.json");
}

test("fresh genuine selected v3 checkpoint recovers and resaves exact bound description in a new process",async t=>{
 const task="GSP05I1-C3-v3",key=randomBytes(32),file=await temp(t,"asen-c3-v3-"),flow=await selected(task);
 await saveLifecycle(file,flow.state,key);
 const run=child(file,task,key);
 assert.equal(run.status,0,run.stderr);
 assert.deepEqual(JSON.parse(run.stdout),{
  phase:"context-init",records:0,descriptionPresence:true,
  probeResults:{reissuePendingAuthority:"Recovery has no signed pending phase authority"},envelopeVersion:3,
 });
 const raw=JSON.parse(await readFile(file,"utf8"));
 assert.equal(raw.taskIdentity,task);
 assert.equal(raw.repositoryIdentity,repository);
 assert.equal(raw.candidateId,candidate.id);
 assert.equal(raw.currentRevision,revision);
 assert.equal(raw.workflowSelection.taskIdentity,task);
 assert.equal(raw.testingBinding.mode,"not-applicable");
});

test("cross-process v3 recovery fails closed for each key and caller identity mismatch",async t=>{
 const task="GSP05I1-C3-bindings",key=randomBytes(32),file=await temp(t,"asen-c3-bindings-"),flow=await selected(task);
 await saveLifecycle(file,flow.state,key);
 const original=await readFile(file,"utf8"),wrongKey=randomBytes(32);
 const wrongKeyRun=child(file,task,wrongKey);
 assert.notEqual(wrongKeyRun.status,0);
 assert.match(wrongKeyRun.stderr,/integrity/i);
 assert.equal(wrongKeyRun.stdout,"");
 for(const secret of [key,wrongKey])for(const encoded of [secret.toString("base64url"),secret.toString("hex")]){
  assert.equal(wrongKeyRun.stdout.includes(encoded),false);
  assert.equal(wrongKeyRun.stderr.includes(encoded),false);
 }
 assert.equal(await readFile(file,"utf8"),original);
 const cases=[
  child(file,"wrong-task",key),
  child(file,task,key,"inspect-resave",{repository:"wrong-repository"}),
  child(file,task,key,"inspect-resave",{id:"wrong-candidate"}),
  child(file,task,key,"inspect-resave",{revision:"wrong-revision"}),
 ];
 for(const run of cases){
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/integrity|binding|identity/i);
  assert.equal(run.stdout,"");
  assert.equal(run.stderr.includes(key.toString("base64url")),false);
  assert.equal(await readFile(file,"utf8"),original);
 }
});

test("cross-process v3 rejects authenticated semantic tampering and invalid signatures",async t=>{
 const task="GSP05I1-C3-envelope",key=randomBytes(32),file=await temp(t,"asen-c3-envelope-"),flow=await selected(task);
 await saveLifecycle(file,flow.state,key);
 const original=JSON.parse(await readFile(file,"utf8"));
 const resign=(raw:any)=>{
  const {mac:_,...payload}=raw;
  raw.mac=createHmac("sha256",key).update("asen.lifecycle.explicit-selection.v3\0").update(JSON.stringify(payload)).digest("hex");
 };
 const cases=[
  {mutate:(raw:any)=>{raw.extra=true;resign(raw);},cause:/shape/i},
  {mutate:(raw:any)=>{raw.workflowSelection.taskIdentity="other";resign(raw);},cause:/binding|identity|mismatch/i},
  {mutate:(raw:any)=>{raw.testingBinding.mode="required";resign(raw);},cause:/binding|mismatch/i},
  {mutate:(raw:any)=>raw.mac="0".repeat(64),cause:/integrity/i},
  {mutate:(raw:any)=>{const {mac:_,...payload}=raw;raw.mac=createHmac("sha256",key).update(JSON.stringify(payload)).digest("hex");},cause:/integrity/i},
  {mutate:(raw:any)=>{const {mac:_,...payload}=raw;raw.mac=createHmac("sha256",key).update("asen.lifecycle.v2\0").update(JSON.stringify(payload)).digest("hex");},cause:/integrity/i},
  {mutate:(raw:any)=>raw.mac=raw.mac.toUpperCase(),cause:/integrity/i},
 ];
 for(const {mutate,cause} of cases){
  const raw=structuredClone(original);
  mutate(raw);
  const checkpoint=JSON.stringify(raw);
  await writeFile(file,checkpoint);
  const run=child(file,task,key,"inspect");
  assert.notEqual(run.status,0);
  assert.match(run.stderr,cause);
  assert.equal(run.stdout,"");
  assert.equal(await readFile(file,"utf8"),checkpoint);
 }
 await writeFile(file,JSON.stringify(original));
});

test("legacy v1 recovery is cross-process inspect-only only after genuine completion",async t=>{
 const key=randomBytes(32),continuingTask="GSP05I1-C3-v1-continuing",continuingFile=await temp(t,"asen-c3-v1-open-");
 const continuing=await selected(continuingTask),open=structuredClone(continuing.state);
 await writeFile(continuingFile,JSON.stringify({snapshot:open,mac:createHmac("sha256",key).update(JSON.stringify(open)).digest("hex")}));
 const rejected=child(continuingFile,continuingTask,key,"inspect");
 assert.notEqual(rejected.status,0);
 assert.match(rejected.stderr,/migration required/);

 const task="GSP05I1-C3-v1-complete",file=await temp(t,"asen-c3-v1-done-"),generated=gitCandidate("c3-v1");
 const bound={...generated,repository:await realpath(generated.repository)};
 t.after(()=>rm(bound.repository,{recursive:true,force:true}));
 const flow=await selected(task,bound);
 await advance(flow,task,bound);
 const completed=structuredClone(flow.state);
 assert.equal(completed.records.length,9);
 assert.equal(completed.nextPhase,null);
 await writeFile(file,JSON.stringify({snapshot:completed,mac:createHmac("sha256",key).update(JSON.stringify(completed)).digest("hex")}));
 const inspected=child(file,task,key,"legacy-complete",bound);
 assert.equal(inspected.status,0,inspected.stderr);
 const result=JSON.parse(inspected.stdout);
 assert.equal(result.phase,null);assert.equal(result.records,9);
 assert.equal(result.descriptionPresence,false);assert.equal(result.envelopeVersion,1);
 assert.match(result.probeResults.preparePhase,/completed lifecycle/i);
 assert.match(result.probeResults.runPhase,/out of order/i);
 assert.match(result.probeResults.reissuePendingAuthority,/no signed pending phase authority/i);
 assert.equal(JSON.parse(await readFile(file,"utf8")).version,undefined);
});
