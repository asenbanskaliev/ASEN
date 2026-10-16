import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
// @ts-expect-error Research-only upstream audit is outside the runtime package.
import {runCurrentUpstreamAudit} from "../scripts/audit-current-upstream.mjs";

test("current upstream audit refuses unpinned candidate without cloning",()=>{
 assert.throws(()=>runCurrentUpstreamAudit({candidate:"main",run:()=>{throw new Error("unexpected git");}}),/exact 40-character/);
});
test("current upstream audit rejects a local repository missing the frozen source before comparing",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-upstream-audit-test-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
 mkdirSync(join(root,"extensions"));writeFileSync(join(root,"extensions","x.ts"),"export const x=1;\n");
 git("add",".");git("commit","-qm","fixture");const candidate=git("rev-parse","HEAD");
 assert.throws(()=>runCurrentUpstreamAudit({candidate,sourceRepository:root}),/Frozen upstream baseline is unavailable/);
});

test("current upstream audit rejects an unknown exact candidate without falling through",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-upstream-missing-candidate-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 execFileSync("git",["-C",root,"init","-q"]);
 assert.throws(()=>runCurrentUpstreamAudit({candidate:"f".repeat(40),sourceRepository:root}),/candidate is unavailable as a commit/);
});

test("current upstream audit requires a configured source before invoking Git",()=>{
 const original=process.env.ASEN_ECOSYSTEM_SOURCE_URL;
 try{
  delete process.env.ASEN_ECOSYSTEM_SOURCE_URL;
  assert.throws(()=>runCurrentUpstreamAudit({run:()=>{throw new Error("unexpected Git invocation");}}),/Set ASEN_ECOSYSTEM_SOURCE_URL/);
 }finally{if(original===undefined)delete process.env.ASEN_ECOSYSTEM_SOURCE_URL;else process.env.ASEN_ECOSYSTEM_SOURCE_URL=original;}
});

test("current upstream audit defaults to the exact pinned candidate",()=>{
 const original=process.env.ASEN_ECOSYSTEM_SOURCE_URL;
 const fetched:string[]=[];
 process.env.ASEN_ECOSYSTEM_SOURCE_URL="https://example.invalid/source.git";
 try{
  assert.throws(()=>runCurrentUpstreamAudit({run:(_command:string,args:string[])=>{
   if(args[0]==="clone")return "";
   if(args.includes("fetch")){
    fetched.push(args.at(-1) as string);
    if(fetched.length===2)throw new Error("stop after candidate fetch");
    return "";
   }
   throw new Error("unexpected Git invocation");
  }}),/Unable to fetch exact upstream commit d5d692a6888da9e9844e7e443ee30991fa4b9d14/);
  assert.deepEqual(fetched,["08de420ca29be16b6f6bee725a30b599b061df16","d5d692a6888da9e9844e7e443ee30991fa4b9d14"]);
 }finally{if(original===undefined)delete process.env.ASEN_ECOSYSTEM_SOURCE_URL;else process.env.ASEN_ECOSYSTEM_SOURCE_URL=original;}
});

test("current upstream audit rejects a blob SHA even when its object exists",t=>{
 const root=mkdtempSync(join(tmpdir(),"asen-upstream-blob-candidate-"));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
 git("init","-q");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
 writeFileSync(join(root,"payload.txt"),"fixture");git("add",".");git("commit","-qm","fixture");
 const blob=git("rev-parse","HEAD:payload.txt");
 assert.throws(()=>runCurrentUpstreamAudit({candidate:blob,sourceRepository:root}),/candidate is unavailable as a commit/);
});
