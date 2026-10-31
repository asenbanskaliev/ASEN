import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {realpathSync,renameSync} from "node:fs";
import {mkdtemp,mkdir,rename,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {assertWorkspaceRootIdentity,captureWorkspaceRootIdentity,parseWorkspaceStatus,snapshotWorkspaceRoots} from "../src/runtime/workspace-snapshot.js";

test("reports a git root and isolates an unavailable root",()=>{const rows=snapshotWorkspaceRoots([process.cwd(),"/not-a-real-workspace"]);assert.ok(rows[0]!.head);assert.equal(rows[1]!.branch,"unavailable");});

test("parses porcelain NUL records with unusual path characters",()=>{
 const strange="line one\nline two.txt";const files=parseWorkspaceStatus(`?? ${strange}\0`);
 assert.deepEqual(files,[{status:"??",path:strange}]);
});

test("retains the original path of a Git rename and rejects incomplete -z status",()=>{
 assert.deepEqual(parseWorkspaceStatus("R  src/new.ts\0src/old.ts\0"),[{status:"R ",path:"src/new.ts",previousPath:"src/old.ts"}]);
 assert.throws(()=>parseWorkspaceStatus("R  src/new.ts\0"),/incomplete rename\/copy/);
 assert.throws(()=>parseWorkspaceStatus("?? src/new.ts"),/unterminated/);
 assert.throws(()=>parseWorkspaceStatus("?? src/new.ts\0\0"),/empty porcelain record/);
});

test("rejects a nested Git directory instead of projecting another workspace as its own",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-workspace-exact-root-"));t.after(()=>rm(root,{recursive:true,force:true}));
 execFileSync("git",["init","-q",root]);await mkdir(path.join(root,"nested"));
 const row=snapshotWorkspaceRoots([path.join(root,"nested")])[0]!;
 assert.equal(row.branch,"unavailable");
 assert.match(row.error??"",/exact Git root/);
});

test("captures real renamed paths without misreporting the Git status",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-workspace-git-rename-"));t.after(()=>rm(root,{recursive:true,force:true}));
 execFileSync("git",["init","-q",root]);await writeFile(path.join(root,"old.txt"),"file\n");
 execFileSync("git",["-C",root,"add","old.txt"]);
 execFileSync("git",["-C",root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","-qm","initial"]);
 execFileSync("git",["-C",root,"mv","old.txt","new.txt"]);
 const row=snapshotWorkspaceRoots([root])[0]!;
 assert.equal(row.error,undefined);
 assert.deepEqual(row.files,[{status:"R ",path:"new.txt",previousPath:"old.txt"}]);
});

test("parses real Git status names with spaces and preserves porcelain state",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-workspace-snapshot-"));t.after(()=>rm(root,{recursive:true,force:true}));
 execFileSync("git",["init","-q",root]);execFileSync("git",["-C",root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","--allow-empty","-qm","initial"]);
 const strange="line one line two.txt";await writeFile(path.join(root,strange),"untracked\n");
 const row=snapshotWorkspaceRoots([root])[0]!;assert.ok(row.head);assert.equal(row.files.length,1);assert.equal(row.files[0]?.status,"??");assert.equal(row.files[0]?.path,strange);
});

test("rejects a symlink used as the requested workspace root",async t=>{
 if(process.platform==="win32"){t.skip("symlink permission is host-dependent on Windows");return;}
 const parent=await mkdtemp(path.join(tmpdir(),"asen-workspace-symlink-")),root=path.join(parent,"repo"),alias=path.join(parent,"alias");t.after(()=>rm(parent,{recursive:true,force:true}));
 execFileSync("git",["init","-q",root]);await symlink(root,alias,"dir");const row=snapshotWorkspaceRoots([alias])[0]!;assert.equal(row.branch,"unavailable");assert.match(row.error??"",/unsafe/);
});

test("detects a workspace directory replaced after identity capture",async t=>{
 const parent=await mkdtemp(path.join(tmpdir(),"asen-workspace-replaced-")),root=path.join(parent,"repo"),replacement=path.join(parent,"replacement");t.after(()=>rm(parent,{recursive:true,force:true}));
 await mkdir(root);await mkdir(replacement);const captured=captureWorkspaceRootIdentity(root);await rename(root,path.join(parent,"old-repo"));await rename(replacement,root);
 assert.throws(()=>assertWorkspaceRootIdentity(root,captured),/changed during snapshot/u);
});

test("rejects replacement between requested-root lstat and canonical-path resolution",async t=>{
 const parent=await mkdtemp(path.join(tmpdir(),"asen-workspace-canonical-race-")),root=path.join(parent,"repo"),replacement=path.join(parent,"replacement"),old=path.join(parent,"old-repo");t.after(()=>rm(parent,{recursive:true,force:true}));await mkdir(root);await mkdir(replacement);
 assert.throws(()=>captureWorkspaceRootIdentity(root,requested=>{renameSync(root,old);renameSync(replacement,root);return realpathSync(requested);}),/changed during canonicalization/u);
});
