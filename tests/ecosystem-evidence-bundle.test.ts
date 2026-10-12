import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
// @ts-expect-error CI artifact reconciliation is outside the runtime package.
import {validateEvidenceBundle} from "../scripts/ecosystem-evidence-bundle.mjs";
// @ts-expect-error CI matrix planner.
import {planPiSupportMatrix} from "../scripts/pi-support-matrix.mjs";
const candidate="a".repeat(40),sourceCommit="b".repeat(40);
const hash=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
const sourceManifestBytes=Buffer.from('{\n  "source": "fixed"\n}\n');
const sourceManifestSha256=hash(sourceManifestBytes.toString());
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
 return {candidate,sourceCommit,sourceManifestSha256,sourceManifestBytes,groups};
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

test("stateful closure explicitly requires restart and cross-session evidence on every OS",()=>{
 assert.throws(()=>validateEvidenceBundle({...fixture(),requireStatefulEvidence:true}),/stateful/);
});

function withStatefulEvidence(){
 const input={...fixture(),requireStatefulEvidence:true};
 const journey={installedPiPackageVerified:true,childAuthorityAutoLoaded:false,visibleRpcCommands:9,modelInvocations:0,
  sessionRestartVerified:true,crossSessionProjectionVerified:true,naturalProcessExits:3,
  publicHost:{mode:"rpc",canonicalCommands:9,canonicalTools:11,hasUI:true,toolsEnabled:true}};
 const integrity="sha512-"+"A".repeat(86)+"==";
 const log=JSON.stringify(journey)+"\n"+JSON.stringify({packedInstallVerified:true,publicExports:28,files:243,integrity})+"\nPACK_ENV_BOUNDARY_PASS\n";
 for(const group of input.groups)(group as any).statefulReceipts=["restart","cross-session"].map(kind=>({log,
  bytes:JSON.stringify({id:`ECO-02A-${group.platform}-${kind}`,candidate,sourceCommit,sourceManifestSha256,
   kind,class:"REAL_PI_HOST",result:"PASS",command:"npm run verify:pack",observation:"real packaged session projection",
   packageIntegrity:integrity,logSha256:hash(log)})}));
 return input;
}

test("stateful bundle binds package logs and receipts without claiming independent authenticity",()=>{
 const result=validateEvidenceBundle(withStatefulEvidence());
 assert.equal(result.statefulEvidence,"CONSISTENT");assert.equal(result.claimsPromotion,false);
 assert.equal(result.receipts.filter((row:{kind:string})=>["restart","cross-session"].includes(row.kind)).length,6);
});

test("stateful bundle rejects missing OS proof, altered package integrity and forced exits",()=>{
 for(const mutate of [
  (input:any)=>{input.groups[2].statefulReceipts=[];},
  (input:any)=>{const entry=input.groups[0].statefulReceipts[0],row=JSON.parse(entry.bytes);row.packageIntegrity="wrong";entry.bytes=JSON.stringify(row);},
  (input:any)=>{const entry=input.groups[0].statefulReceipts[0];entry.log=entry.log.replace('"naturalProcessExits":3','"naturalProcessExits":2');const row=JSON.parse(entry.bytes);row.logSha256=hash(entry.log);entry.bytes=JSON.stringify(row);},
 ]){const input=withStatefulEvidence();mutate(input);assert.throws(()=>validateEvidenceBundle(input));}
});

test("Windows manifest receipt admits only the exact Git LF-to-CRLF checkout transformation",()=>{
 const input=fixture(),windows=input.groups.find(group=>group.platform==="win32")!;
 const checkoutHash=hash(sourceManifestBytes.toString().replace(/\n/g,"\r\n"));
 for(const entry of windows.receipts){const row=JSON.parse(entry.bytes);row.sourceManifestSha256=checkoutHash;entry.bytes=JSON.stringify(row);}
 assert.equal(validateEvidenceBundle(input).receipts.find((row:{platform:string})=>row.platform==="win32").sourceManifestCheckoutSha256,checkoutHash);
 const row=JSON.parse(windows.receipts[0]!.bytes);row.sourceManifestSha256="e".repeat(64);windows.receipts[0]!.bytes=JSON.stringify(row);
 assert.throws(()=>validateEvidenceBundle(input));
});

test("canonical manifest byte digest is checked before accepting any checkout transform",()=>{
 const input=fixture();input.sourceManifestBytes=Buffer.from("different");
 assert.throws(()=>validateEvidenceBundle(input));
});
