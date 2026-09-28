import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {executeEvidenceCommand,addExecutedEvidence} from "../src/evidence/execution.js";
import {EvidenceStore} from "../src/evidence/store.js";

test("execution proof requires the candidate's exact Git repository and HEAD",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"candidate",revision,createdAt:"now"};
 const command=[process.execPath,"-e","process.exit(0)"] as const;
 const proof=await executeEvidenceCommand(candidate,command);
 assert.equal(proof.candidateRevision,revision);
 await assert.rejects(()=>executeEvidenceCommand({...candidate,revision:"another"},command),/revision mismatch/);
 await assert.rejects(()=>executeEvidenceCommand(candidate,command,{cwd:process.cwd()}),/repository mismatch/);
 const nested=join(repo,"nested");await mkdir(nested);
 await assert.rejects(()=>executeEvidenceCommand({...candidate,repository:nested},command,{cwd:nested}),/repository mismatch/);
 const advance=[process.execPath,"-e",`require("child_process").execFileSync("git",["-C",${JSON.stringify(repo)},"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","advance"])`] as const;
 await assert.rejects(()=>executeEvidenceCommand(candidate,advance),/revision mismatch/);
 await assert.rejects(()=>executeEvidenceCommand(candidate,command),/revision mismatch/);
 const store=new EvidenceStore();
 assert.throws(()=>addExecutedEvidence(store,{...candidate,id:"other"},proof,{id:"fake",kind:"test",summary:"fake"}),/candidate mismatch/);
});
test("a failed executed command cannot be relabeled as a passing test",async t=>{
 const repo=await mkdtemp(join(tmpdir(),"asen-failed-execution-"));t.after(()=>rm(repo,{recursive:true,force:true}));
 execFileSync("git",["init","-q",repo]);
 execFileSync("git",["-C",repo,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","initial"]);
 const revision=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const candidate={repository:repo,id:"failed",revision,createdAt:"now"};
 const proof=await executeEvidenceCommand(candidate,[process.execPath,"-e","process.exit(1)"]);
 const store=new EvidenceStore();
 assert.throws(()=>store.addExecuted(candidate,proof,{id:"forged",kind:"test",status:"pass",summary:"forged",createdAt:"now"}),/exit code 0/);
 assert.equal(store.hasPassing(candidate,"test"),false);
});
