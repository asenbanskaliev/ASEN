import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Research-only JavaScript baseline collector, outside the runtime package.
import * as baselineModule from "../scripts/ecosystem-baseline.mjs";
const {collectBaseline,validateBaseline,verifyBaselineObjects,detectBaselineDrift,sourceReferences}=baselineModule;
const retainedBaselineRepository=process.env.ECOSYSTEM_BASELINE_REPOSITORY??"";

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
  assert.ok(baseline.files.every((row:any)=>row.references.every((ref:any)=>!("reason" in ref))));
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

test("scanner diagnostics distinguish computed names from cwd-dependent file reads",()=>{
  const refs=sourceReferences("entry.ts",Buffer.from(`
    import(variable);
    pi.registerCommand(variable, {});
    pi.registerTool({name});
    pi.on(eventName, () => {});
    new URL(variable, import.meta.url);
    readFileSync("source-relative.txt");
    fs.readFile("source-relative.txt", () => {});
    createReadStream(variable);
  `));
  for(const kind of ["dynamic-import","command","tool","event"])
    assert.ok(refs.some((ref:any)=>ref.kind===kind&&ref.target===null&&ref.reason==="computed"),kind);
  assert.equal(refs.filter((ref:any)=>ref.kind==="asset"&&ref.reason==="computed").length,1);
  assert.equal(refs.filter((ref:any)=>ref.kind==="asset"&&ref.reason==="cwd-dependent").length,3);
});

test("literal source-relative scanner references have no unresolved diagnostic",()=>{
  const refs=sourceReferences("entry.ts",Buffer.from(`
    import("./module.js");
    pi.registerCommand("probe", {});
    pi.registerTool({name:"probe_tool"});
    pi.on("session_start", () => {});
    new URL("./icon.svg", import.meta.url);
  `));
  assert.ok(refs.every((ref:any)=>ref.target!==null));
  assert.ok(refs.every((ref:any)=>!("reason" in ref)));
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
  for(const name of ["docs/copy1.md","docs/copy2.md"]){renamed.files.push({...original,id:`ECO-SRC-${createHash("sha256").update(name).digest("hex").slice(0,16)}`,path:name,references:[]});renamed.roots.push(name);}
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
  assert.ok(baseline.files.every((row:any)=>row.references.every((ref:any)=>!("reason" in ref))));
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

test("fifty-reference overlay adjudicates five frozen filesystem sources without mutating scanner evidence",
  {skip:!retainedBaselineRepository},()=>{
  assert.equal(typeof baselineModule.verifyReferenceAdjudications,"function");
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  assert.equal(verifyBaselineObjects(retainedBaselineRepository,baseline),true);
  const overlay=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-reference-adjudications-v1.json",import.meta.url),"utf8"));
  const baselineBefore=structuredClone(baseline);
  const selected=baseline.files.find((row:any)=>row.id==="ECO-SRC-5a67352cd4badb81");
  const second=baseline.files.find((row:any)=>row.id==="ECO-SRC-1f527249710bd9bf");
  const third=baseline.files.find((row:any)=>row.id==="ECO-SRC-396d124d7d28739b");
  const fourth=baseline.files.find((row:any)=>row.id==="ECO-SRC-f186dd2c4db26151");
  const fifth=baseline.files.find((row:any)=>row.id==="ECO-SRC-b739ab592bf5a9d4");
  const referencesBefore=structuredClone([
    selected.references.slice(0,5),second.references.slice(0,5),second.references.slice(5,20),second.references.slice(20,23),
    third.references.slice(0,7),fourth.references.slice(0,7),fifth.references.slice(0,8),
  ]);
  assert.deepEqual((baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,overlay),
    {scannerUnresolved:164,adjudicated:50,remaining:114});
  assert.deepEqual(baseline,baselineBefore);
  assert.deepEqual([
    selected.references.slice(0,5),second.references.slice(0,5),second.references.slice(5,20),second.references.slice(20,23),
    third.references.slice(0,7),fourth.references.slice(0,7),fifth.references.slice(0,8),
  ],referencesBefore);
  assert.ok(referencesBefore.flat().every((ref:any)=>
    JSON.stringify(ref)===JSON.stringify({kind:"asset",target:null,status:"unresolved",path:null})));
  const withAbsent=structuredClone(baseline);
  withAbsent.files.find((row:any)=>row.id===selected.id).references.push({
    kind:"asset",target:"./adjudication-count-probe",status:"absent",path:"extensions/adjudication-count-probe",
  });
  assert.deepEqual(validateBaseline(withAbsent),[]);
  assert.deepEqual((baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,withAbsent,overlay),
    {scannerUnresolved:165,adjudicated:50,remaining:115});
});

test("five-source overlay rejects identity, ordering, binding, span and authority mutations",
  {skip:!retainedBaselineRepository},()=>{
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  const overlay=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-reference-adjudications-v1.json",import.meta.url),"utf8"));
  const exactErrorMessage=(message:string)=>(error:unknown):error is Error=>
    error instanceof Error&&error.message===message;
  const cases:[string,(b:any,o:any)=>void,string][]=[
    ["commit",(_b,o)=>{o.baselineCommit="a".repeat(40);},"Invalid reference adjudication envelope"],
    ["source",(_b,o)=>{o.adjudications[0].sourceId="ECO-SRC-0000000000000000";},"Reference adjudication row identity mismatch"],
    ["blob",(_b,o)=>{o.adjudications[0].objectId="a".repeat(40);},"Reference adjudication row identity mismatch"],
    ["size",(_b,o)=>{o.adjudications[0].bytes++;},"Reference adjudication row identity mismatch"],
    ["source hash",(_b,o)=>{o.adjudications[0].sha256="a".repeat(64);},"Reference adjudication row identity mismatch"],
    ["duplicate",(_b,o)=>{o.adjudications[1].referenceIndex=0;},"Duplicate or out-of-order reference adjudication index"],
    ["order",(_b,o)=>{[o.adjudications[0],o.adjudications[1]]=[o.adjudications[1],o.adjudications[0]];},"Duplicate or out-of-order reference adjudication index"],
    ["index",(_b,o)=>{o.adjudications[4].referenceIndex=99;},"Duplicate or out-of-order reference adjudication index"],
    ["raw status",(b,_o)=>{b.files.find((r:any)=>r.id===overlay.adjudications[0].sourceId).references[0].status="declared";},"Malformed ecosystem baseline"],
    ["call",(_b,o)=>{o.adjudications[0].callLine++;},"Invalid reference adjudication call or span"],
    ["span start",(_b,o)=>{o.adjudications[0].span.startLine++;},"Invalid reference adjudication call or span"],
    ["span hash",(_b,o)=>{o.adjudications[0].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["class",(_b,o)=>{o.adjudications[0].classification="source-dependency";},"Unsupported reference adjudication classification or disposition"],
    ["disposition",(_b,o)=>{o.adjudications[0].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["row field",(_b,o)=>{o.adjudications[0].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["span field",(_b,o)=>{o.adjudications[0].span.note="extra";},"Malformed reference adjudication authority fields"],
    ["envelope field",(_b,o)=>{o.note="extra";},"Invalid reference adjudication envelope"],
    ["selected identity",(b,_o)=>{b.files.find((r:any)=>r.id===overlay.adjudications[0].sourceId).objectId=b.files.find((r:any)=>r.path==="README.md").objectId;},"Reference adjudication source identity mismatch"],
    ["second source",(_b,o)=>{o.adjudications[10].sourceId=o.adjudications[0].sourceId;},"Reference adjudication row identity mismatch"],
    ["second duplicate",(_b,o)=>{o.adjudications[11].referenceIndex=5;},"Duplicate or out-of-order reference adjudication index"],
    ["second order",(_b,o)=>{[o.adjudications[10],o.adjudications[11]]=[o.adjudications[11],o.adjudications[10]];},"Duplicate or out-of-order reference adjudication index"],
    ["second index",(_b,o)=>{o.adjudications[24].referenceIndex=20;},"Duplicate or out-of-order reference adjudication index"],
    ["second raw status",(b,_o)=>{b.files.find((r:any)=>r.id===overlay.adjudications[10].sourceId).references[5].status="declared";},"Malformed ecosystem baseline"],
    ["second import binding",(b,_o)=>{b.files.find((r:any)=>r.id===overlay.adjudications[10].sourceId).references.find((r:any)=>r.kind==="import"&&r.target==="node:fs/promises").target="node:assert";},"Frozen scanner/source reference mismatch"],
    ["second call association",(_b,o)=>{o.adjudications[10].callLine++;},"Invalid reference adjudication call or span"],
    ["second span start",(_b,o)=>{o.adjudications[10].span.startLine++;},"Invalid reference adjudication call or span"],
    ["second span text",(_b,o)=>{o.adjudications[10].span.endLine--;},"Invalid reference adjudication call or span"],
    ["second span hash",(_b,o)=>{o.adjudications[10].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["second class",(_b,o)=>{o.adjudications[10].classification="generated-cache";},"Unsupported reference adjudication classification or disposition"],
    ["second disposition",(_b,o)=>{o.adjudications[10].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["second extra authority",(_b,o)=>{o.adjudications[10].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["third source",(_b,o)=>{o.adjudications[28].sourceId="ECO-SRC-0000000000000000";},"Reference adjudication row identity mismatch"],
    ["third duplicate",(_b,o)=>{o.adjudications[29].referenceIndex=0;},"Duplicate or out-of-order reference adjudication index"],
    ["third order",(_b,o)=>{[o.adjudications[28],o.adjudications[29]]=[o.adjudications[29],o.adjudications[28]];},"Duplicate or out-of-order reference adjudication index"],
    ["third index",(_b,o)=>{o.adjudications[34].referenceIndex=7;},"Duplicate or out-of-order reference adjudication index"],
    ["third raw status",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-396d124d7d28739b").references[0].status="declared";},"Malformed ecosystem baseline"],
    ["third import binding",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-396d124d7d28739b").references.find((r:any)=>r.kind==="import"&&r.target==="node:fs").target="node:crypto";},"Frozen scanner/source reference mismatch"],
    ["third call",(_b,o)=>{o.adjudications[28].callLine++;},"Invalid reference adjudication call or span"],
    ["third span start",(_b,o)=>{o.adjudications[28].span.startLine++;},"Invalid reference adjudication call or span"],
    ["third span hash",(_b,o)=>{o.adjudications[28].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["third class",(_b,o)=>{o.adjudications[28].classification="generated-cache";},"Unsupported reference adjudication classification or disposition"],
    ["third disposition",(_b,o)=>{o.adjudications[28].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["third extra field",(_b,o)=>{o.adjudications[28].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["third span extra",(_b,o)=>{o.adjudications[28].span.note="extra";},"Malformed reference adjudication authority fields"],
    ["fourth source",(_b,o)=>{o.adjudications[35].sourceId="ECO-SRC-0000000000000000";},"Reference adjudication row identity mismatch"],
    ["fourth duplicate",(_b,o)=>{o.adjudications[36].referenceIndex=0;},"Duplicate or out-of-order reference adjudication index"],
    ["fourth index",(_b,o)=>{o.adjudications[41].referenceIndex=7;},"Duplicate or out-of-order reference adjudication index"],
    ["fourth raw status",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-f186dd2c4db26151").references[0].status="declared";},"Malformed ecosystem baseline"],
    ["fourth import binding",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-f186dd2c4db26151").references.find((r:any)=>r.kind==="import"&&r.target==="node:fs").target="node:crypto";},"Frozen scanner/source reference mismatch"],
    ["fourth call",(_b,o)=>{o.adjudications[35].callLine++;},"Invalid reference adjudication call or span"],
    ["fourth span end",(_b,o)=>{o.adjudications[35].span.endLine--; },"Invalid reference adjudication call or span"],
    ["fourth span hash",(_b,o)=>{o.adjudications[35].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["fourth class",(_b,o)=>{o.adjudications[35].classification="generated-cache";},"Unsupported reference adjudication classification or disposition"],
    ["fourth disposition",(_b,o)=>{o.adjudications[35].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["fourth extra field",(_b,o)=>{o.adjudications[35].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["fourth span extra",(_b,o)=>{o.adjudications[35].span.note="extra";},"Malformed reference adjudication authority fields"],
    ["fifth source",(_b,o)=>{o.adjudications[42].sourceId="ECO-SRC-0000000000000000";},"Reference adjudication row identity mismatch"],
    ["fifth blob",(_b,o)=>{o.adjudications[42].objectId="a".repeat(40);},"Reference adjudication row identity mismatch"],
    ["fifth size",(_b,o)=>{o.adjudications[42].bytes++;},"Reference adjudication row identity mismatch"],
    ["fifth source hash",(_b,o)=>{o.adjudications[42].sha256="a".repeat(64);},"Reference adjudication row identity mismatch"],
    ["fifth baseline identity",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-b739ab592bf5a9d4").objectId="a".repeat(40);},"Reference adjudication source identity mismatch"],
    ["fifth duplicate",(_b,o)=>{o.adjudications[43].referenceIndex=0;},"Duplicate or out-of-order reference adjudication index"],
    ["fifth order",(_b,o)=>{[o.adjudications[42],o.adjudications[43]]=[o.adjudications[43],o.adjudications[42]];},"Duplicate or out-of-order reference adjudication index"],
    ["fifth index",(_b,o)=>{o.adjudications[49].referenceIndex=8;},"Duplicate or out-of-order reference adjudication index"],
    ["fifth raw reference",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-b739ab592bf5a9d4").references[0].status="declared";},"Malformed ecosystem baseline"],
    ["fifth import binding",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-b739ab592bf5a9d4").references.find((r:any)=>r.kind==="builtin"&&r.target==="node:fs").target="node:assert";},"Frozen scanner/source reference mismatch"],
    ["fifth call",(_b,o)=>{o.adjudications[42].callLine++;},"Invalid reference adjudication call or span"],
    ["fifth span",(_b,o)=>{o.adjudications[42].span.endLine--; },"Invalid reference adjudication call or span"],
    ["fifth span hash",(_b,o)=>{o.adjudications[42].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["fifth class",(_b,o)=>{o.adjudications[42].classification="source-dependency";},"Unsupported reference adjudication classification or disposition"],
    ["fifth disposition",(_b,o)=>{o.adjudications[42].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["fifth extra field",(_b,o)=>{o.adjudications[42].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["fifth span extra",(_b,o)=>{o.adjudications[42].span.note="extra";},"Malformed reference adjudication authority fields"],
  ];
  for(const [name,mutate,expected] of cases){const b=structuredClone(baseline),o=structuredClone(overlay);mutate(b,o);
    assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,b,o),exactErrorMessage(expected),name);}
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,undefined),
    exactErrorMessage("Invalid reference adjudication envelope"));
});

test("immutable source reader returns the manifest-selected committed bytes",(t:test.TestContext)=>{
  assert.equal(typeof baselineModule.readBaselineSourceBytes,"function");
  const f=fixture(t),baseline=collectBaseline(f.root,f.commit);
  const readBaselineSourceBytes=(baselineModule as any).readBaselineSourceBytes;
  const row=baseline.files.find((candidate:any)=>candidate.path==="README.md");
  writeFileSync(join(f.root,"README.md"),"# Dirty\r\n");
  writeFileSync(join(f.root,"extensions","untracked.ts"),"untracked\r\n");
  const bytes=readBaselineSourceBytes(f.root,baseline,row.id);
  assert.ok(Buffer.isBuffer(bytes));
  assert.deepEqual(bytes,Buffer.from("# Start\n"));
  assert.equal((baselineModule as any).digest(bytes),row.sha256);
});

test("immutable source reader rejects malformed baselines and unknown source IDs",(t:test.TestContext)=>{
  assert.equal(typeof baselineModule.readBaselineSourceBytes,"function");
  const readBaselineSourceBytes=(baselineModule as any).readBaselineSourceBytes;
  assert.throws(()=>readBaselineSourceBytes(join(tmpdir(),"repository-must-not-be-read"),{},"ECO-SRC-missing"),/Malformed ecosystem baseline/);
  const f=fixture(t),baseline=collectBaseline(f.root,f.commit);
  assert.throws(()=>readBaselineSourceBytes(f.root,baseline,"ECO-SRC-0000000000000000"),/Unknown baseline source ID/);
});

test("immutable source reader verifies the selected blob byte identity",(t:test.TestContext)=>{
  assert.equal(typeof baselineModule.readBaselineSourceBytes,"function");
  assert.equal(typeof baselineModule.digest,"function");
  assert.equal((baselineModule as any).digest("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const readBaselineSourceBytes=(baselineModule as any).readBaselineSourceBytes;
  const f=fixture(t),baseline=collectBaseline(f.root,f.commit),row=baseline.files.find((candidate:any)=>candidate.path==="README.md");
  const other=baseline.files.find((candidate:any)=>candidate.path==="package.json");
  for(const mutate of [
    (changed:any)=>{changed.files.find((candidate:any)=>candidate.id===row.id).objectId=other.objectId;},
    (changed:any)=>{changed.files.find((candidate:any)=>candidate.id===row.id).bytes++;},
    (changed:any)=>{changed.files.find((candidate:any)=>candidate.id===row.id).sha256="a".repeat(64);},
  ]){
    const changed=structuredClone(baseline);mutate(changed);
    assert.throws(()=>readBaselineSourceBytes(f.root,changed,row.id),/baseline source byte identity/i);
  }
});


