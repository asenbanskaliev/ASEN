import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
// @ts-expect-error Research-only JavaScript baseline collector, outside the runtime package.
import * as baselineModule from "../scripts/ecosystem-baseline.mjs";
const {collectBaseline,validateBaseline,verifyBaselineObjects,detectBaselineDrift,detectMappedBaselineDrift,sourceReferences,verifyRuntimeEdgeMappings,collectRuntimeEdgeFiles}=baselineModule;
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

test("explicit runtime file edges invalidate their owner and transitive importers",t=>{
  const f=fixture(t),before=collectBaseline(f.root,f.commit);
  writeFileSync(join(f.root,"extensions","entry.ts"),'import "../lib/core.js";\nimport {readFileSync} from "node:fs";\nexport const main=readFileSync("../docs/guide.md");\n');
  f.git("add",".");f.git("commit","-qm","runtime reader");
  const mappedBefore=collectBaseline(f.root,f.git("rev-parse","HEAD"));
  writeFileSync(join(f.root,"docs","guide.md"),'# Changed runtime input\n');f.git("add",".");f.git("commit","-qm","runtime input change");
  const after=collectBaseline(f.root,f.git("rev-parse","HEAD"));
  const report=detectBaselineDrift(mappedBefore,after,{runtimeEdges:[{sourcePath:"extensions/entry.ts",targetPaths:["docs/guide.md"]}]});
  assert.ok(report.invalidatedPaths.includes("extensions/entry.ts"));
  assert.ok(report.invalidatedPaths.includes("lib/core.ts"));
  assert.deepEqual(detectBaselineDrift(before,before,{runtimeEdges:[{sourcePath:"extensions/entry.ts",targetPaths:["docs/guide.md"]}]}),
    detectBaselineDrift(before,before));
});

test("empty mapped runtime sets are valid and never auto-adopt changes",t=>{
  const f=fixture(t),before=collectBaseline(f.root,f.commit);
  const empty=detectBaselineDrift(before,before,{runtimeEdges:[{sourcePath:"extensions/entry.ts",targetPaths:[]}]});
  assert.deepEqual(empty.changes,[]);
  assert.deepEqual(empty.invalidatedPaths,[]);
  assert.equal(empty.autoAdopt,false);
  assert.throws(()=>detectBaselineDrift(before,before,{runtimeEdges:[{sourcePath:"extensions/entry.ts",targetPaths:["../outside"]}]}),/Malformed runtime edge mapping/);
  assert.throws(()=>detectBaselineDrift(before,before,{runtimeEdges:[{sourcePath:"extensions/entry.ts",targetPaths:"docs/guide.md" as any}]}),/Malformed runtime edge mapping/);
});

test("mapped rename reports invalidate old and new paths and reject unsafe destinations",t=>{
  const f=fixture(t),baseline=collectBaseline(f.root,f.commit);
  const runtimeEdges=[{sourcePath:"extensions/entry.ts",targetPaths:["docs/guide.md"]}];
  const report=detectBaselineDrift(baseline,baseline,{runtimeEdges,additionalChanges:[{kind:"RENAMED",path:"docs/guide.md",to:"docs/moved.md"}]});
  assert.deepEqual(report.changes,[{kind:"RENAMED",path:"docs/guide.md",to:"docs/moved.md"}]);
  assert.equal(report.autoAdopt,false);
  for(const path of ["docs/guide.md","docs/moved.md","extensions/entry.ts","lib/core.ts"])
    assert.ok(report.invalidatedPaths.includes(path),path);
  for(const invalid of [
    {kind:"RENAMED",path:"docs/guide.md",to:"../escape"},
    {kind:"RENAMED",path:"docs/guide.md"},
    {kind:"ADDED",path:"docs/guide.md",to:"docs/moved.md"},
    {kind:"IGNORED",path:"docs/guide.md"},
  ])assert.throws(()=>detectBaselineDrift(baseline,baseline,{additionalChanges:[invalid]}),/Malformed runtime edge drift changes/);
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

test("164-reference overlay adjudicates every frozen unresolved reference without mutating scanner evidence",
  {skip:!retainedBaselineRepository},()=>{
  assert.equal(typeof baselineModule.verifyReferenceAdjudications,"function");
  const baseline=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  assert.equal(verifyBaselineObjects(retainedBaselineRepository,baseline),true);
  const overlay=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-reference-adjudications-v1.json",import.meta.url),"utf8"));
  const edgeMappings=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-runtime-edge-mappings-v1.json",import.meta.url),"utf8"));
  assert.deepEqual(verifyRuntimeEdgeMappings(retainedBaselineRepository,baseline,overlay,edgeMappings),{mapped:25,tracked:3,codeContracts:12,externalRuntime:10});
  const agentFiles=collectRuntimeEdgeFiles(retainedBaselineRepository,baseline.commit,"assets/agents/*.md");
  assert.equal(agentFiles.length,10);assert.ok(agentFiles.every((row:any)=>row.path.startsWith("assets/agents/")&&row.path.endsWith(".md")));
  const brokenMappings=structuredClone(edgeMappings);brokenMappings.mappings[5].span.sha256="0".repeat(64);
  assert.throws(()=>verifyRuntimeEdgeMappings(retainedBaselineRepository,baseline,overlay,brokenMappings),/source identity mismatch/);
  for(const mutate of [
    (value:any)=>{value.mappings.pop();},
    (value:any)=>{value.mappings.find((row:any)=>row.mappingKind==="tracked-file").targets[0]="README.md";},
    (value:any)=>{const row=value.mappings.find((row:any)=>row.mappingKind==="tracked-glob");row.mappingKind="code-contract";row.mappingReason="self-owned-registration";row.targets=[row.sourceId];},
    (value:any)=>{const row=value.mappings.find((row:any)=>row.mappingKind==="code-contract");row.mappingKind="external-runtime";row.mappingReason="installed-package-discovery";row.targets=[];},
    (value:any)=>{value.mappings[0].mappingReason="some-other-nonempty-reason";},
    (value:any)=>{value.mappings.find((row:any)=>row.mappingKind==="external-runtime").targets.push("README.md");},
    (value:any)=>{value.mappings[0].unexpected=true;},
  ]){const changed=structuredClone(edgeMappings);mutate(changed);assert.throws(()=>verifyRuntimeEdgeMappings(retainedBaselineRepository,baseline,overlay,changed));}
  const baselineBefore=structuredClone(baseline);
  const referencesBefore=structuredClone(baseline.files.map((row:any)=>row.references));
  assert.deepEqual((baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,overlay),
    {scannerUnresolved:164,adjudicated:164,remaining:0});
  assert.deepEqual(baseline,baselineBefore);
  assert.deepEqual(baseline.files.map((row:any)=>row.references),referencesBefore);
  assert.equal(overlay.adjudications.filter((row:any)=>row.classification==="source-runtime-edge").length,25);
  assert.equal(overlay.adjudications.filter((row:any)=>row.classification==="external-manual-command-reference").length,14);
  assert.equal(overlay.adjudications.filter((row:any)=>row.classification==="scanner-version-token").length,13);
  const withAbsent=structuredClone(baseline);
  withAbsent.files.find((row:any)=>row.id==="ECO-SRC-5a67352cd4badb81").references.push({
    kind:"asset",target:"./adjudication-count-probe",status:"absent",path:"extensions/adjudication-count-probe",
  });
  assert.deepEqual(validateBaseline(withAbsent),[]);
  assert.deepEqual((baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,withAbsent,overlay),
    {scannerUnresolved:165,adjudicated:164,remaining:1});
});

test("asset overlay rejects identity, ordering, binding, span and authority mutations",
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
    ["second import binding",(b,_o)=>{b.files.find((r:any)=>r.id===overlay.adjudications[10].sourceId).references.find((r:any)=>r.kind==="import"&&r.status==="builtin"&&r.target==="node:fs/promises").target="node:assert";},"Frozen scanner/source reference mismatch"],
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
    ["fifth import binding",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-b739ab592bf5a9d4").references.find((r:any)=>r.kind==="import"&&r.status==="builtin"&&r.target==="node:fs").target="node:assert";},"Frozen scanner/source reference mismatch"],
    ["fifth call",(_b,o)=>{o.adjudications[42].callLine++;},"Invalid reference adjudication call or span"],
    ["fifth span",(_b,o)=>{o.adjudications[42].span.endLine--; },"Invalid reference adjudication call or span"],
    ["fifth span hash",(_b,o)=>{o.adjudications[42].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["fifth class",(_b,o)=>{o.adjudications[42].classification="source-dependency";},"Unsupported reference adjudication classification or disposition"],
    ["fifth disposition",(_b,o)=>{o.adjudications[42].disposition="ignore";},"Unsupported reference adjudication classification or disposition"],
    ["fifth extra field",(_b,o)=>{o.adjudications[42].rationale="trust me";},"Malformed reference adjudication authority fields"],
    ["fifth span extra",(_b,o)=>{o.adjudications[42].span.note="extra";},"Malformed reference adjudication authority fields"],
    ["sixth source",(_b,o)=>{o.adjudications[50].sourceId="ECO-SRC-0000000000000000";},"Reference adjudication row identity mismatch"],
    ["sixth call",(_b,o)=>{o.adjudications[50].callLine++;},"Invalid reference adjudication call or span"],
    ["sixth span hash",(_b,o)=>{o.adjudications[50].span.sha256="a".repeat(64);},"Frozen readFile call/span binding mismatch"],
    ["seventh raw status",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-6c28d7b99a511610").references[0].status="declared";},"Malformed ecosystem baseline"],
    ["eighth namespace import binding",(b,_o)=>{b.files.find((r:any)=>r.id==="ECO-SRC-1d4036c43d653569").references.find((r:any)=>r.kind==="import"&&r.target==="node:fs").target="node:path";},"Frozen scanner/source reference mismatch"],
    ["eighth span",(_b,o)=>{o.adjudications[61].span.endLine--;},"Invalid reference adjudication call or span"],
  ];
  for(const [name,mutate,expected] of cases){const b=structuredClone(baseline),o=structuredClone(overlay);mutate(b,o);
    assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,b,o),exactErrorMessage(expected),name);}
  const urlOverlay=structuredClone(overlay);
  const urlRow=urlOverlay.adjudications.find((row:any)=>row.sourceId==="ECO-SRC-f4f6b335bf2cf4e9");
  assert.ok(urlRow);
  urlRow.span.sha256="a".repeat(64);
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,urlOverlay),
    exactErrorMessage("Frozen readFile call/span binding mismatch"),"dynamic URL span");
  const documentationOverlay=structuredClone(overlay);
  const documentationRow=documentationOverlay.adjudications.find((row:any)=>row.sourceId==="ECO-SRC-fe4cbd3c4b0d4552");
  assert.ok(documentationRow);
  documentationRow.span.sha256="a".repeat(64);
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,documentationOverlay),
    exactErrorMessage("Frozen semantic-reference call/span binding mismatch"),"documentation command span");
  const documentationCallOverlay=structuredClone(overlay);
  const documentationCall=documentationCallOverlay.adjudications.find((row:any)=>row.sourceId==="ECO-SRC-fe4cbd3c4b0d4552");
  assert.ok(documentationCall);
  documentationCall.callLine++;
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,documentationCallOverlay),
    exactErrorMessage("Invalid reference adjudication call or span"),"documentation command call line");
  const eventCallOverlay=structuredClone(overlay);
  const eventCall=eventCallOverlay.adjudications.find((row:any)=>row.classification==="host-process-event");
  assert.ok(eventCall);
  eventCall.callLine++;
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,eventCallOverlay),
    exactErrorMessage("Invalid reference adjudication call or span"),"host event call line");
  const outsideRootOverlay=structuredClone(overlay);
  const outsideRootRow=outsideRootOverlay.adjudications.find((row:any)=>row.sourceId==="ECO-SRC-6058ca4d664d9095"&&row.referenceIndex===0);
  assert.ok(outsideRootRow);
  outsideRootRow.span.sha256="a".repeat(64);
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,outsideRootOverlay),
    exactErrorMessage("Frozen semantic-reference call/span binding mismatch"),"outside-root directory span");
  assert.throws(()=>(baselineModule as any).verifyReferenceAdjudications(retainedBaselineRepository,baseline,undefined),
    exactErrorMessage("Invalid reference adjudication envelope"));
});

test("mapped Markdown runtime directory reports additions, removals and content changes without adoption",{skip:!retainedBaselineRepository},t=>{
  const repo=mkdtempSync(join(tmpdir(),"asen-runtime-edge-source-"));t.after(()=>rmSync(repo,{recursive:true,force:true}));
  execFileSync("git",["init","-q",repo]);execFileSync("git",["-C",repo,"fetch","-q","--update-shallow",retainedBaselineRepository,"08de420ca29be16b6f6bee725a30b599b061df16"]);
  execFileSync("git",["-C",repo,"checkout","-q","--detach","FETCH_HEAD"]);
  execFileSync("git",["-C",repo,"config","user.name","Fixture"]);execFileSync("git",["-C",repo,"config","user.email","fixture@example.test"]);
  const before=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-sources-v1.json",import.meta.url),"utf8"));
  const overlay=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-reference-adjudications-v1.json",import.meta.url),"utf8"));
  const mappings=JSON.parse(readFileSync(new URL("../registry/parity/ecosystem-runtime-edge-mappings-v1.json",import.meta.url),"utf8"));
  const selectedFiles=collectRuntimeEdgeFiles(repo,before.commit,"assets/agents/*.md"),selected=selectedFiles[0].path,removed=selectedFiles[1].path,assetDirectory=selected.slice(0,selected.lastIndexOf("/"));
  const trackedFile=mappings.mappings.find((row:any)=>row.mappingKind==="tracked-file"),trackedOwner=before.files.find((row:any)=>row.id===trackedFile.sourceId);
  const codeContract=mappings.mappings.find((row:any)=>row.mappingKind==="code-contract"&&row.sourceId==="ECO-SRC-af1edc66cbd9834c"),contractOwner=before.files.find((row:any)=>row.id===codeContract.sourceId);
  const contractImporters=before.files.filter((row:any)=>row.references.some((reference:any)=>reference.status==="tracked"&&reference.path===contractOwner.path));
  assert.ok(contractImporters.length>0,"the mapped agent contract owner has tracked importers");
  writeFileSync(join(repo,selected),"# changed input\n");
  rmSync(join(repo,removed));
  writeFileSync(join(repo,assetDirectory,"new-worker.md"),"# added input\n");
  writeFileSync(join(repo,trackedFile.targets[0]),JSON.stringify({changed:true})+"\n");
  writeFileSync(join(repo,contractOwner.path),readFileSync(join(repo,contractOwner.path),"utf8")+"\n// contract invalidation fixture\n");
  execFileSync("git",["-C",repo,"add","-A"]);execFileSync("git",["-C",repo,"commit","-qm","change mapped runtime asset set"]);
  const after=collectBaseline(repo,execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim());
  const report=detectMappedBaselineDrift(repo,before,after,overlay,mappings);
  assert.equal(report.autoAdopt,false);
  assert.ok(report.changes.some((row:any)=>row.kind==="CONTENT_CHANGED"&&row.path===selected));
  assert.ok(report.changes.some((row:any)=>row.kind==="REMOVED"&&row.path===removed));
  assert.ok(report.changes.some((row:any)=>row.kind==="ADDED"&&row.path===`${assetDirectory}/new-worker.md`));
  assert.ok(report.invalidatedPaths.includes("lib/runtime-metrics-children.ts"));
  assert.ok(report.invalidatedPaths.includes(trackedOwner.path),"tracked-file target invalidates its exact owner");
  assert.ok(report.invalidatedPaths.includes(contractOwner.path),"code-contract owner change remains invalidated");
  for(const importer of contractImporters)assert.ok(report.invalidatedPaths.includes(importer.path),`code-contract change invalidates importer ${importer.path}`);
  const globOwners=[...new Set(mappings.mappings.filter((row:any)=>row.mappingKind==="tracked-glob").map((row:any)=>before.files.find((file:any)=>file.id===row.sourceId).path))];
  for(const path of [selected,removed,`${assetDirectory}/new-worker.md`])
    assert.equal(report.changes.filter((row:any)=>row.path===path).length,1,`duplicate glob change: ${path}`);
  for(const owner of globOwners)assert.ok(report.invalidatedPaths.includes(owner),`mapped glob owner: ${owner}`);

  // A mode-only change must be visible even when the committed blob bytes are identical.
  const modeBefore=collectRuntimeEdgeFiles(repo,after.commit,"assets/agents/*.md").find((file:any)=>file.path===selected);
  assert.ok(modeBefore);
  execFileSync("git",["-C",repo,"update-index","--chmod="+(modeBefore.mode==="100644"?"+x":"-x"),selected]);
  execFileSync("git",["-C",repo,"commit","-qm","change runtime agent executable bit only"]);
  const modeCommit=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const modeAfter=collectRuntimeEdgeFiles(repo,modeCommit,"assets/agents/*.md").find((file:any)=>file.path===selected);
  assert.equal(modeAfter.sha256,modeBefore.sha256);
  assert.notEqual(modeAfter.mode,modeBefore.mode);
  const modeReport=detectMappedBaselineDrift(repo,after,collectBaseline(repo,modeCommit),overlay,mappings);
  assert.ok(modeReport.changes.some((row:any)=>row.kind==="PERMISSIONS_CHANGED"&&row.path===selected&&row.fromMode!==row.toMode));
  assert.equal(modeReport.changes.some((row:any)=>row.kind==="CONTENT_CHANGED"&&row.path===selected),false,"mode-only drift is not mislabeled as content drift");
  assert.equal(modeReport.autoAdopt,false);
  for(const owner of globOwners)assert.ok(modeReport.invalidatedPaths.includes(owner));

  // A relocation with identical bytes but different Git modes must remain ADDED + REMOVED.
  const modeRenameSource=selectedFiles.find((file:any)=>file.path!==selected&&file.path!==removed);
  assert.ok(modeRenameSource);
  const movedWithModePath=`${assetDirectory}/mode-moved-agent.md`;
  execFileSync("git",["-C",repo,"mv",modeRenameSource.path,movedWithModePath]);
  execFileSync("git",["-C",repo,"update-index","--chmod="+(modeRenameSource.mode==="100644"?"+x":"-x"),movedWithModePath]);
  execFileSync("git",["-C",repo,"commit","-qm","relocate runtime input with changed Git mode"]);
  const modeRenameCommit=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const movedWithMode=collectRuntimeEdgeFiles(repo,modeRenameCommit,"assets/agents/*.md").find((file:any)=>file.path===movedWithModePath);
  assert.equal(movedWithMode.sha256,modeRenameSource.sha256);
  assert.notEqual(movedWithMode.mode,modeRenameSource.mode);
  const modeRenameReport=detectMappedBaselineDrift(repo,after,collectBaseline(repo,modeRenameCommit),overlay,mappings);
  assert.ok(modeRenameReport.changes.some((row:any)=>row.kind==="REMOVED"&&row.path===modeRenameSource.path));
  assert.ok(modeRenameReport.changes.some((row:any)=>row.kind==="ADDED"&&row.path===movedWithModePath));
  assert.ok(!modeRenameReport.changes.some((row:any)=>row.kind==="RENAMED"&&row.path===modeRenameSource.path));
  assert.equal(modeRenameReport.autoAdopt,false);
  for(const owner of globOwners)assert.ok(modeRenameReport.invalidatedPaths.includes(owner));
  execFileSync("git",["-C",repo,"mv",movedWithModePath,modeRenameSource.path]);
  execFileSync("git",["-C",repo,"update-index","--chmod="+(modeRenameSource.mode==="100644"?"-x":"+x"),modeRenameSource.path]);
  execFileSync("git",["-C",repo,"commit","-qm","restore runtime fixture for subsequent rename checks"]);

  const unique=selectedFiles.find((file:any)=>file.path!==selected&&file.path!==removed&&selectedFiles.filter((candidate:any)=>candidate.sha256===file.sha256).length===1);
  assert.ok(unique,"a unique frozen agent byte identity is required for rename classification");
  const renamedPath=`${assetDirectory}/renamed-source.md`;
  execFileSync("git",["-C",repo,"mv",unique.path,renamedPath]);
  execFileSync("git",["-C",repo,"commit","-qm","rename mapped runtime input"]);
  const renamedCommit=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const renamedBaseline=collectBaseline(repo,renamedCommit);
  const renameReport=detectMappedBaselineDrift(repo,before,renamedBaseline,overlay,mappings);
  assert.ok(renameReport.changes.some((row:any)=>row.kind==="RENAMED"&&row.path===unique.path&&row.to===renamedPath));
  assert.equal(renameReport.changes.filter((row:any)=>row.path===unique.path).length,1);
  for(const owner of globOwners)assert.ok(renameReport.invalidatedPaths.includes(owner));

  const duplicateBytes=readFileSync(join(repo,renamedPath));
  for(const file of collectRuntimeEdgeFiles(repo,renamedCommit,"assets/agents/*.md"))rmSync(join(repo,file.path));
  execFileSync("git",["-C",repo,"add","-A"]);execFileSync("git",["-C",repo,"commit","-qm","remove all mapped runtime inputs"]);
  const emptyCommit=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const emptyBaseline=collectBaseline(repo,emptyCommit);
  const emptyReport=detectMappedBaselineDrift(repo,before,emptyBaseline,overlay,mappings);
  assert.equal(emptyReport.changes.filter((row:any)=>row.kind==="REMOVED"&&row.path.startsWith(`${assetDirectory}/`)).length,selectedFiles.length);
  assert.equal(emptyReport.changes.filter((row:any)=>row.kind==="RENAMED"&&row.path.startsWith(`${assetDirectory}/`)).length,0);
  assert.equal(emptyReport.autoAdopt,false);
  for(const owner of globOwners)assert.ok(emptyReport.invalidatedPaths.includes(owner));

  for(const name of ["duplicate-a.md","duplicate-b.md"])writeFileSync(join(repo,assetDirectory,name),duplicateBytes);
  execFileSync("git",["-C",repo,"add","-A"]);execFileSync("git",["-C",repo,"commit","-qm","replace with ambiguous mapped inputs"]);
  const replacedCommit=execFileSync("git",["-C",repo,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  const replacedBaseline=collectBaseline(repo,replacedCommit);
  const replacedReport=detectMappedBaselineDrift(repo,before,replacedBaseline,overlay,mappings);
  assert.ok(!replacedReport.changes.some((row:any)=>row.kind==="RENAMED"&&row.path===unique.path),"ambiguous duplicate bytes cannot claim a rename");
  for(const name of ["duplicate-a.md","duplicate-b.md"])
    assert.equal(replacedReport.changes.filter((row:any)=>row.kind==="ADDED"&&row.path===`${assetDirectory}/${name}`).length,1);
  assert.equal(replacedReport.changes.filter((row:any)=>row.kind==="REMOVED"&&row.path===unique.path).length,1);
  assert.equal(replacedReport.autoAdopt,false);
  for(const owner of globOwners)assert.ok(replacedReport.invalidatedPaths.includes(owner));
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
