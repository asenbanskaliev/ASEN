import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Dispatcher} from "../src/agents/dispatcher.js";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {EvidenceStore} from "../src/evidence/store.js";
import {issueOddDecision} from "../tests/helpers/odd-routing.js";
import {buildOrchestrationPlan} from "../src/orchestration/orchestrator.js";
import {decideLifecycleApplicability} from "../src/lifecycle/applicability.js";
import {issueOrganicWriterAdmission} from "../src/lifecycle/skill-lifecycle.js";
import {issueSkillContext} from "../src/skills/context.js";
import {selectSkills} from "../src/skills/registry.js";

const sourceRoot=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
const expectedSha=process.env.ASEN_EXPECTED_SHA;
const evidenceDirectory=process.env.ASEN_T05_EVIDENCE_DIR;
if(!process.env.NVIDIA_API_KEY)throw new Error("NVIDIA_API_KEY missing; the live authorized-write scenario is BLOCKED");
if(!expectedSha||!/^[0-9a-f]{40}$/u.test(expectedSha)||!evidenceDirectory)throw new Error("Exact candidate SHA and evidence directory are required");
const git=(cwd:string,...args:string[])=>execFileSync("git",["-C",cwd,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
assert.equal(git(sourceRoot,"rev-parse","HEAD"),expectedSha,"provider task must use the exact CI candidate");
const taskRoot=mkdtempSync(join(tmpdir(),"asen-t05-nvidia-task-"));
const taskId=`t05-live-${randomUUID()}`,target="docs/t05-live-execution.txt";
const content=`T05 NVIDIA live write\nCandidate: ${expectedSha}\nPurpose: demonstrate one authorized Pi workspace edit\n`;
let piProcessId:number|undefined,startedAt=new Date().toISOString();
const finishAt=()=>new Date().toISOString();
try{
 execFileSync("git",["-C",sourceRoot,"worktree","add","--detach",taskRoot,expectedSha],{stdio:"ignore"});
 const root=realpathSync(taskRoot),baseSha=git(root,"rev-parse","HEAD");
 assert.equal(baseSha,expectedSha);assert.equal(git(root,"status","--porcelain=v1","--untracked-files=all"),"");
 const candidate={id:taskId,repository:root,revision:baseSha,createdAt:new Date().toISOString()};
 const decision=issueOddDecision({taskId,repository:root,paths:[target],writes:[{path:target,changeKind:"behavior"}]});
 buildOrchestrationPlan({taskId,repository:root,prompt:"Add the one declared live provider evidence file",candidate},decision);
 const applicability=decideLifecycleApplicability(decision,{taskIdentity:taskId,repositoryIdentity:root,candidate:{id:candidate.id,repository:root,revision:baseSha},explicitMode:"organic",affectedSubsystems:["runtime"],expectedPaths:[target],requiredArtifacts:[]});
 const writerAdmission=issueOrganicWriterAdmission(applicability,[target]);
 const skillContext=issueSkillContext(`${taskId}:worker`,root,candidate,{phase:"apply",codeChange:true,risk:"low"});
 const skillPaths=selectSkills(skillContext).map(skill=>skill.path);
 const evidence=new EvidenceStore();
 for(const [id,kind] of [["work-unit","work-unit"],["scope","scope"],["rollback","rollback"]] as const)evidence.add(candidate,{id:`${taskId}:${id}`,kind,status:"pass",summary:`Exact ${target} write admitted for isolated live-provider fixture`,createdAt:new Date().toISOString()});
 const runner=new PiProcessRunner({command:process.env.PI_EXECUTABLE??"pi",policyRoot:sourceRoot,providerCredential:"NVIDIA_API_KEY",timeoutMs:120_000,maxOutputBytes:128_000,maxStreamBytes:512_000,onProcessStart:pid=>{piProcessId=pid;}});
 const request={id:`${taskId}:worker`,role:"worker" as const,repository:root,isolationKey:`${taskId}:session`,prompt:`Create exactly one file at ${target} with the following exact UTF-8 contents, including the final newline:\n\n${content}\nUse only the ASEN-authorized file writing tools. Do not run shell commands or alter any other path. This is the complete task.`,candidate,writeSurfaces:[target],skillContext,skillPaths,writerAdmission,model:"nvidia/nemotron-3.5-lightning-30b-a3b",thinking:"minimal" as const};
 const result=await new Dispatcher(runner,evidence).dispatch(request);
 const completedAt=finishAt();
 assert.equal(result.ok,true,"Pi/NVIDIA authorized task failed; inspect the redacted process logs and retained evidence");
 assert.equal(readFileSync(join(root,target),"utf8"),content,"provider output did not produce the required exact authorized edit");
 const status=execFileSync("git",["-C",root,"status","--porcelain=v1","-z","--untracked-files=all"],{encoding:"utf8"});
 const rows=status.split("\0").filter(Boolean),changedPaths=rows.map(row=>row.slice(3)).sort();
 assert.deepEqual(changedPaths,[target],"only the exact authorized path may change");
 assert.equal(git(root,"rev-parse","HEAD"),baseSha,"the live edit must not commit or move HEAD");
 let patch:string;
 try{patch=execFileSync("git",["-C",root,"diff","--binary","--no-index","--","/dev/null",target],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});}
 catch(error){const failure=error as NodeJS.ErrnoException&{status?:number;stdout?:Buffer|string};if(failure.status!==1)throw error;patch=Buffer.isBuffer(failure.stdout)?failure.stdout.toString("utf8"):String(failure.stdout??"");}
 const fileSha256=createHash("sha256").update(readFileSync(join(root,target))).digest("hex");
 mkdirSync(evidenceDirectory,{recursive:true});
 writeFileSync(join(evidenceDirectory,"live-write.diff"),patch,{mode:0o600});
 writeFileSync(join(evidenceDirectory,"live-write-evidence.json"),JSON.stringify({candidateSha:expectedSha,baseSha,taskId,sessionId:request.isolationKey,project:root,processId:process.pid,piProcessId,provider:"nvidia",model:request.model,authorizationId:taskId,allowedPaths:[target],observedPaths:changedPaths,contentSha256:fileSha256,patchSha256:createHash("sha256").update(patch).digest("hex"),startedAt,completedAt,result:"PASS"},null,2)+"\n",{mode:0o600});
 process.stdout.write(JSON.stringify({candidateSha:expectedSha,taskId,provider:"nvidia",model:request.model,allowedPaths:[target],observedPaths:changedPaths,result:"PASS"})+"\n");
}finally{
 try{execFileSync("git",["-C",sourceRoot,"worktree","remove","--force",taskRoot],{stdio:"ignore"});}catch{rmSync(taskRoot,{recursive:true,force:true});}
}
