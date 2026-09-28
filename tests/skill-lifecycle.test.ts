import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {SkillLifecycle,lifecyclePhases,saveLifecycle,loadLifecycle,type LifecyclePhase,type LifecycleRole} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher,type AgentRequest,type AgentRunner} from "../src/agents/dispatcher.js";
import {fixtureArtifactRunner} from "./lifecycle-pi-fixture.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {loadEvidence,saveEvidence} from "../src/evidence/persistence.js";
import {passingEvidence,passingReview,gitCandidate} from "./execution-evidence-helper.js";
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
 for(const [id,kind] of [["route","route-decision"],["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id,kind,status:"pass",summary:id,createdAt:"now"});
 await passingReview(evidence,candidate,"review");
 await passingEvidence(evidence,candidate,"test");
 const runner=fixtureArtifactRunner(()=>selected.artifact);
 return flow.runPhase(new Dispatcher(runner,evidence),{phase,context:selected.context,skillPaths:selected.skillPaths,prompt:phase,evidence,risk:"high",...(phase==="apply"?{writeSurfaces:["src/"]}:{})});
}
test("lifecycle enforces nine ordered phases and mandatory artifacts",async()=>{
 const flow=new SkillLifecycle("task",candidate);
 await assert.rejects(()=>advance(flow,"apply"),/out of order/);
 for(const phase of lifecyclePhases){assert.equal(flow.state.nextPhase,phase);await advance(flow,phase);}
 assert.equal(flow.state.nextPhase,null);
 assert.equal(flow.state.records.length,9);
 await assert.rejects(()=>advance(flow,"archive"),/out of order/);
});
test("plain JSON from an arbitrary runner cannot advance lifecycle",async()=>{
 const flow=new SkillLifecycle("task",candidate),selection=completion("context-init"),evidence=new EvidenceStore();
 const fabricated:AgentRunner={run:async request=>({id:request.id,ok:true,output:JSON.stringify(selection.artifact)})};
 await assert.rejects(()=>flow.runPhase(new Dispatcher(fabricated,evidence),{phase:"context-init",context:selection.context,skillPaths:selection.skillPaths,prompt:"context",evidence,risk:"low"}),/Pi provenance/);
 assert.equal(flow.state.records.length,0);
});
test("worker lifecycle grant is one-use and bound to task, phase and candidate",async()=>{
 const flow=new SkillLifecycle("task",candidate),selected=completion("context-init"),evidence=new EvidenceStore();
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
 const flow=new SkillLifecycle("task",candidate);
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
 const path=join(dir,"state.json"),flow=new SkillLifecycle("task",candidate);
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
  return {kind:artifacts[phase],content:`completed ${phase}`,repository:candidate.repository,candidateId:candidate.id,revision:candidate.revision};
 });
 let dispatcher=new Dispatcher(runner,evidence);const flow=new SkillLifecycle("task",candidate);
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
 for(const [id,kind] of [["route","route-decision"],["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
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
 const path=join(dir,"flow.json"),flow=new SkillLifecycle("task",candidate);
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
 const forged=new SkillLifecycle("task",candidate,flow.state);
 assert.throws(()=>forged.reissuePendingAuthority(),/cryptographically verified recovery/);
 const script=resolve("tests/fixtures/resume-authority.ts"),run=(key:Buffer)=>spawnSync(process.execPath,["--import","tsx",script,path,candidate.repository,candidate.revision],{cwd:resolve("."),encoding:"utf8",env:{...process.env,ASEN_RECOVERY_KEY:key.toString("base64url")},timeout:20000});
 const continued=run(recoveryKey);
 assert.equal(continued.status,0,continued.stderr);
 assert.deepEqual(JSON.parse(continued.stdout),{phase:"tasks",records:5,skills:selected.skillPaths,issued:true});
 assert.match(run(randomBytes(32)).stderr,/integrity mismatch/);
});
