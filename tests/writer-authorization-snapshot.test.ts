import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import test from "node:test";
import {mkdtemp,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertWriterAuthorizationSnapshotCurrent,assertWriterAuthorizationSnapshotOutcome,captureWriterAuthorizationSnapshot} from "../src/lifecycle/writer-authorization-snapshot.js";

async function fixture(t:test.TestContext){
 const repository=await mkdtemp(join(tmpdir(),"asen-writer-snapshot-"));t.after(()=>rm(repository,{recursive:true,force:true}));
 await writeFile(join(repository,"allowed.txt"),"before\n");await writeFile(join(repository,"outside.txt"),"before\n");
 execFileSync("git",["init","-q",repository]);execFileSync("git",["-C",repository,"add","."]);execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","-m","initial"]);
 const revision=execFileSync("git",["-C",repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();return {repository,candidate:{id:"writer",repository,revision,createdAt:"now"}};
}
test("writer authorization binds one clean candidate and only its original file scope",async t=>{
 const {repository,candidate}=await fixture(t),snapshot=captureWriterAuthorizationSnapshot(candidate,["allowed.txt"]);
 await writeFile(join(repository,"allowed.txt"),"after\n");
 assert.deepEqual(assertWriterAuthorizationSnapshotOutcome(snapshot),["allowed.txt"]);
});
test("writer authorization rejects a pre-start race and cannot be reused for a newer candidate",async t=>{
 const {repository,candidate}=await fixture(t),snapshot=captureWriterAuthorizationSnapshot(candidate,["allowed.txt"]);
 await writeFile(join(repository,"allowed.txt"),"raced\n");
 assert.throws(()=>assertWriterAuthorizationSnapshotCurrent(snapshot),/unchanged workspace snapshot/);
 await writeFile(join(repository,"allowed.txt"),"advanced\n");
 execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-qam","advance"]);
 assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snapshot),/candidate changed/);
});
test("writer authorization rejects tracked and untracked changes outside its scope",async t=>{
 const {repository,candidate}=await fixture(t),snapshot=captureWriterAuthorizationSnapshot(candidate,["allowed.txt"]);
 await writeFile(join(repository,"outside.txt"),"outside\n");
 assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snapshot),/outside its exact scope: outside.txt/);
 await writeFile(join(repository,"outside.txt"),"before\n");await writeFile(join(repository,"new-outside.txt"),"outside\n");
 assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snapshot),/outside its exact scope: new-outside.txt/);
});
test("writer authorization rejects repository and write-surface symbolic links",async t=>{
 const {repository,candidate}=await fixture(t),linkedRepository=`${repository}-link`,external=await mkdtemp(join(tmpdir(),"asen-writer-snapshot-external-"));
 t.after(()=>Promise.all([rm(linkedRepository,{recursive:true,force:true}),rm(external,{recursive:true,force:true})]));
 const directoryLink=process.platform==="win32"?"junction":"dir";
 try{await symlink(repository,linkedRepository,directoryLink);await symlink(external,join(repository,"linked"),directoryLink);}catch(error){
  if((error as NodeJS.ErrnoException).code==="EPERM"||(error as NodeJS.ErrnoException).code==="EACCES"){t.skip("The host does not permit directory link creation");return;}
  throw error;
 }
 assert.throws(()=>captureWriterAuthorizationSnapshot({...candidate,repository:linkedRepository},["allowed.txt"]),/repository is unsafe/);
 assert.throws(()=>captureWriterAuthorizationSnapshot(candidate,["linked"]),/surface is symbolic link/);
});

test("writer outcome rejects a symlink substituted after authorization",async t=>{
 const {repository,candidate}=await fixture(t);
 const external=await mkdtemp(join(tmpdir(),"asen-writer-external-"));
 t.after(()=>rm(external,{recursive:true,force:true}));
 const snapshot=captureWriterAuthorizationSnapshot(candidate,["allowed.txt"]);
 const {unlink}=await import("node:fs/promises");
 await unlink(join(repository,"allowed.txt"));
 try{await symlink(join(external,"target.txt"),join(repository,"allowed.txt"),"file");}
 catch(error){
  if(["EPERM","EACCES"].includes((error as NodeJS.ErrnoException).code??"")){t.skip("The host does not permit file symlinks");return;}
  throw error;
 }
 assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snapshot),/surface is symbolic link/);
});

test("writer outcome rejects a newly introduced untracked symlink inside an allowed directory",async t=>{
 const {repository,candidate}=await fixture(t);
 const {mkdir}=await import("node:fs/promises");
 await mkdir(join(repository,"allowed"));
 await writeFile(join(repository,"allowed","original.txt"),"before\\n");
 execFileSync("git",["-C",repository,"add","allowed/original.txt"]);
 execFileSync("git",["-C",repository,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-qm","add allowed directory"]);
 const revision=execFileSync("git",["-C",repository,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
 const snapshot=captureWriterAuthorizationSnapshot({...candidate,revision},["allowed"]);
 const external=await mkdtemp(join(tmpdir(),"asen-writer-external-"));
 t.after(()=>rm(external,{recursive:true,force:true}));
 try{await symlink(join(external,"target.txt"),join(repository,"allowed","link.txt"),"file");}
 catch(error){if(["EPERM","EACCES"].includes((error as NodeJS.ErrnoException).code??"")){t.skip("The host does not permit file symlinks");return;}throw error;}
 assert.throws(()=>assertWriterAuthorizationSnapshotOutcome(snapshot),/surface is symbolic link/);
});
