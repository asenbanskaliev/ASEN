import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes} from "node:crypto";
import {SkillLifecycle,lifecyclePhases,saveLifecycle,loadLifecycle,type LifecyclePhase,type LifecycleRole} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";
import {Dispatcher,type AgentRunner} from "../src/agents/dispatcher.js";
import {EvidenceStore} from "../src/evidence/store.js";
const candidate={id:"candidate",repository:"repo",revision:"sha",createdAt:"now"};
const recoveryKey=randomBytes(32);
const artifacts:Record<LifecyclePhase,string>={"context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report"};
const roles:Record<LifecyclePhase,LifecycleRole>={"context-init":"worker",explore:"explorer",proposal:"worker",specification:"worker",design:"worker",tasks:"worker",apply:"worker",verify:"verifier",archive:"worker"};
function completion(phase:LifecyclePhase,options:{task?:string;candidate?:typeof candidate;role?:LifecycleRole;paths?:string[];artifact?:Partial<{kind:string;content:string;repository:string;candidateId:string;revision:string}>}={}){
 const c=options.candidate??candidate,role=options.role??roles[phase],task=options.task??"task";
 const context=issueSkillContext(`${task}:${role}`,c.repository,c,{phase});
 return {phase,role,context,skillPaths:options.paths??selectSkills(context).map(s=>s.path),artifact:{kind:artifacts[phase],content:`${phase} result`,repository:c.repository,candidateId:c.id,revision:c.revision,...options.artifact}};
}
test("lifecycle enforces nine ordered phases and mandatory artifacts",()=>{
 const flow=new SkillLifecycle("task",candidate);
 assert.throws(()=>flow.complete(completion("apply")),/out of order/);
 for(const phase of lifecyclePhases){assert.equal(flow.state.nextPhase,phase);flow.complete(completion(phase));}
 assert.equal(flow.state.nextPhase,null);
 assert.equal(flow.state.records.length,9);
 assert.throws(()=>flow.complete(completion("archive")),/out of order/);
});
test("lifecycle refuses wrong role, task, revision, routes and artifact",()=>{
 const flow=new SkillLifecycle("task",candidate);
 assert.throws(()=>flow.complete(completion("context-init",{role:"explorer"})),/role lacks authority/);
 assert.throws(()=>flow.complete(completion("context-init",{task:"other"})),/context lacks/);
 assert.throws(()=>flow.complete(completion("context-init",{candidate:{...candidate,revision:"old"}})),/context lacks/);
 assert.throws(()=>flow.complete(completion("context-init",{paths:[]})),/skill routes mismatch/);
 const valid=completion("context-init");
 assert.throws(()=>flow.complete({...valid,skillPaths:[...valid.skillPaths,valid.skillPaths[0]!]}),/skill routes mismatch/);
 assert.throws(()=>flow.complete(completion("context-init",{artifact:{content:" "}})),/artifact missing/);
 assert.throws(()=>flow.complete(completion("context-init",{artifact:{repository:"other"}})),/artifact missing/);
 assert.equal(flow.state.records.length,0);
});
test("interruption resumes exact phase, artifacts and candidate; changed identity fails",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"state.json"),flow=new SkillLifecycle("task",candidate);
 for(const phase of lifecyclePhases.slice(0,4))flow.complete(completion(phase));
 await saveLifecycle(path,flow.state,recoveryKey);
 const resumed=await loadLifecycle(path,"task",candidate,recoveryKey);
 assert.equal(resumed.state.nextPhase,"design");assert.deepEqual(resumed.state.records,flow.state.records);
 assert.equal(resumed.state.candidate.revision,"sha");
 await assert.rejects(()=>loadLifecycle(path,"other",candidate,recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",{...candidate,revision:"new"},recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",{...candidate,repository:"other"},recoveryKey),/identity mismatch/);
 await assert.rejects(()=>loadLifecycle(path,"task",candidate,randomBytes(32)),/integrity mismatch/);
 for(const phase of lifecyclePhases.slice(4))resumed.complete(completion(phase));
 assert.equal(resumed.state.nextPhase,null);
 const raw=JSON.parse(await readFile(path,"utf8"));raw.snapshot.records[1].phase="archive";await writeFile(path,JSON.stringify(raw));
 await assert.rejects(()=>loadLifecycle(path,"task",candidate,recoveryKey),/integrity mismatch/);
});
test("task executes through dispatcher, resumes, verifies and archives",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"asen-lifecycle-e2e-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,"flow.json"),evidence=new EvidenceStore(),rolesSeen:string[]=[];
 const runner:AgentRunner={run:async request=>{
  rolesSeen.push(`${request.skillContext?.phase}:${request.role}`);
  const phase=request.skillContext?.phase as LifecyclePhase;
  return{id:request.id,ok:true,output:JSON.stringify({kind:artifacts[phase],content:`completed ${phase}`,repository:candidate.repository,candidateId:candidate.id,revision:candidate.revision})};
 }};
 const dispatcher=new Dispatcher(runner,evidence),flow=new SkillLifecycle("task",candidate);
 const execute=async(target:SkillLifecycle,phase:LifecyclePhase)=>{
  const issued=completion(phase);
  await target.runPhase(dispatcher,{phase,context:issued.context,skillPaths:issued.skillPaths,prompt:`perform ${phase}`,...(phase==="apply"?{writeSurfaces:["src/"]}:{})});
 };
 for(const phase of lifecyclePhases.slice(0,6))await execute(flow,phase);
 await saveLifecycle(path,flow.state,recoveryKey);
 const resumed=await loadLifecycle(path,"task",candidate,recoveryKey);
 assert.equal(resumed.state.nextPhase,"apply");
 await assert.rejects(()=>execute(resumed,"verify"),/out of order/);
 await assert.rejects(()=>resumed.runPhase(dispatcher,{phase:"apply",context:completion("apply").context,skillPaths:completion("apply").skillPaths,prompt:"apply"}),/bounded write surfaces/);
 for(const [id,kind] of [["route","route-decision"],["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id,kind,status:"pass",summary:id,createdAt:"now"});
 for(const phase of lifecyclePhases.slice(6))await execute(resumed,phase);
 assert.equal(resumed.state.nextPhase,null);
 assert.deepEqual(rolesSeen,["context-init:worker","explore:explorer","proposal:worker","specification:worker","design:worker","tasks:worker","apply:worker","verify:verifier","archive:worker"]);
});
