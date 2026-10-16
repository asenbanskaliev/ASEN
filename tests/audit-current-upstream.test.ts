import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Research-only upstream audit is outside the runtime package.
import {runCurrentupstreamAudit} from "../scripts/audit-current-upstream.mjs";

test("current upstream audit refuses unpinned candidate without cloning",()=>{
 assert.throws(()=>runCurrentupstreamAudit({candidate:"main",run:()=>{throw new Error("unexpected git");}}),/exact 40-character/);
});
test("current upstream audit rejects a local repository missing the frozen source before comparing",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-upstream-audit-test-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
 mkdirSync(join(root,"extensions"));writeFileSync(join(root,"extensions","x.ts"),"export const x=1;\n");
 git("add",".");git("commit","-qm","fixture");const candidate=git("rev-parse","HEAD");
 assert.throws(()=>runCurrentupstreamAudit({candidate,sourceRepository:root}),/Frozen upstream baseline is unavailable/);
});
