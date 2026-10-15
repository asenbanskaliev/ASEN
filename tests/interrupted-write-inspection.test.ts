import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {inspectInterruptedWrite} from "../src/runtime/interrupted-write-inspection.js";

test("interrupted writer inspection compares candidate, exact scope and Git changes without exposing file contents",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-interrupted-inspection-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]});
 git("init","-q");git("config","user.email","asen-test@example.invalid");git("config","user.name","ASEN test");
 await writeFile(join(root,"approved.txt"),"before\n");await writeFile(join(root,"outside.txt"),"stable\n");git("add","approved.txt","outside.txt");git("commit","-qm","candidate");
 const candidate=git("rev-parse","HEAD").trim(),clean=inspectInterruptedWrite({repository:root,expectedRevision:candidate,writeSurfaces:["approved.txt"]});
 assert.equal(clean.candidate.matches,true);assert.equal(clean.repository.clean,true);assert.equal(clean.recovery.eligibleForFreshPlan,true);assert.deepEqual(clean.changes,[]);
 const nested=join(root,"nested");await mkdir(nested);const nestedClean=inspectInterruptedWrite({repository:nested,expectedRevision:candidate,writeSurfaces:["approved.txt"]});assert.equal(nestedClean.candidate.matches,true);
 await writeFile(join(root,"approved.txt"),"before\npartial SECRET-CONTENT\n");await writeFile(join(root,"outside.txt"),"changed\n");await writeFile(join(root,"approved-new.txt"),"untracked\n");
 const report=inspectInterruptedWrite({repository:root,expectedRevision:candidate,writeSurfaces:["approved.txt","approved-new.txt"]});
 assert.equal(report.candidate.matches,true);assert.equal(report.repository.clean,false);assert.equal(report.recovery.automaticWriteAllowed,false);assert.equal(report.recovery.freshAuthorizationRequired,true);assert.equal(report.recovery.eligibleForFreshPlan,false);
 assert.deepEqual(report.changes.map(change=>[change.path,change.scope,change.untracked===true]),[["approved-new.txt","approved",true],["approved.txt","approved",false],["outside.txt","outside",false]]);
 assert.equal(report.changes.find(change=>change.path==="approved.txt")?.addedLines,1);assert.ok(report.recovery.findings.some(finding=>finding.includes("outside")));
 assert.equal(JSON.stringify(report).includes("SECRET-CONTENT"),false);assert.equal(await readFile(join(root,"approved.txt"),"utf8"),"before\npartial SECRET-CONTENT\n");
 git("add","approved.txt","outside.txt","approved-new.txt");git("commit","-qm","candidate drift");
 const drift=inspectInterruptedWrite({repository:root,expectedRevision:candidate,writeSurfaces:["approved.txt"]});assert.equal(drift.candidate.matches,false);assert.equal(drift.recovery.eligibleForFreshPlan,false);
});

test("interrupted writer inspection rejects unsafe scopes and non-Git projects",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-interrupted-invalid-"));t.after(()=>rm(root,{recursive:true,force:true}));
 assert.throws(()=>inspectInterruptedWrite({repository:root,expectedRevision:"a".repeat(40),writeSurfaces:["../outside"]}),/unsafe path/u);
 await assert.rejects(async()=>inspectInterruptedWrite({repository:root,expectedRevision:"a".repeat(40),writeSurfaces:["file.txt"]}));
});
