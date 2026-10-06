import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Research-only JavaScript baseline collector, outside the runtime package.
import {collectBaseline,validateBaseline,verifyBaselineObjects,detectBaselineDrift,sourceReferences} from "../scripts/ecosystem-baseline.mjs";

function fixture(t:test.TestContext) {
  const root=mkdtempSync(join(tmpdir(),"asen-ecosystem-"));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  git("init","-q");git("config","core.autocrlf","false");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");
  mkdirSync(join(root,"extensions"));mkdirSync(join(root,"lib"));mkdirSync(join(root,"docs"));
  writeFileSync(join(root,"package.json"),JSON.stringify({dependencies:{"dep-one":"1"}}));
  writeFileSync(join(root,"extensions","entry.ts"),'import {x} from "../lib/core.js";\nimport "node:fs";\nimport "dep-one";\nconst variable="v"; import(variable);\nexport const main=x;\n');
  writeFileSync(join(root,"lib","core.ts"),'import "../extensions/entry.js";\nexport const x="á😀";\r\n');
  writeFileSync(join(root,"docs","guide.md"),'# Guide\n[read](../README.md#start)\n[absent](missing.md)\n[external](https://example.test)\n[escape](../../secret)\n');
  writeFileSync(join(root,"README.md"),"# Start\n");
  git("add",".");git("commit","-qm","fixture");
  return {root,git,commit:git("rev-parse","HEAD")};
}

test("Git-object baseline preserves exact bytes, closes cycles and ignores dirty/untracked state",t=>{
  const f=fixture(t), baseline=collectBaseline(f.root,f.commit);
  assert.deepEqual(validateBaseline(baseline),[]);
  const core=baseline.files.find((row:any)=>row.path==="lib/core.ts");
  assert.equal(core.bytes,Buffer.byteLength('import "../extensions/entry.js";\nexport const x="á😀";\r\n'));
  writeFileSync(join(f.root,"lib","core.ts"),"dirty");
  writeFileSync(join(f.root,"extensions","untracked.ts"),"untracked");
  assert.deepEqual(collectBaseline(f.root,f.commit),baseline);
  assert.equal(verifyBaselineObjects(f.root,baseline),true);
  assert.ok(baseline.files.some((row:any)=>row.references.some((ref:any)=>ref.status==="outside-root")));
  for(const status of ["dependency","builtin","unresolved","absent","external"])
    assert.ok(baseline.files.some((row:any)=>row.references.some((ref:any)=>ref.status===status)),status);
});

test("rejects malformed identities, duplicate/escape paths, dangling closure and altered byte identities",t=>{
  const f=fixture(t), baseline=collectBaseline(f.root,f.commit);
  for(const mutate of [
    (b:any)=>{b.commit="HEAD";},(b:any)=>{b.files[0].path="../outside";},
    (b:any)=>{b.files.push(b.files[0]);},(b:any)=>{b.files[0].sha256="wrong";},
    (b:any)=>{b.files[0].bytes=-1;},(b:any)=>{b.files[0].anchors={};},(b:any)=>{b.files[0].visibility="runtime-installed";},
    (b:any)=>{b.files[0].references=[{kind:"import",target:"./none",path:"none.ts",status:"tracked"}];},
  ]) {const changed=structuredClone(baseline);mutate(changed);assert.ok(validateBaseline(changed).length);}
  const changed=structuredClone(baseline);changed.files[0].sha256="a".repeat(64);
  assert.throws(()=>verifyBaselineObjects(f.root,changed),/pinned Git objects/);
  assert.throws(()=>collectBaseline(f.root,"HEAD"),/exact/);
  assert.throws(()=>collectBaseline(f.root,"a".repeat(40)));
});

test("static imports use syntax nodes; computed imports remain explicitly unresolved",()=>{
  const refs=sourceReferences("entry.ts",Buffer.from('// import "./fake"\nimport "./real"; export * from "./export"; import("./dynamic"); import(name);'));
  assert.deepEqual(refs.map((r:any)=>r.target).sort(),[null,"./dynamic","./export","./real"].sort());
});

test("asset and public registration references participate in frozen closure and drift",t=>{
  const f=fixture(t);
  mkdirSync(join(f.root,"art"));writeFileSync(join(f.root,"art","icon.svg"),'<svg></svg>');
  writeFileSync(join(f.root,"extensions","ui.ts"),'const NAME="asen_probe"; pi.registerTool({name:NAME,execute(){return 1}}); pi.registerCommand("probe",{}); pi.on("session_start",()=>{}); const icon=new URL("../art/icon.svg",import.meta.url);');
  f.git("add",".");f.git("commit","-qm","asset fixture");
  const before=collectBaseline(f.root,f.git("rev-parse","HEAD"));
  assert.ok(before.files.some((r:any)=>r.path==="art/icon.svg"),"non-root asset must enter closure");
  const refs=before.files.find((r:any)=>r.path==="extensions/ui.ts").references;
  for(const [kind,target] of [["tool","asen_probe"],["command","probe"],["event","session_start"]])assert.ok(refs.some((r:any)=>r.kind===kind&&r.target===target&&r.status==="declared"));
  assert.deepEqual(validateBaseline(before),[]);
  writeFileSync(join(f.root,"art","icon.svg"),'<svg width="2"></svg>');f.git("add",".");f.git("commit","-qm","asset change");
  const report=detectBaselineDrift(before,collectBaseline(f.root,f.git("rev-parse","HEAD")));
  assert.ok(report.invalidatedPaths.includes("extensions/ui.ts"));
});

test("public contract anchors bind complete registration bodies and computed assets stay unresolved",()=>{
  const refs=sourceReferences("ui.ts",Buffer.from('pi.registerTool({name:computed}); new URL(asset,import.meta.url); // pi.registerCommand("fake",{})'));
  assert.ok(refs.some((r:any)=>r.kind==="tool"&&r.target===null));
  assert.ok(refs.some((r:any)=>r.kind==="asset"&&r.target===null));
  assert.equal(refs.some((r:any)=>r.target==="fake"),false);
  assert.equal(sourceReferences("ui.ts",Buffer.from('let name="old"; name="new"; pi.registerCommand(name,{});'))[0].target,null);
});

test("literal references never escape lexical scope or override parameters",()=>{
  for(const source of ['function setup(){const ASSET="../art/icon.svg";} new URL(ASSET,import.meta.url);','const NAME="probe"; function setup(NAME){pi.registerCommand(NAME,{});}','const NAME="probe"; function setup({value:NAME}){pi.registerCommand(NAME,{});}']){
    assert.ok(sourceReferences("ui.ts",Buffer.from(source)).every((r:any)=>r.target===null));
  }
  assert.equal(sourceReferences("ui.ts",Buffer.from('pi.registerTool({"name":"probe"});'))[0].target,"probe");
  for(const source of ['const n="outer"; function f(){if(true){var n="inner";} pi.registerCommand(n,{})}','const n="outer"; const f=function n(){pi.registerCommand(n,{})};'])assert.ok(sourceReferences("ui.ts",Buffer.from(source)).every((r:any)=>r.target===null));
});

test("command docs invalidate transitively and complete contract anchors cannot be malformed",t=>{
  const f=fixture(t);writeFileSync(join(f.root,"extensions","ui.ts"),'pi.registerCommand("probe",{handler(){return 1}});');
  writeFileSync(join(f.root,"README.md"),'# Start\nRun `/probe`.\n<img src="/outside.svg">');
  f.git("add",".");f.git("commit","-qm","commands");const before=collectBaseline(f.root,f.git("rev-parse","HEAD"));
  const readme=before.files.find((r:any)=>r.path==="README.md");assert.ok(readme.references.some((r:any)=>r.status==="registered"&&r.path==="extensions/ui.ts"));
  assert.ok(readme.references.some((r:any)=>r.status==="outside-root"));
  const ui=before.files.find((r:any)=>r.path==="extensions/ui.ts");assert.ok(ui.anchors.some((a:any)=>a.kind==="public-contract"));
  const malformed=structuredClone(before);malformed.files.find((r:any)=>r.path===ui.path).anchors.find((a:any)=>a.kind==="public-contract").endLine=0;assert.ok(validateBaseline(malformed).length);
  writeFileSync(join(f.root,"extensions","ui.ts"),'pi.registerCommand("probe",{handler(){throw Error("blocked")}});');f.git("add",".");f.git("commit","-qm","contract change");
  const report=detectBaselineDrift(before,collectBaseline(f.root,f.git("rev-parse","HEAD")));assert.ok(report.invalidatedPaths.includes("README.md"));assert.ok(report.changes.some((r:any)=>r.kind==="ANCHORS_CHANGED"&&r.path===ui.path));
});

test("drift reports edits, unique renames, additions, removals and reference/anchor changes without adoption",t=>{
  const f=fixture(t), before=collectBaseline(f.root,f.commit);
  f.git("mv","docs/guide.md","docs/renamed.md");
  writeFileSync(join(f.root,"README.md"),"# Changed\n[link](docs/renamed.md)\n");
  writeFileSync(join(f.root,"extensions","added.ts"),"export const added=1;\n");
  writeFileSync(join(f.root,"package.json"),JSON.stringify({dependencies:{"dep-one":"2"}}));
  f.git("add",".");f.git("commit","-qm","change");
  const after=collectBaseline(f.root,f.git("rev-parse","HEAD")), report=detectBaselineDrift(before,after);
  assert.equal(report.autoAdopt,false);
  for(const kind of ["RENAMED","CONTENT_CHANGED","ANCHORS_CHANGED","REFERENCES_CHANGED","ADDED","DEPENDENCIES_CHANGED"])
    assert.ok(report.changes.some((c:any)=>c.kind===kind),kind);
  assert.ok(report.invalidatedPaths.includes("docs/guide.md"));
  assert.ok(report.invalidatedPaths.includes("docs/renamed.md"));
  assert.deepEqual(detectBaselineDrift(before,before).changes,[]);
});

test("library changes invalidate importing roots and ambiguous hashes are never called renames",t=>{
  const f=fixture(t), before=collectBaseline(f.root,f.commit);
  writeFileSync(join(f.root,"lib","core.ts"),'export const x="changed";\n');
  f.git("add",".");f.git("commit","-qm","library change");
  const after=collectBaseline(f.root,f.git("rev-parse","HEAD"));
  assert.ok(detectBaselineDrift(before,after).invalidatedPaths.includes("extensions/entry.ts"));
  const renamed=structuredClone(before),original=renamed.files.find((row:any)=>row.path==="README.md");
  renamed.files=renamed.files.filter((row:any)=>row.path!=="README.md");
  renamed.roots=renamed.roots.filter((p:string)=>p!=="README.md");
  for(const name of ["docs/copy1.md","docs/copy2.md"]){renamed.files.push({...original,id:"ECO-SRC-"+createHash("sha256").update(name).digest("hex").slice(0,16),path:name,references:[]});renamed.roots.push(name);}
  for(const row of renamed.files) row.references=row.references.filter((ref:any)=>ref.path!=="README.md");
  const report=detectBaselineDrift(before,renamed);
  assert.equal(report.changes.some((c:any)=>c.kind==="RENAMED"&&c.path==="README.md"),false);
  assert.ok(report.changes.some((c:any)=>c.kind==="REMOVED"&&c.path==="README.md"));
});

test("checked-in ecosystem manifest is valid research evidence",()=>{
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  assert.deepEqual(validateBaseline(baseline),[]);
  assert.equal(baseline.files.filter((r:any)=>r.path.startsWith("extensions/")).length,20);
  assert.equal(baseline.commit,"08de420ca29be16b6f6bee725a30b599b061df16");
});

for(const [name,mutate] of [
  ["rejects non-string dependency names",(b:any)=>{b.dependencyNames=[null];}],
  ["rejects omitted dependency names contradicting version specs",(b:any)=>{b.dependencyNames=[];}],
  ["rejects a tracked reference without a literal source target",(b:any)=>{b.files.find((r:any)=>r.references.some((x:any)=>x.status==="tracked")).references.find((x:any)=>x.status==="tracked").target=null;}],
] as const) test(name,()=>{
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  mutate(baseline);assert.ok(validateBaseline(baseline).length);
  assert.throws(()=>detectBaselineDrift(baseline,baseline),/malformed/);
});

test("Git normalization is recorded as committed bytes instead of worktree bytes",t=>{
 const f=fixture(t);f.git("config","core.autocrlf","true");
 const source='import "../extensions/entry.js";\nexport const x="á😀";\r\n';writeFileSync(join(f.root,"lib","core.ts"),source);
 f.git("add","--renormalize","lib/core.ts");f.git("commit","-qm","normalize");const commit=f.git("rev-parse","HEAD"),baseline=collectBaseline(f.root,commit),core=baseline.files.find((row:any)=>row.path==="lib/core.ts");
 assert.equal(core.bytes,Buffer.byteLength(source.replaceAll("\r\n","\n")));assert.notEqual(core.bytes,Buffer.byteLength(readFileSync(join(f.root,"lib","core.ts"))));assert.equal(verifyBaselineObjects(f.root,baseline),true);
});
