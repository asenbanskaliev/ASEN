import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
// @ts-expect-error Frozen remote provenance collector is ESM without a TS declaration.
import {pinnedAgentABSources,verifyAgentABGitObjects} from "../scripts/agent-ab-source-witness.mjs";

const manifest=JSON.parse(readFileSync(new URL("../registry/parity/agent-ab-baselines-v1.json",import.meta.url),"utf8"));
const root=join(process.cwd(),"tmp-agent-ab-fixture");

function fakeGit({wrongCommit="",wrongTree="",missingFile="",wrongBlob="",wrongPackage="",wrongGoModule=""}={}){
 const calls:string[][]=[];
 function invoke(_bin:string,args:string[]){
  assert.equal(_bin,"git");
  calls.push(args);
  if(args[0]==="init")return "";
  const marker=args[1] as string;
  const id=marker.endsWith("A.git")?"A":"B";
  const src=manifest.sources.find((x:{id:string})=>x.id===id);
  assert.ok(src);
  if(args.includes("fetch"))return "";
  const end=args.slice(2);
  if(end[0]==="rev-parse"&&end[1]==="FETCH_HEAD")
   return (wrongCommit===id?"0".repeat(40):src.commit)+"\n";
  if(end[0]==="rev-parse"&&String(end[1]).endsWith("^{tree}"))
   return (wrongTree===id?"0".repeat(40):src.tree)+"\n";
  if(end[0]==="cat-file"&&end[1]==="-t")
   return (end[2]===src.commit?"commit":wrongBlob===id?"tree":"blob")+"\n";
  if(end[0]==="cat-file"&&end[1]==="blob"){
   if(end[2]==="b".repeat(40))
    return wrongGoModule===id?"module github.com/forged/package/v1\n":
     "module github.com/gentleman-programming/gentle-ai/v4\n";
   if(end[2]==="c".repeat(40)){
    const name=wrongPackage===id?"impostor":id==="A"?"gentle-pi":"gentleman-ai-installer";
    return JSON.stringify({name,pi:{extensions:id==="A"?["./extensions"]:[]}})+"\n";
   }
   throw Error("Unknown frozen blob");
  }
  if(end[0]==="ls-tree"){
   const path=end.at(-1);
   const fileId=path==="go.mod"?"b":path==="package.json"?"c":"a";
   return missingFile===id&&path===src.files[0]?"":
    "100644 blob "+fileId.repeat(40)+"\t"+path+"\n";
  }
  throw Error("Unexpected git arguments "+end.join(" "));
 }
 return {invoke,calls};
}
test("EF-002 authentic A/B source provenance is frozen to two different Git object identities",()=>{
 const sources=pinnedAgentABSources(manifest);
 assert.deepEqual(sources.map((x:{id:string})=>x.id),["A","B"]);
 assert.equal(sources.length,2);
 assert.notEqual(sources[0].commit,sources[1].commit);
 assert.notEqual(sources[0].tree,sources[1].tree);
 for(const src of sources){
  assert.match(src.commit,/^[0-9a-f]{40}$/u);
  assert.match(src.tree,/^[0-9a-f]{40}$/u);
  assert.ok(src.files.length>=2);
 }
});
test("EF-002 two isolated real-Git-object command flows are source-only and do not claim C01-C20",()=>{
 const {invoke,calls}=fakeGit();
 const report=verifyAgentABGitObjects({manifest,root,git:invoke});
 assert.equal(report.status,"SOURCE_OBJECTS_VERIFIED");
 assert.equal(report.checkedSources,2);
 assert.equal(report.executedCases,0);
 assert.equal(report.modelCalls,0);
 assert.equal(report.globalFull,false);
 assert.equal(report.runtimeAttested,false);
 assert.equal(report.referenceParity,false);
 assert.equal(report.identicalHostRuntime,false);
 assert.equal(report.referenceBRequiresProvisionedTarget,true);
 assert.equal(report.sources[0].packageName,"gentle-pi");
 assert.equal(report.sources[0].runtimeSurface,"native-pi-agent-runtime");
 assert.equal(report.sources[1].packageName,"gentleman-ai-installer");
 assert.equal(report.sources[1].runtimeSurface,"installer-and-agent-framework");
 assert.equal(report.sources.length,2);
 assert.ok(report.sources.every((s:{sourceOnly:boolean})=>s.sourceOnly));
 const fetchCalls=calls.filter(x=>x.includes("fetch"));
 assert.equal(fetchCalls.length,2);
 for(let i=0;i<2;i++){
  assert.deepEqual(fetchCalls[i]!.slice(-4),["--depth=1","--no-tags",
   "https://github.com/"+manifest.sources[i].repository+".git",manifest.sources[i].commit]);
 }
 assert.ok(calls.every(args=>!args.some(a=>["checkout","run","install","npm","exec","push","commit","reset"].includes(a))),
  "Source witness may never run untrusted upstream scripts or write a repository checkout");
});
test("EF-002 source provenance must fail closed on forged commits, trees and missing source files",()=>{
 for(const [key,issue] of [
  ["commit",{wrongCommit:"A"}],["tree",{wrongTree:"B"}],
  ["file",{missingFile:"A"}],["blob",{wrongBlob:"B"}],
 ] as const){
  const git=fakeGit(issue);
  assert.throws(()=>verifyAgentABGitObjects({manifest,root,git:git.invoke}),
   /identity mismatch|required source file|immutable Git blob/u,key);
 }
});
test("EF-002 source provenance rejects confusing a framework installer with a second Pi runtime",()=>{
 for(const [label,issue] of [
  ["A wrong native runtime",{wrongPackage:"A"}],
  ["B wrong installer package",{wrongPackage:"B"}],
  ["B wrong Go module",{wrongGoModule:"B"}],
 ] as const){
  const git=fakeGit(issue);
  assert.throws(()=>verifyAgentABGitObjects({manifest,root,git:git.invoke}),
   /native Pi harness|installer ecosystem|Go installer identity/u,label);
 }
});

test("EF-002 manifest rejects poisoned object identities or repository/path traversal",()=>{
 const mutate=(change:(m:any)=>void)=>{
  const m=structuredClone(manifest);change(m);
  assert.throws(()=>pinnedAgentABSources(m),/Frozen A\/B|Invalid frozen A\/B/u);
 };
 mutate(m=>m.sources[0].commit="not-a-sha");
 mutate(m=>m.sources[1].tree="../foreign");
 mutate(m=>m.sources[0].repository="../local");
 mutate(m=>m.sources[0].files=["../secrets.txt","README.md"]);
 mutate(m=>m.sources[0].files=["README.md","README.md"]);
 mutate(m=>m.sources[1].id="A");
 mutate(m=>m.sources[1].repository=m.sources[0].repository);
 mutate(m=>m.sources[1].commit=m.sources[0].commit);
});
