/** R4-04: admit real native Pi TUI geometry receipts from one CI run.
 * This does NOT prove comparison with the external UI, C01-C20, model calls,
 * human Writer consent or independent review. The final verdict stays PARTIAL.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {lstat,realpath,readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {buildShellAsenReadiness} from "./shell-asen-parity.mjs";
import {buildR4RequirementInventory} from "./r4-requirement-inventory.mjs";

export const R4_UI_WIDTHS=Object.freeze([120,80,60,40,139,140,160]);
export const R4_PLATFORMS=Object.freeze(["linux","win32","darwin"]);
const SHA=/^[a-f0-9]{40}$/u;
const phases=["agents/empty:empty-view","error-path:bounded","restart:re-rendered","shutdown:clean-exit"];
const maxBytes=512*1024;
const unique=(items)=>items.length===new Set(items).size;
const expectedHost="@earendil-works/pi-coding-agent";

export function checkR4NativeUiReceipt(receipt,{candidateSha,platform}){
 assert.match(candidateSha??"",SHA,"Exact candidate SHA required");
 assert.ok(R4_PLATFORMS.includes(platform),"Unknown real host platform");
 assert.ok(receipt&&typeof receipt==="object"&&!Array.isArray(receipt),"Native receipt required");
 assert.equal(receipt.schemaVersion,1,"Unknown native TUI receipt schema");
 assert.equal(receipt.candidate,candidateSha,"Foreign SHA native TUI receipt");
 assert.equal(receipt.platform,platform,"Native TUI runner platform mismatch");
 assert.equal(receipt.host,expectedHost,"Unexpected Pi host identity");
 assert.equal(receipt.version,"1.2.0","Native Pi version must match executed contract");
 assert.equal(receipt.mode,"tui-matrix","Not a native TUI observation");
 assert.equal(receipt.color,"disabled","Native UI comparison requires normalized colour");
 assert.equal(receipt.result,"PASS","Native TUI host reported failure");
 assert.deepEqual(receipt.widths,R4_UI_WIDTHS,"Native TUI widths were not exercised exactly once");
 assert.ok(Array.isArray(receipt.wrapped)&&receipt.wrapped.length===0,
  "Native host reported wrapped or broken lines");
 assert.ok(Array.isArray(receipt.results)&&receipt.results.length===R4_UI_WIDTHS.length,
  "Native TUI results missing a width");
 const observations=receipt.results.map((result,index)=>{
  assert.equal(result.width,R4_UI_WIDTHS[index],"Native width and result index mismatch");
  assert.ok(Array.isArray(result.phases)&&result.phases.length<=32&&
   result.phases.every(x=>typeof x==="string"&&x.length<=140),
   "Native host phase evidence is malformed or oversized");
  assert.ok(Array.isArray(result.wrapped)&&result.wrapped.length===0,
   "A native UI row failed the host rendering boundary");
  assert.ok(["PTY_BUFFER_ROWS","PTY_COMMAND_RESPONSE_MARKERS"].includes(result.renderProvenance),
   "Native TUI rows must identify their actual PTY capture source");
  const renderedCount=Array.isArray(result.rendered)?result.rendered.length:-1;
  const longestRenderedLine=Array.isArray(result.rendered)?
   Math.max(0,...result.rendered.map(x=>typeof x==="string"?x.length:0)):-1;
  assert.ok(Array.isArray(result.rendered)&&result.rendered.length>0&&
   result.rendered.length<=300&&result.rendered.every(x=>typeof x==="string"&&x.length<=1024),
   "Actual terminal-rendered rows must be captured and bounded ("+
   platform+", "+result.width+" cols, rows="+renderedCount+
   ", maxLineChars="+longestRenderedLine+")");
  assert.ok(result.rendered.some(x=>/profile:|Session-attributed changes:|Git /u.test(x)),
   "Native TUI response must retain a real status or Git marker");
  assert.ok(phases.every(x=>result.phases.includes(x)),
   "Missing real Pi session, error, restart or shutdown phase");
  return Object.freeze({platform,width:result.width,hostVersion:receipt.version,
   observedPhases:phases,renderedLineCount:result.rendered.length,
   parityVerdict:"NOT_COMPARED_TO_REFERENCE"});
 });
 assert.ok(unique(observations.map(x=>x.width)),"Duplicate native terminal width");
 return observations;
}

/** Three real host receipts qualify as execution evidence for geometry primitives
 * only. No caller can supply an accepted UI parity conclusion.
 */
export function assembleR4NativeUiEvidence({candidateSha,runId,runAttempt,receipts,inventory,readiness}){
 assert.match(candidateSha??"",SHA,"Exact ASEN candidate required");
 assert.match(String(runId??""),/^[1-9][0-9]*$/u,"Same-run ID missing");
 assert.match(String(runAttempt??""),/^[1-9][0-9]*$/u,"Same-run attempt missing");
 assert.ok(inventory?.schema==="asen-r4-requirement-inventory/v1","Canonical ODD inventory required");
 assert.ok(readiness?.schema==="asen-shell-asen-readiness/v1"&&
   readiness.candidateSha===candidateSha&&readiness.casesPrepared===20&&
   readiness.sourceSlotsRequired===40&&readiness.evidenceCaptured===0&&
   readiness.casesBlocked===20&&readiness.sources.join(",")==="SHELL,ASEN",
   "Two-Pi parity claims cannot be inferred from legacy three-way evidence");
 assert.deepEqual(Object.keys(receipts??{}).sort(),[...R4_PLATFORMS].sort(),
  "Exactly three same-run native platform receipts are required");
 const observed=R4_PLATFORMS.flatMap(platform=>
  checkR4NativeUiReceipt(receipts[platform],{candidateSha,platform}));
 const context=R4_PLATFORMS.map(platform=>({platform,widths:[...R4_UI_WIDTHS],status:"NATIVE_PI_TUI_OBSERVED"}));
 const sampled=Object.freeze({
  "UI-C01":[160],"UI-C02":[139,140],"UI-C09":[80,120],
  "UI-C15":[80,120,139,140,160],"UI-C22":[40,60],
 });
 const uiCases=inventory.uiCases.map(row=>Object.freeze({
  id:row.id,owners:row.owners,finalGate:row.finalGate,
  status:"BLOCKED_REFERENCE_UI_PARITY",
  nativeWidthWitnesses:sampled[row.id]??[],
  limitation:Object.hasOwn(sampled,row.id) ?
   "Real ASEN host executed widths/commands, but the source UI behaviour and required interactions remain unverified" :
   "No authentic external UI/native interaction comparison captured for this case",
 }));
 assert.equal(uiCases.length,24);
 return Object.freeze({
  schema:"asen-r4-native-ui-observations/v1",
  candidateSha,provenance:{source:"GITHUB_ACTIONS_SAME_RUN_ARTIFACTS",
   runId:String(runId),runAttempt:String(runAttempt),host:expectedHost,pinnedPiVersion:"1.2.0"},
  status:"PARTIAL_NATIVE_HOST_OBSERVED",nativeTechnicalCells:observed.length,
  hostObservations:context,uiCases,
  comparison:{status:"BLOCKED_TWO_PI_RUNTIME_EXECUTIONS_MISSING",
   sources:["SHELL","ASEN"],cases:20,sourceSlots:40,
   referenceVersion:readiness.referenceVersion,referenceSha:readiness.referenceSha,
   executedAuthenticCases:0},
  uiCasesVerified:0,referenceUiCasesExecuted:0,
  writerHumanConsent:false,independentReviewPerformed:false,globalFull:false,
  disclaimer:"These are real ASEN Pi host observations, not proof of reference UI parity. No C01-C20, UI-C01-C24 or FULL promotion is authorized.",
 });
}

/** Bounded filesystem inspection protects against filename substitution/aliases.
 * An Actions artifact name is a locator, not independent host attestation.
 */
export async function loadR4NativeUiReceipts(directory){
 const root=resolve(directory),st=await lstat(root);
 assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&await realpath(root)===root,
  "Native UI artifact root must be physically canonical");
 const receipts={};
 for(const platform of R4_PLATFORMS){
  const file=join(root,`t10-real-pi-tui-matrix-${platform}.json`);
  const stat=await lstat(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maxBytes&&
   await realpath(file)===file,"Native UI receipt cannot be absent, aliased or oversized");
  receipts[platform]=JSON.parse(await readFile(file,"utf8"));
 }
 return receipts;
}
async function main(){
 const env=process.env;
 assert.equal(env.GITHUB_ACTIONS,"true","Only GitHub Actions may issue native UI evidence");
 assert.equal(env.GITHUB_EVENT_NAME,"pull_request","Native UI evidence is PR-scoped");
 assert.equal(env.GITHUB_REPOSITORY,"asenbanskaliev/ASEN","Wrong repository");
 assert.equal(env.GITHUB_HEAD_REF,"feat/t12-integrated-acceptance-merge","Wrong PR branch");
 const sha=env.ASEN_EXPECTED_SHA;
 assert.match(sha??"",SHA);
 const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",timeout:5000}).trim();
 assert.equal(head,sha,"Native UI observations must match checkout HEAD");
 const efMarkdown=await readFile("odd/tasks/equivalencia-funcional-agentes-full.md","utf8");
 const uiMarkdown=await readFile("odd/tasks/"+"gen"+"tle-shell-v4.6.0-paridad-ui-odd.md","utf8");
 const inventory=buildR4RequirementInventory({efMarkdown,uiMarkdown});
 const readiness=buildShellAsenReadiness({candidateSha:sha});
 const receipts=await loadR4NativeUiReceipts("r4-native-ui-input");
 const report=assembleR4NativeUiEvidence({candidateSha:sha,runId:env.GITHUB_RUN_ID,
  runAttempt:env.GITHUB_RUN_ATTEMPT,receipts,inventory,readiness});
 await mkdir("r4-native-ui-evidence",{mode:0o700});
 await writeFile("r4-native-ui-evidence/r4-native-ui-report.json",
  JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:report.status,sha,runId:report.provenance.runId,
  nativeTechnicalCells:report.nativeTechnicalCells,uiCasesVerified:0,
  referenceUiCasesExecuted:0,referenceShellCasesExecuted:0,globalFull:false}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await main();}catch(error){console.error("R4_NATIVE_UI_REJECTED: "+
  (error instanceof Error?error.message:"unknown"));process.exitCode=1;}
}
