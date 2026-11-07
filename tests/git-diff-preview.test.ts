import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,mkdtemp,rm,writeFile,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {previewWorkspaceFileDiff,renderGitDiffPreview,gitChangesIndex} from "../src/runtime/git-diff-preview.js";
import {snapshotWorkspaceRoots} from "../src/runtime/workspace-snapshot.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const git=(root:string,...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",windowsHide:true});
test("M2 Git preview compares HEAD for tracked and untracked files, no editor/writer actions",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-git-diff-view-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 await mkdir(path.join(root,"docs"),{recursive:true});
 await writeFile(path.join(root,"docs","guide.txt"),"before\n");
 git(root,"init","-q");git(root,"add","docs/guide.txt");
 git(root,"-c","user.name=ASEN CI","-c","user.email=test@example.invalid","commit","-qm","baseline");
 await writeFile(path.join(root,"docs","guide.txt"),"after\n");
 await writeFile(path.join(root,"docs","new.txt"),"new\nuntracked\n");
 const observed=snapshotWorkspaceRoots([root])[0]!;
 assert.equal(observed.error,undefined);
 const index=gitChangesIndex(observed,90);
 assert.ok(index.some(row=>row.includes("guide.txt")));
 assert.ok(index.some(row=>row.includes("new.txt")));
 const diff=previewWorkspaceFileDiff(root,"docs/guide.txt");
 assert.ok(diff.lines.some(row=>row.includes("-before")));
 assert.ok(diff.lines.some(row=>row.includes("+after")));
 assert.equal(diff.truncated,false);
 const untracked=previewWorkspaceFileDiff(root,"docs/new.txt");
 assert.ok(untracked.lines.some(row=>row.includes("+++ b/docs/new.txt")));
 assert.ok(untracked.lines.some(row=>row.includes("+untracked")));
 assert.ok(renderGitDiffPreview(untracked,35).every(row=>visibleWidth(row)<=35));
 for(const filename of ["../.env","/etc/passwd","..\\secrets","C:\\Windows\\System32\\drivers\\etc\\hosts","docs/not-changed.txt"])
  assert.throws(()=>previewWorkspaceFileDiff(root,filename),/path|snapshot/u);
 assert.equal(git(root,"status","--porcelain").includes("guide.txt"),true,"Preview never modifies the worktree");
});
test("M2 diff rejects symlink, binary and oversized untracked blobs",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-git-preview-bounds-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 await writeFile(path.join(root,"README.md"),"init\n");
 git(root,"init","-q");git(root,"add","README.md");
 git(root,"-c","user.name=ASEN CI","-c","user.email=test@example.invalid","commit","-qm","baseline");
 await writeFile(path.join(root,"binary.bin"),Buffer.from([65,0,66]));
 await writeFile(path.join(root,"oversized.txt"),"x".repeat(300_000));
 assert.throws(()=>previewWorkspaceFileDiff(root,"binary.bin"),/Binary/u);
 assert.throws(()=>previewWorkspaceFileDiff(root,"oversized.txt"),/byte limit/u);
 if(process.platform!=="win32"){
  await symlink("README.md",path.join(root,"link.txt"));
  assert.throws(()=>previewWorkspaceFileDiff(root,"link.txt"),/Symlink|redirected/u);
 }
});
