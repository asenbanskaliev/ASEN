import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHmac,randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {SkillLifecycle,authorizePiWriteGrant,lifecyclePhases,saveLifecycle,loadLifecycle,type LifecyclePhase,type LifecycleRole} from "../src/lifecycle/skill-lifecycle.js";
import {createTestSkillLifecycle} from "./helpers/lifecycle-applicability.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher,type AgentRequest,type AgentRunner} from "../src/agents/dispatcher.js";
import {fixtureArtifactRunner} from "./lifecycle-pi-fixture.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {loadEvidence,saveEvidence} from "../src/evidence/persistence.js";
import {passingEvidence,passingReview,gitCandidate} from "./execution-evidence-helper.js";
import {admitRouteEvidence} from "./helpers/route-evidence.js";
const candidate=gitCandidate("candidate");
const recoveryKey=randomBytes(32);
const artifacts:Record<LifecyclePhase,string>={"context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report"};
const roles:Record<LifecyclePhase,LifecycleRole>={"context-init":"worker",explore:"explorer",proposal:"worker",specification:"worker",design:"worker",tasks:"worker",apply:"worker",verify:"verifier",archive:"worker"};
function completion(phase:LifecyclePhase,options:{task?:string;candidate?:typeof candidate;role?:LifecycleRole;paths?:string[];artifact?:Partial<{kind:string;content:string;repository:string;candidateId:string;revision:string}>}={}){
 const c=options.candidate??candidate,role=options.role??roles[phase],task=options.task??"task";
 const context=issueSkillContext(`${task}:${role}`,c.repository,c,{phase});
 return {phase,role,context,skillPaths:options.paths??selectSkills(context).map(s=>s.path),artifact:{kind:artifacts[phase],content:`${phase} result`,repository:c.repository,candidateId:c.id,revision:c.revision,...options.artifact}};
}
async function advance(flow:SkillLifecycle,phase:LifecyclePhase,options:Parameters<typeof completion>[1]={}){
 const selected=completion(phase,options),evidence=new EvidenceStore();
 admitRouteEvidence(evidence,candidate);
 for(const [id,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id,kind,status:"pass",summary:id,createdAt:"now"});
 await passingReview(evidence,candidate,"review");
 await passingEvidence(evidence,candidate,"test");
 const runner=fixtureArtifactRunner(()=>selected.artifact);
 return flow.runPhase(new Dispatcher(runner,evidence),{phase,context:selected.context,skillPaths:selected.skillPaths,prompt:phase,evidence,risk:"high",...(phase==="apply"?{writeSurfaces:["src/"]}:{})});
}
test("lifecycle enforces nine ordered phases and mandatory artifacts",async()=>{
 const flow=createTestSkillLifecycle("task",candidate);
 await assert.rejects(()=>advance(flow,"apply"),/out of order/);
 for(const phase of lifecyclePhases){assert.equal(flow.state.nextPhase,phase);await advance(flow,phase);}
 assert.equal(flow.state.nextPhase,null);
 assert.equal(flow.state.records.length,9);
 await assert.rejects(()=>advance(flow,"archive"),/out of order/);
});
test("plain JSON from an arbitrary runner cannot advance lifecycle",async()=>{
 const flow=createTestSkillLifecycle("task",candidate),selection=completion("context-init"),evidence=new EvidenceStore();
 const fabricated:AgentRunner={run:async request=>({id:request.id,ok:true,output:JSON.stringify(selection.artifact)})};
 await assert.rejects(()=>flow.runPhase(new Dispatcher(fabricated,evidence),{phase:"context-init",context:selection.context,skillPaths:selection.skillPaths,prompt:"context",evidence,risk:"low"}),/Pi provenance/);
 assert.equal(flow.state.records.length,0);
});
test("worker lifecycle grant is one-use and bound to task, phase and candidate",async()=>{
 const flow=createTestSkillLifecycle("task",candidate),selected=completion("context-init"),evidence=new EvidenceStore();
 const fixture=fixtureArtifactRunner(()=>selected.artifact);let captured:AgentRequest|undefined;
 const runner:AgentRunner={run:async request=>{captured=request;return fixture.run(request);}};
 const dispatcher=new Dispatcher(runner,evidence);
 await flow.runPhase(dispatcher,{phase:"context-init",context:selected.context,skillPaths:selected.skillPaths,prompt:"context",evidence,risk:"low"});
 if(!captured?.phaseGrant)throw new Error("Lifecycle did not issue a worker phase grant");
 const request:AgentRequest=captured;
 await assert.rejects(()=>dispatcher.dispatch(request),/unused ASEN lifecycle grant/);
 const other=issueSkillContext("other:worker",candidate.repository,candidate,{phase:"context-init"});
 await assert.rejects(()=>dispatcher.dispatch({...request,id:"other:worker",skillContext:other}),/unused ASEN lifecycle grant/);
 await assert.rejects(()=>dispatcher.dispatch({...request,phaseGrant:Object.freeze({})}),/unused ASEN lifecycle grant/);
});
test("lifecycle refuses wrong role, task, revision, routes and artifact",async()=>{
 const flow=createTestSkillLifecycle("task",candidate);
 await assert.rejects(()=>advance(flow,"context-init",{role:"explorer"}),/context lacks/);
 await assert.rejects(()=>advance(flow,"context-init",{task:"other"}),/context lacks/);
 await assert.rejects(()=>advance(flow,"context-init",{candidate:{...candidate,revision:"old"}}),/context lacks/);
 await assert.rejects(()=>advance(flow,"context-init",{paths:[]}),/skill routes mismatch/);
 const valid=completion("context-init");
 await assert.rejects(()=>advance(flow,"context-init",{paths:[...valid.skillPaths,valid.skillPaths[0]!]}),/skill routes mismatch/);
 await assert.rejects(()=>advance(flow,"context-init",{artifact:{content:" "}}),/failed or belongs to another task|artifact missing/);
 await assert.rejects(()=>advance(flow,"context-init",{artifact:{repository:"other"}}),/failed or belongs to another task|mismatched repository/);
 assert.equal(flow.state.records.length,0);
});
test("interruption resumes exact phase, artifacts and candidate; changed identity fails",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"state.json"),flow=createTestSkillLifecycle("task",candidate);
 for(const phase of lifecyclePhases.slice(0,4))await advance(flow,phase);
 await saveLifecycle(path,flow.state,recoveryKey);
 const resumed=await loadLifecycle(path,"task",candidate,recoveryKey);
 assert.equal(resumed.state.nextPhase,"design");assert.deepEqual(resumed.state.records,flow.state.records);
 assert.equal(resumed.state.candidate.revision,candidate.revision);
 await assert.rejects(()=>loadLifecycle(path,"other",candidate,recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",{...candidate,revision:"new"},recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",{...candidate,repository:"other"},recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",candidate,randomBytes(32)),/integrity mismatch/);
 for(const phase of lifecyclePhases.slice(4))await advance(resumed,phase);
 assert.equal(resumed.state.nextPhase,null);
 const raw=JSON.parse(await readFile(path,"utf8"));raw.snapshot.records[1].phase="archive";await writeFile(path,JSON.stringify(raw));
 await assert.rejects(()=>loadLifecycle(path,"task",candidate,recoveryKey),/integrity mismatch/);
});
test("task executes through dispatcher, resumes, verifies and archives",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-e2e-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"flow.json"),evidencePath=join(dir,"evidence.json");let evidence=new EvidenceStore();const rolesSeen:string[]=[];
 const runner=fixtureArtifactRunner(request=>{
  rolesSeen.push(`${request.skillContext?.phase}:${request.role}`);
  const phase=request.skillContext?.phase as LifecyclePhase;
  if(phase==="apply"){
   assert.equal(authorizePiWriteGrant(request),true,"apply must have a live one-use writer grant");
   assert.equal(authorizePiWriteGrant(request),false,"Pi writer grant must not be reused");
  }
  return {kind:artifacts[phase],content:`completed ${phase}`,repository:candidate.repository,candidateId:candidate.id,revision:candidate.revision};
 });
 let dispatcher=new Dispatcher(runner,evidence);const flow=createTestSkillLifecycle("task",candidate);
 const execute=async(target:SkillLifecycle,phase:LifecyclePhase)=>{
  const issued=completion(phase);
  await target.runPhase(dispatcher,{phase,context:issued.context,skillPaths:issued.skillPaths,prompt:`perform ${phase}`,evidence,risk:"high",...(phase==="apply"?{writeSurfaces:["src/"]}:{})});
 };
 for(const phase of lifecyclePhases.slice(0,6))await execute(flow,phase);
 await saveLifecycle(path,flow.state,recoveryKey);
 const resumed=await loadLifecycle(path,"task",candidate,recoveryKey);
 assert.equal(resumed.state.nextPhase,"apply");
 await assert.rejects(()=>execute(resumed,"verify"),/out of order/);
 await assert.rejects(()=>resumed.runPhase(dispatcher,{phase:"apply",context:completion("apply").context,skillPaths:completion("apply").skillPaths,prompt:"apply",evidence,risk:"high"}),/bounded write surfaces/);
 admitRouteEvidence(evidence,candidate);
 for(const [id,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id,kind,status:"pass",summary:id,createdAt:"now"});
 await execute(resumed,"apply");
 await assert.rejects(()=>execute(resumed,"verify"),/Passing test evidence is required/);
 await passingEvidence(evidence,candidate,"test");
 await assert.rejects(()=>execute(resumed,"verify"),/Independent review evidence is required/);
 await passingReview(evidence,candidate,"review");
 await saveEvidence(evidencePath,candidate,evidence,recoveryKey);
 evidence=await loadEvidence(evidencePath,candidate,recoveryKey);
 dispatcher=new Dispatcher(runner,evidence);
 await execute(resumed,"verify");await execute(resumed,"archive");
 assert.equal(resumed.state.nextPhase,null);
 assert.deepEqual(rolesSeen,["context-init:worker","explore:explorer","proposal:worker","specification:worker","design:worker","tasks:worker","apply:worker","verify:verifier","archive:worker"]);
});
test("signed pending phase reissues fresh authority after recovery",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-reissue-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"flow.json"),flow=createTestSkillLifecycle("task",candidate);
 for(const phase of lifecyclePhases.slice(0,4))await advance(flow,phase);
 const selected=completion("design");
 flow.preparePhase(selected.context,selected.skillPaths);
 await saveLifecycle(path,flow.state,recoveryKey);
 const restored=await loadLifecycle(path,"task",candidate,recoveryKey);
 const issued=restored.reissuePendingAuthority();
 assert.deepEqual(issued.skillPaths,selected.skillPaths);
 assert.notEqual(issued.context,selected.context);
 const runner=fixtureArtifactRunner(()=>selected.artifact);
 await restored.runPhase(new Dispatcher(runner,new EvidenceStore()),{phase:"design",context:issued.context,skillPaths:issued.skillPaths,prompt:"design",evidence:new EvidenceStore(),risk:"low"});
 assert.equal(restored.state.nextPhase,"tasks");
 assert.throws(()=>flow.reissuePendingAuthority(),/cryptographically verified recovery/);
 const script=resolve("tests/fixtures/resume-authority.ts"),run=(key:Buffer)=>spawnSync(process.execPath,["--import","tsx",script,path,candidate.repository,candidate.revision],{cwd:resolve("."),encoding:"utf8",env:{...process.env,ASEN_RECOVERY_KEY:key.toString("base64url")},timeout:20000});
 const continued=run(recoveryKey);
 assert.equal(continued.status,0,continued.stderr);
 assert.deepEqual(JSON.parse(continued.stdout),{phase:"tasks",records:5,skills:selected.skillPaths,issued:true});
 assert.match(run(randomBytes(32)).stderr,/integrity mismatch/);
});

test("apply can advance to a direct Git child while signed recovery retains prior artifacts",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-revisions-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 spawnSync("git",["init","-q",dir],{encoding:"utf8"});
 const commit=(message:string)=>{
  const result=spawnSync("git",["-C",dir,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m",message],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  return spawnSync("git",["-C",dir,"rev-parse","HEAD"],{encoding:"utf8"}).stdout.trim();
 };
 const red=commit("pre-apply"),initial={...candidate,id:"git-lifecycle",repository:dir,revision:red};
 const flow=createTestSkillLifecycle("git-task",initial,undefined,"not-applicable"),evidence=new EvidenceStore();
 for(const [id,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)evidence.add(initial,{id,kind,status:"pass",summary:id,createdAt:"now"});
 for(const phase of lifecyclePhases.slice(0,7)){
  const role=roles[phase],context=issueSkillContext(`git-task:${role}`,dir,initial,{phase,risk:"low"}),skillPaths=selectSkills(context).map(s=>s.path);
  const runner=fixtureArtifactRunner(()=>({kind:artifacts[phase],content:phase,repository:dir,candidateId:initial.id,revision:red}));
  await flow.runPhase(new Dispatcher(runner,evidence),{phase,context,skillPaths,prompt:phase,evidence,risk:"low",...(phase==="apply"?{writeSurfaces:["src/"]}:{})});
 }
 const green=commit("applied change");
 const refactor=commit("refactored change");
 assert.throws(()=>flow.promoteCandidateRevision(refactor),/direct Git parent/);
 flow.promoteCandidateRevision(green);
 assert.equal(flow.state.nextPhase,"verify");
 assert.equal(flow.state.candidate.revision,green);
 assert.equal(flow.state.records[6]?.artifact.revision,red);
 const stateDir=await mkdtemp(join(tmpdir(),"asen-lifecycle-state-"));t.after(()=>rm(stateDir,{recursive:true,force:true}));
 const path=join(stateDir,"lifecycle.json");await saveLifecycle(path,flow.state,recoveryKey);
 const restored=await loadLifecycle(path,"git-task",{...initial,revision:green},recoveryKey);
 assert.deepEqual(restored.state,flow.state);
 assert.throws(()=>restored.promoteCandidateRevision(refactor),/recovery-unknown/);
 const current={...initial,revision:green};
 assert.equal(restored.state.nextPhase,"verify");
 assert.equal(restored.state.records[6]?.artifact.revision,red);
 await saveLifecycle(path,restored.state,recoveryKey);
 assert.deepEqual((await loadLifecycle(path,"git-task",current,recoveryKey)).state,restored.state);
 const forged=JSON.parse(await readFile(path,"utf8"));
 forged.snapshot.candidate.revision=refactor;
 forged.snapshot.revisions=[red,refactor];
 forged.mac=createHmac("sha256",recoveryKey).update(JSON.stringify(forged.snapshot)).digest("hex");
 await writeFile(path,JSON.stringify(forged));
 await assert.rejects(()=>loadLifecycle(path,"git-task",{...initial,revision:refactor},recoveryKey),/direct Git parent/);
});
