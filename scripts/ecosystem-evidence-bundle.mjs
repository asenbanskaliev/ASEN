import assert from "node:assert/strict";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {planPiSupportMatrix,validateCellObservation} from "./pi-support-matrix.mjs";
import {admitPackageJourneyResult} from "./ecosystem-package-receipts.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const platforms={linux:"linux",win32:"windows",darwin:"macos"};
const kinds=["positive","negative","failure","recovery","linux","windows","macos","pi-host"];
const classes={positive:"DETERMINISTIC_EXECUTION",negative:"DETERMINISTIC_EXECUTION",
 failure:"DETERMINISTIC_EXECUTION",recovery:"DETERMINISTIC_EXECUTION",linux:"OS_RUNTIME",
 windows:"OS_RUNTIME",macos:"OS_RUNTIME","pi-host":"REAL_PI_HOST"};
const digest=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);

/** Checks cross-artifact consistency; hosted provenance and review remain independent gates. */
export function validateEvidenceBundle({candidate,sourceCommit,sourceManifestSha256,sourceManifestBytes,groups,requireStatefulEvidence=false}){
 assert.equal(typeof requireStatefulEvidence,"boolean");
 assert.match(candidate??"",/^[a-f0-9]{40}$/);assert.match(sourceCommit??"",/^[a-f0-9]{40}$/);
 assert.ok(digest(sourceManifestSha256));
 const checkoutHashes=new Set([sourceManifestSha256]);
 if(sourceManifestBytes!==undefined){
  assert.ok(Buffer.isBuffer(sourceManifestBytes));assert.equal(hash(sourceManifestBytes),sourceManifestSha256);
  const text=sourceManifestBytes.toString("utf8");JSON.parse(text);
  checkoutHashes.add(hash(Buffer.from(text.replace(/(?<!\r)\n/g,"\r\n"))));
 }
 const admitsManifest=(platform,value)=>platform==="win32"?checkoutHashes.has(value):value===sourceManifestSha256;
 assert.ok(Array.isArray(groups));assert.equal(groups.length,3);
 assert.deepEqual(groups.map(group=>group.platform).sort(),Object.keys(platforms).sort());
 const cells=[],receipts=[];
 for(const group of groups){
  const expected=planPiSupportMatrix().filter(cell=>cell.platform===group.platform);
  assert.equal(group.matrix.length,8);assert.equal(group.receipts.length,6);
  const selected=new Map();let artifact;
  for(const entry of group.matrix){
   const row=JSON.parse(entry.bytes),cell=expected.find(cell=>cell.id===row.id);
   assert.ok(cell,"Unknown or misplaced cell");assert.ok(!selected.has(row.id),"Duplicate matrix cell");
   for(const key of ["platform","version","mode"])assert.equal(row[key],cell[key]);
   assert.equal(row.candidate,candidate);assert.equal(row.sourceCommit,sourceCommit);
   assert.equal(row.result,"PASS");assert.ok(digest(row.artifactSha256));
   artifact??=row.artifactSha256;assert.equal(row.artifactSha256,artifact,"Mixed packed bytes within one OS job");
   validateCellObservation(cell,row.observation);
   assert.equal(hash(entry.log),row.observation.logSha256,"Matrix log bytes disagree");
   const record={id:row.id,sha256:hash(entry.bytes)};
   selected.set(row.id,record.sha256);cells.push({...record,artifactSha256:artifact});
  }
  const required=["positive","negative","failure","recovery",platforms[group.platform],"pi-host"];
  const seen=new Set();
  for(const entry of group.receipts){
   const row=JSON.parse(entry.bytes);
   assert.ok(required.includes(row.kind));assert.ok(!seen.has(row.kind),"Duplicate receipt kind");seen.add(row.kind);
   assert.equal(row.id,`ECO-02A-${group.platform}-${row.kind}`);
   assert.equal(row.candidate,candidate);assert.equal(row.sourceCommit,sourceCommit);
   assert.ok(admitsManifest(group.platform,row.sourceManifestSha256),"Manifest differs beyond a known Git checkout line-ending transform");
   assert.equal(row.class,classes[row.kind]);assert.equal(row.result,"PASS");
   for(const key of ["command","observation"])assert.ok(typeof row[key]==="string"&&row[key].trim());
   assert.equal(hash(entry.log),row.logSha256,"Receipt log bytes disagree");
   if(row.class!=="DETERMINISTIC_EXECUTION"){
    const references=JSON.parse(entry.log);assert.ok(Array.isArray(references));assert.equal(references.length,8);
    assert.equal(new Set(references.map(item=>item.id)).size,8);
    for(const reference of references){assert.ok(selected.has(reference.id));assert.equal(reference.sha256,selected.get(reference.id));}
   }
   receipts.push({id:row.id,kind:row.kind,platform:group.platform,sha256:hash(entry.bytes),sourceManifestCheckoutSha256:row.sourceManifestSha256});
  }
  assert.deepEqual([...seen].sort(),required.sort());
  const stateful=group.statefulReceipts??[];
  assert.ok(Array.isArray(stateful));
  assert.ok(stateful.length===0||stateful.length===2,"Incomplete stateful receipts");
  if(requireStatefulEvidence)assert.equal(stateful.length,2,"Missing stateful execution evidence");
  const statefulKinds=new Set();
  for(const entry of stateful){
   const row=JSON.parse(entry.bytes);
   assert.ok(["restart","cross-session"].includes(row.kind));assert.ok(!statefulKinds.has(row.kind));statefulKinds.add(row.kind);
   assert.equal(row.id,`ECO-02A-${group.platform}-${row.kind}`);
   assert.equal(row.candidate,candidate);assert.equal(row.sourceCommit,sourceCommit);
   assert.ok(admitsManifest(group.platform,row.sourceManifestSha256));
   assert.equal(row.class,"REAL_PI_HOST");assert.equal(row.result,"PASS");
   for(const key of ["command","observation"])assert.ok(typeof row[key]==="string"&&row[key].trim());
   assert.equal(hash(entry.log),row.logSha256);
   const admitted=admitPackageJourneyResult({status:0,signal:null,stdout:entry.log});
   assert.equal(row.packageIntegrity,admitted.pack.integrity);
   receipts.push({id:row.id,kind:row.kind,platform:group.platform,sha256:hash(entry.bytes),sourceManifestCheckoutSha256:row.sourceManifestSha256});
  }
 }
 assert.equal(cells.length,24);assert.equal(new Set(cells.map(cell=>cell.id)).size,24);
 assert.ok(kinds.every(kind=>receipts.some(receipt=>receipt.kind===kind)));
 return {schema:"asen.ecosystem-evidence-bundle/v1",candidate,sourceCommit,sourceManifestSha256,
  cells,receipts,kinds,consistency:"PASS",claimsPromotion:false,
  statefulEvidence:groups.every(group=>group.statefulReceipts?.length===2)?"CONSISTENT":"PENDING",
  executionAuthenticity:"Requires independent hosted artifact provenance and review",
  remaining:["Exact source drift reconciliation","Restart and cross-session obligations","Native review","Final evidence-only claim overlay"]};
}

export function main({root=process.argv[2],candidate=process.argv[3],output=process.argv[4],requireStatefulEvidence=process.argv[5]==="--require-stateful"}={}){
 assert.ok(root&&output,"Usage: ecosystem-evidence-bundle.mjs <artifact-root> <candidate-sha> <output-json>");
 assert.match(candidate??"",/^[a-f0-9]{40}$/);
 const sourceBytes=execFileSync("git",["show",`${candidate}:registry/parity/ecosystem-sources-v1.json`],{timeout:30_000,maxBuffer:4*1024*1024});
 const groups=Object.keys(platforms).map(platform=>{
  const directory=join(resolve(root),platform);
  const load=(folder,name)=>({bytes:readFileSync(join(directory,folder,`${name}.json`)),log:readFileSync(join(directory,folder,`${name}.log`))});
  const statefulReceipts=existsSync(join(directory,"stateful-evidence"))
   ?["restart","cross-session"].map(kind=>load("stateful-evidence",kind)):[];
  return {platform,statefulReceipts,matrix:planPiSupportMatrix().filter(cell=>cell.platform===platform).map(cell=>load("matrix-evidence",cell.id)),
   receipts:["positive","negative","failure","recovery",platforms[platform],"pi-host"].map(kind=>load("contract-evidence",kind))};
 });
 const report=validateEvidenceBundle({candidate,sourceCommit:JSON.parse(sourceBytes).commit,sourceManifestSha256:hash(sourceBytes),sourceManifestBytes:sourceBytes,groups,requireStatefulEvidence});
 writeFileSync(resolve(output),JSON.stringify(report,null,2)+"\n");
 return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(error){console.error(error);process.exitCode=1;}
}
