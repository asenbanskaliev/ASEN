import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
// @ts-expect-error CI artifact reconciliation is outside the runtime package.
import {validateEvidenceBundle} from "../scripts/ecosystem-evidence-bundle.mjs";
// @ts-expect-error CI matrix planner.
import {planPiSupportMatrix} from "../scripts/pi-support-matrix.mjs";
const candidate="a".repeat(40),sourceCommit="b".repeat(40),sourceManifestSha256="c".repeat(64);
const hash=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
const classes:Record<string,string>={positive:"DETERMINISTIC_EXECUTION",negative:"DETERMINISTIC_EXECUTION",failure:"DETERMINISTIC_EXECUTION",recovery:"DETERMINISTIC_EXECUTION",linux:"OS_RUNTIME",windows:"OS_RUNTIME",macos:"OS_RUNTIME","pi-host":"REAL_PI_HOST"};
function fixture(){
 const groups=["linux","win32","darwin"].map(platform=>{
  const matrix=planPiSupportMatrix().filter((cell:{platform:string})=>cell.platform===platform).map((cell:object)=>{
   const log="real-host fixture log";
   const bytes=JSON.stringify({...cell,candidate,sourceCommit,artifactSha256:"d".repeat(64),result:"PASS",
    observation:{mode:(cell as {mode:string}).mode,hasUI:true,commands:["asen"],tools:["asen_ask_choice"],modelCalls:0,shutdownObserved:true,exitCode:0,signal:null,timedOut:false,logSha256:hash(log)}});
   return {bytes,log};
  });
  const hostLog=JSON.stringify(matrix.map((item:{bytes:string})=>({id:JSON.parse(item.bytes).id,sha256:hash(item.bytes)})),null,2)+"\n";
  const os={linux:"linux",win32:"windows",darwin:"macos"}[platform]!;
  const receipts=["positive","negative","failure","recovery",os,"pi-host"].map(kind=>{
   const log=[os,"pi-host"].includes(kind)?hostLog:"contract execution log";
   return {bytes:JSON.stringify({id:`ECO-02A-${platform}-${kind}`,candidate,sourceCommit,sourceManifestSha256,
    kind,class:classes[kind],result:"PASS",command:"executed command",observation:"observed contract",logSha256:hash(log)}),log};
  });
  return {platform,matrix,receipts};
 });
 return {candidate,sourceCommit,sourceManifestSha256,groups};
}

test("bundle reconciles all 24 cells and eight kinds without promoting claims",()=>{
 const result=validateEvidenceBundle(fixture());
 assert.equal(result.cells.length,24);
 assert.deepEqual(result.kinds,["positive","negative","failure","recovery","linux","windows","macos","pi-host"]);
 assert.equal(result.claimsPromotion,false);
});

test("bundle rejects missing operating systems, cells and receipt kinds",()=>{
 for(const mutate of [
  (input:any)=>input.groups.pop(),
  (input:any)=>input.groups[0].matrix.pop(),
  (input:any)=>input.groups[0].receipts.pop(),
 ]){const input=fixture();mutate(input);assert.throws(()=>validateEvidenceBundle(input));}
});

test("bundle rejects duplicate or misplaced cell and operating-system identities",()=>{
 for(const mutate of [
  (input:any)=>{input.groups[1]=input.groups[0];},
  (input:any)=>{input.groups[0].matrix[1]=input.groups[0].matrix[0];},
  (input:any)=>{input.groups[0].matrix[0]=input.groups[1].matrix[0];},
 ]){const input=fixture();mutate(input);assert.throws(()=>validateEvidenceBundle(input));}
});

test("bundle rejects altered logs, stale candidates and mixed packed artifacts",()=>{
 for(const mutate of [
  (input:any)=>{input.groups[0].matrix[0].log+="tampered";},
  (input:any)=>{input.groups[0].receipts[0].log+="tampered";},
  (input:any)=>{const entry=input.groups[0].matrix[0],row=JSON.parse(entry.bytes);row.candidate="e".repeat(40);entry.bytes=JSON.stringify(row);},
  (input:any)=>{const entry=input.groups[0].matrix[0],row=JSON.parse(entry.bytes);row.artifactSha256="e".repeat(64);entry.bytes=JSON.stringify(row);},
 ]){const input=fixture();mutate(input);assert.throws(()=>validateEvidenceBundle(input));}
});

test("bundle rejects forged host/platform classes and mismatched matrix receipt references",()=>{
 for(const mutate of [
  (input:any)=>{const entry=input.groups[0].receipts[5],row=JSON.parse(entry.bytes);row.class="DETERMINISTIC_EXECUTION";entry.bytes=JSON.stringify(row);},
  (input:any)=>{const entry=input.groups[0].receipts[4];entry.log="[]\n";const row=JSON.parse(entry.bytes);row.logSha256=hash(entry.log);entry.bytes=JSON.stringify(row);},
 ]){const input=fixture();mutate(input);assert.throws(()=>validateEvidenceBundle(input));}
});

test("bundle rejects wrong frozen source, forced exits and fabricated model-free observations",()=>{
 for(const patch of [{sourceCommit:"e".repeat(40)},{result:"FAIL"},
  {observation:{modelCalls:1}},{observation:{timedOut:true}},{observation:{shutdownObserved:false}}]){
  const input=fixture(),entry=input.groups[0]!.matrix[0]!,row=JSON.parse(entry.bytes);
  if(patch.observation)Object.assign(row.observation,patch.observation);else Object.assign(row,patch);
  entry.bytes=JSON.stringify(row);
  assert.throws(()=>validateEvidenceBundle(input));
 }
});

test("bundle accepts actual byte buffers while retaining exact receipt digests",()=>{
 const input=fixture();
 const expected=hash(input.groups[0]!.receipts[0]!.bytes);
 const buffers={...input,groups:input.groups.map(group=>({...group,
  matrix:group.matrix.map((entry:{bytes:string;log:string})=>({bytes:Buffer.from(entry.bytes),log:Buffer.from(entry.log)})),
  receipts:group.receipts.map(entry=>({bytes:Buffer.from(entry.bytes),log:Buffer.from(entry.log)}))}))};
 assert.equal(validateEvidenceBundle(buffers).receipts[0].sha256,expected);
});
