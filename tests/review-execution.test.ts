import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {issueSkillContext} from "../src/skills/context.js";
import {executeIndependentReview} from "../src/evidence/review-execution.js";
import {EvidenceStore} from "../src/evidence/store.js";

test("review process binds task, reviewer, candidate, result and execution",async t=>{
 const repository=await mkdtemp(join(tmpdir(),"asen-review-"));t.after(()=>rm(repository,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repository]);
 execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={id:"candidate",repository,revision,createdAt:"now"};
 const context=issueSkillContext("task:reviewer",repository,candidate,{phase:"adversarial-review"});
 const report={candidateRepository:repository,candidateId:candidate.id,candidateRevision:revision,reviewer:context.taskId,reviewerRole:"independent",findings:[]};
 const command=(value:unknown)=>[process.execPath,"-e",`process.stdout.write(${JSON.stringify(JSON.stringify(value))})`] as const;
 const store=new EvidenceStore();
 assert.throws(()=>store.addReviewed(candidate,{} as never),/not ASEN-issued/);
 await assert.rejects(()=>executeIndependentReview(candidate,context,context.taskId,command(report)),/independent of author/);
 await assert.rejects(()=>executeIndependentReview({...candidate,revision:"other"},context,"author",command(report)),/exact candidate/);
 await assert.rejects(()=>executeIndependentReview(candidate,context,"author",command({...report,reviewer:"task:other"})),/reviewer identity/);
 await assert.rejects(()=>executeIndependentReview(candidate,context,"author",command({...report,candidateId:"other"})),/revision mismatch/);
 await assert.rejects(()=>executeIndependentReview(candidate,context,"author",command({...report,findings:[{id:"blocking",severity:"high",message:"defect"}]})),/blocking findings/);
 const proof=await executeIndependentReview(candidate,context,"author",command(report));
 assert.throws(()=>store.addReviewed({...candidate,id:"other"},proof),/candidate mismatch/);
 store.addReviewed(candidate,proof);
 assert.equal(store.hasPassing(candidate,"review"),true);
});


test("independent review executes outside the mutable authoritative checkout",async t=>{
 const repository=await mkdtemp(join(tmpdir(),"asen-review-isolated-"));t.after(()=>rm(repository,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repository]);
 execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={id:"candidate",repository,revision,createdAt:"now"};
 const context=issueSkillContext("task:reviewer",repository,candidate,{phase:"adversarial-review"});
 const base={candidateRepository:repository,candidateId:candidate.id,candidateRevision:revision,reviewer:context.taskId,reviewerRole:"independent"};
 const script=`const report=${JSON.stringify(base)};report.findings=process.cwd()===${JSON.stringify(repository)}?[{id:"mutable-checkout",severity:"high",message:"review ran in authoritative checkout"}]:[];process.stdout.write(JSON.stringify(report))`;
 const proof=await executeIndependentReview(candidate,context,"author",[process.execPath,"-e",script]);
 assert.equal(proof.report.findings.length,0);
 assert.equal(execFileSync("git",["-C",repository,"status","--porcelain"],{encoding:"utf8"}).trim(),"");
});
