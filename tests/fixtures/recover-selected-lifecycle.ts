import {readFile} from "node:fs/promises";
import {loadLifecycle,saveLifecycle,type LifecyclePhase,workflowSelectionDescriptionForSnapshot} from "../../src/lifecycle/skill-lifecycle.js";
import {recoveryKeyFromEnvironment} from "../../src/session/recovery-key.js";
import {issueSkillContext} from "../../src/skills/context.js";
import {selectSkills} from "../../src/skills/registry.js";
import {Dispatcher} from "../../src/agents/dispatcher.js";
import {EvidenceStore} from "../../src/evidence/store.js";
import {fixtureArtifactRunner} from "../lifecycle-pi-fixture.js";
import {passingEvidence,passingReview} from "../execution-evidence-helper.js";
import {admitRouteEvidence} from "../helpers/route-evidence.js";

const [file,task,id,repository,revision,mode]=process.argv.slice(2);
if(!file||!task||!id||!repository||!revision||!mode)throw new Error("Recovery fixture arguments missing");

const candidate={id,repository,revision,createdAt:"now"};
const key=recoveryKeyFromEnvironment();
const flow=await loadLifecycle(file,task,candidate,key);
const roles:Record<LifecyclePhase,"explorer"|"worker"|"verifier">={
 "context-init":"worker",explore:"explorer",proposal:"worker",specification:"worker",design:"worker",tasks:"worker",apply:"worker",verify:"verifier",archive:"worker",
};
const kinds:Record<LifecyclePhase,string>={
 "context-init":"project-context",explore:"exploration",proposal:"proposal",specification:"specification",design:"design",tasks:"task-plan",apply:"apply-result",verify:"verification-report",archive:"archive-report",
};
const evidence=new EvidenceStore();
if(["advance","required-before","required-after","complete"].includes(mode)){
 admitRouteEvidence(evidence,candidate);
 for(const [evidenceId,kind] of [["unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)
  evidence.add(candidate,{id:evidenceId,kind,status:"pass",summary:evidenceId,createdAt:"now"});
 await passingEvidence(evidence,candidate,"generic-test");
 await passingReview(evidence,candidate,"generic-review");
}
const run=async(phase:LifecyclePhase)=>{
 const role=roles[phase];
 const context=issueSkillContext(`${task}:${role}`,repository,candidate,{phase});
 const skillPaths=selectSkills(context).map(skill=>skill.path);
 const runner=fixtureArtifactRunner(()=>({kind:kinds[phase],content:phase,repository,candidateId:id,revision}));
 await flow.runPhase(new Dispatcher(runner,evidence),{
  phase,context,skillPaths,prompt:phase,evidence,risk:"low",...(phase==="apply"?{writeSurfaces:["src/"]}:{}),
 });
};
const probes:Record<string,string>={};
const probe=async(name:string,action:()=>unknown|Promise<unknown>)=>{
 try{await action();probes[name]="passed";}
 catch(error){probes[name]=error instanceof Error?error.message:String(error);}
};

if(mode==="advance")await run(flow.state.nextPhase as LifecyclePhase);
if(mode==="required-before"){
 for(const phase of ["context-init","explore","proposal","specification","design","tasks","apply"] as const)await run(phase);
 await probe("genericVerify",()=>run("verify"));
}
if(mode==="required-after")await probe("genericVerify",()=>run("verify"));
if(mode==="complete"){
 await probe("prepareApply",()=>run("apply"));
 await run("verify");
 await run("archive");
}
if(mode==="legacy-complete"){
 const context=issueSkillContext(`${task}:worker`,repository,candidate,{phase:"archive"});
 const skillPaths=selectSkills(context).map(skill=>skill.path);
 await probe("preparePhase",()=>flow.preparePhase(context,skillPaths));
 await probe("runPhase",()=>run("archive"));
}
await probe("reissuePendingAuthority",()=>flow.reissuePendingAuthority());
if(["inspect-resave","complete","legacy-complete"].includes(mode))await saveLifecycle(file,flow.state,key);
const raw=JSON.parse(await readFile(file,"utf8"));
process.stdout.write(JSON.stringify({
 phase:flow.state.nextPhase,
 records:flow.state.records.length,
 descriptionPresence:workflowSelectionDescriptionForSnapshot(flow.state)!==undefined,
 probeResults:probes,
 envelopeVersion:raw.version??1,
}));
