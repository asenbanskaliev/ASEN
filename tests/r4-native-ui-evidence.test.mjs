import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildAgentABCaseReadiness} from "../scripts/agent-ab-case-readiness.mjs";
import {buildR4RequirementInventory} from "../scripts/r4-requirement-inventory.mjs";
import {R4_PLATFORMS,R4_UI_WIDTHS,checkR4NativeUiReceipt,
 assembleR4NativeUiEvidence,loadR4NativeUiReceipts} from "../scripts/r4-native-ui-evidence.mjs";

const sha="a".repeat(40);
const phases=["agents/empty:empty-view","error-path:bounded",
 "restart:re-rendered","shutdown:clean-exit"];
function receipt(platform,overrides={}){
 const base={schemaVersion:1,candidate:sha,host:"@earendil-works/pi-coding-agent",
  version:"1.2.0",platform,mode:"tui-matrix",color:"disabled",
  widths:[...R4_UI_WIDTHS],result:"PASS",wrapped:[],
  results:R4_UI_WIDTHS.map(width=>({width,phases:[...phases],
   wrapped:[],renderProvenance:"PTY_BUFFER_ROWS",rendered:["profile: default","agents: 0 running","Git test status"]}))};
 return {...base,...overrides};
}
const all=()=>Object.fromEntries(R4_PLATFORMS.map(platform=>[platform,receipt(platform)]));
async function fixture(){
 const [fs,path,url]=await Promise.all([import("node:fs"),import("node:path"),import("node:url")]);
 const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),"..");
 const efMarkdown=fs.readFileSync(path.join(root,"odd/tasks/equivalencia-funcional-agentes-full.md"),"utf8");
 const uiMarkdown=fs.readFileSync(path.join(root,"odd/tasks/"+"gen"+"tle-shell-v4.6.0-paridad-ui-odd.md"),"utf8");
 return buildR4RequirementInventory({efMarkdown,uiMarkdown});
}
async function accepted(receipts=all(),overrides={}){
 return assembleR4NativeUiEvidence({candidateSha:sha,runId:"1234",runAttempt:"1",
  receipts,inventory:await fixture(),readiness:buildAgentABCaseReadiness({candidateSha:sha}),...overrides});
}
test("R4-04 records three real host platform witnesses without a single UI or A/B FULL claim",async()=>{
 const report=await accepted();
 assert.equal(report.nativeTechnicalCells,21);
 assert.equal(report.hostObservations.length,3);
 assert.equal(report.status,"PARTIAL_NATIVE_HOST_OBSERVED");
 assert.equal(report.uiCasesVerified,0);
 assert.equal(report.referenceUiCasesExecuted,0);
 assert.equal(report.ab.executedAuthenticCases,0);
 assert.equal(report.ab.sourceSlots,60);
 assert.equal(report.uiCases.length,24);
 assert.ok(report.uiCases.every(row=>row.status==="BLOCKED_REFERENCE_UI_PARITY"));
 assert.equal(report.independentReviewPerformed,false);
 assert.equal(report.writerHumanConsent,false);
 assert.equal(report.globalFull,false);
 assert.deepEqual(report.uiCases.find(row=>row.id==="UI-C01")?.nativeWidthWitnesses,[160]);
 assert.deepEqual(report.uiCases.find(row=>row.id==="UI-C22")?.nativeWidthWitnesses,[40,60]);
});
test("R4-04 rejects missing platform, duplicate alias or additional receipt provenance",async()=>{
 for(const malformed of [
  Object.fromEntries(R4_PLATFORMS.slice(0,2).map(p=>[p,receipt(p)])),
  {...all(),freebsd:receipt("linux")},
 ])await assert.rejects(async()=>accepted(malformed),/Exactly three/u);
});
test("R4-04 rejects stale SHA, false Pi version, synthetic mode and widened success flags",()=>{
 for(const patch of [{candidate:"b".repeat(40)},{version:"1.5.0"},{mode:"simulated"},
  {result:"FAIL"},{platform:"darwin"},{host:"stand-in"}]){
  assert.throws(()=>checkR4NativeUiReceipt(receipt("linux",patch),
   {candidateSha:sha,platform:"linux"}));
 }
});
test("R4-04 rejects omitted, reordered, duplicate and invented terminal widths",()=>{
 for(const bad of [[80,120,60,40,139,140,160],[120,80,60,40,139,140],
  [120,80,60,40,139,140,140],[120,80,60,40,139,140,999]]){
  assert.throws(()=>checkR4NativeUiReceipt(receipt("linux",{widths:bad}),
   {candidateSha:sha,platform:"linux"}),/widths/u);
 }
});
test("R4-04 refuses fabricated host phases, hidden wrapping and absent rendered rows",()=>{
 const baseline=receipt("linux");
 for(const patch of [
  {results:baseline.results.map((x,i)=>i===0?{...x,phases:["shutdown:clean-exit"]}:x)},
  {results:baseline.results.map((x,i)=>i===0?{...x,rendered:[]}:x)},
  {results:baseline.results.map((x,i)=>i===0?{...x,wrapped:[{reason:"render-broken"}]}:x)},
  {wrapped:[{reason:"host-wrap"}]},
  {results:baseline.results.map((x,i)=>i===0?{...x,renderProvenance:"SIMULATED"}:x)},
  {results:baseline.results.map((x,i)=>i===0?{...x,rendered:["synthetic"]}:x)},
 ])assert.throws(()=>checkR4NativeUiReceipt(receipt("linux",patch),
  {candidateSha:sha,platform:"linux"}));
});
test("R4-04 never treats a supplied ready/FULL label as legitimate acceptance",async()=>{
 const r=all();
 r.linux={...r.linux,globalFull:true};
 const x=await accepted(r);
 assert.equal(x.globalFull,false);
 assert.equal(x.uiCasesVerified,0);
});
test("R4-04 refuses fabricated foreign candidate, run identity and A/B attestation",async()=>{
 for(const bad of [{candidateSha:"b".repeat(40)},{runId:"0"},{runAttempt:"0"},
  {readiness:{...buildAgentABCaseReadiness({candidateSha:sha}),evidenceCaptured:20}},
 ])await assert.rejects(async()=>accepted(all(),bad));
});
test("R4-04 reads bounded physical receipt files and rejects symlink/oversize",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-r4-ui-fixture-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 for(const platform of R4_PLATFORMS)
  await writeFile(join(root,`t10-real-pi-tui-matrix-${platform}.json`),
   JSON.stringify(receipt(platform)));
 const loaded=await loadR4NativeUiReceipts(root);
 assert.deepEqual(Object.keys(loaded).sort(),[...R4_PLATFORMS].sort());
 const target=join(root,"t10-real-pi-tui-matrix-linux.json");
 await writeFile(target,"x".repeat(512*1024+1));
 await assert.rejects(()=>loadR4NativeUiReceipts(root),/aliased or oversized/u);
});
test("R4-04 rejects an aliased receipt path",{
 skip:process.platform==="win32"?"Windows symlinks require separate privileges":false,
},async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-r4-ui-alias-"));
 t.after(()=>rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:100}));
 for(const platform of R4_PLATFORMS)
  await writeFile(join(root,`t10-real-pi-tui-matrix-${platform}.json`),
   JSON.stringify(receipt(platform)));
 const target=join(root,"t10-real-pi-tui-matrix-linux.json"),actual=join(root,"alias.json");
 await writeFile(actual,await readFile(target));await rm(target);await symlink(actual,target);
 await assert.rejects(()=>loadR4NativeUiReceipts(root),/aliased or oversized/u);
});
