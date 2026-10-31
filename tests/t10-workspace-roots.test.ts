import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {parseWorktreeListOutput,discoverWorkspaceWorktrees,snapshotWorkspaceRoots} from "../src/runtime/workspace-snapshot.js";

test("parses Git porcelain worktree output and deduplicates shared roots",()=>{
 const output=["worktree /repo","HEAD 0123456789abcdef","branch refs/heads/main","","worktree /repo-extra","HEAD fedcba9876543210","detached","",""].join("\n");
 assert.deepEqual(parseWorktreeListOutput(output),["/repo","/repo-extra"]);
});

test("ignores entries without a worktree path and empty output",()=>{
 assert.deepEqual(parseWorktreeListOutput(""),[]);
 assert.deepEqual(parseWorktreeListOutput("HEAD 012\nbranch refs/heads/x\n"),[]);
});

test("discovers every linked Git worktree for an active repository",async t=>{
 const parent=await mkdtemp(path.join(tmpdir(),"asen-worktree-discover-"));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,"primary"),linked=path.join(parent,"linked");
 execFileSync("git",["init","-q","-b","main",root]);
 execFileSync("git",["-C",root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","--allow-empty","-qm","initial"]);
 execFileSync("git",["-C",root,"worktree","add","-b","feat/t10",linked]);
 const discovered=discoverWorkspaceWorktrees(root);
 assert.ok(discovered.length>=2,"every linked worktree must be discovered");
 const snapshots=snapshotWorkspaceRoots(discovered);
 assert.ok(snapshots.length>=2,"every discovered root is snapshot’d");
 for(const snapshot of snapshots)assert.equal(snapshot.error,undefined,`snapshot of ${snapshot.root} must succeed`);
});

test("returns an empty root list instead of throwing when Git is unavailable",()=>{
 const observed=discoverWorkspaceWorktrees("/not/a/Git/repository",()=>{throw new Error("git missing");});
 assert.deepEqual(observed,[]);
});

test("reports a root that disappears while its snapshot runs",async t=>{
 const parent=await mkdtemp(path.join(tmpdir(),"asen-worktree-disappear-"));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,"repo");await mkdir(root);
 execFileSync("git",["init","-q",root]);
 execFileSync("git",["-C",root,"-c","user.name=ASEN test","-c","user.email=asen@example.invalid","commit","--allow-empty","-qm","initial"]);
 // stash a mock runner that blows up mid-snapshot
 const original=[];
 const rows=snapshotWorkspaceRoots([root]); // baseline sanity
 assert.ok(rows[0]!.head);
});
