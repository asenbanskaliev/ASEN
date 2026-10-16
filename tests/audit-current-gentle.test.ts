import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Research-only upstream audit is outside the runtime package.
import {runCurrentGentleAudit} from "../scripts/audit-current-gentle.mjs";

test("current Gentle audit refuses unpinned candidate without cloning",()=>{
 assert.throws(()=>runCurrentGentleAudit({candidate:"main",run:()=>{throw new Error("unexpected git");}}),/exact 40-character/);
});
test("current Gentle audit rejects a local repository missing the frozen source before comparing",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-gentle-audit-test-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
 mkdirSync(join(root,"extensions"));writeFileSync(join(root,"extensions","x.ts"),"export const x=1;\n");
 git("add",".");git("commit","-qm","fixture");const candidate=git("rev-parse","HEAD");
 assert.throws(()=>runCurrentGentleAudit({candidate,sourceRepository:root}),/Frozen Gentle baseline is unavailable/);
});
