import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {realpathSync,renameSync} from "node:fs";
import {mkdtemp,mkdir,rename,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {assertWorkspaceRootIdentity,captureWorkspaceRootIdentity,snapshotWorkspaceRoots} from "../src/runtime/workspace-snapshot.js";

test("reports a git root and isolates an unavailable root",()=>{const rows=snapshotWorkspaceRoots([process.cwd(),"/not-a-real-workspace"]);assert.ok(rows[0]!.head);assert.equal(rows[1]!.branch,"unavailable");});

test("parses real Git status names containing newlines and preserves porcelain state",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-workspace-snapshot-"));t.after(()=>rm(root,{recursive:true,force:true}));
 execFileSync("git",["init","-q",root]);execFileSync("git",["-C",root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","--allow-empty","-qm","initial"]);
 const strange="line one\nline two.txt";await writeFile(path.join(root,strange),"untracked\n");
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
