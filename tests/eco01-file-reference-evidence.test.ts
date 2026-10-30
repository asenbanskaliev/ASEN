import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import test from "node:test";

const root=new URL("../",import.meta.url);
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,root),"utf8"));
const evidence=read("docs/audit/evidence/eco01-files-1359d892f177dd1b76501961582ea3a7eedab8f1/file-reference-observation.json");
const baseline=read("registry/parity/ecosystem-sources-v1.json");
const mappings=read("registry/parity/ecosystem-runtime-edge-mappings-v1.json");
const sourceRepository=process.env.ECOSYSTEM_BASELINE_REPOSITORY;
const git=(...args:string[])=>execFileSync("git",["-C",sourceRepository!,...args],{encoding:"buffer",maxBuffer:32*1024*1024});
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

test("ECO-01 file-reference evidence is bound to the frozen source and exact tracked blobs",{skip:!sourceRepository},()=>{
 assert.equal(evidence.sourceCommit,baseline.commit);
 assert.equal(evidence.sourceTree,baseline.tree);
 assert.equal(git("rev-parse",`${evidence.sourceCommit}^{tree}`).toString().trim(),evidence.sourceTree);
 const globMapping=mappings.mappings.find((row:any)=>row.sourceId==="ECO-SRC-6058ca4d664d9095"&&row.referenceIndex===0);
 const directory=evidence.observations.find((row:any)=>row.id===`${globMapping.sourceId}:${globMapping.referenceIndex}`);
 assert.equal(directory.actualResolution.sourceRootRelativePath,"assets/agents");
 assert.equal(directory.actualResolution.containedInSourceRoot,true);
 assert.equal(directory.inventoryClassification,"outside-root");
 const listing=git("ls-tree","-r","-l","-z","--full-tree",evidence.sourceCommit,"--","assets/agents/").toString("utf8");
 const actual=new Map(listing.split("\0").filter(Boolean).map(entry=>{
  const match=/^\d+ blob ([a-f0-9]+)\s+(\d+)\t(assets\/agents\/[^/]+\.md)$/.exec(entry);
  assert.ok(match,`Unexpected tracked asset row: ${entry}`);
  const [,objectId,size,path]=match!;
  const bytes=git("cat-file","blob",objectId!);
  return [objectId!,{path:path!,size:Number(size),sha256:digest(bytes)}] as const;
 }));
 assert.equal(actual.size,directory.actualResolution.directMarkdownCount);
 const observed=directory.actualResolution.filesInObservedDiscoveryOrder;
 assert.equal(new Set(observed.map((row:any)=>row.sourceObjectId)).size,observed.length);
 assert.deepEqual(new Set(observed.map((row:any)=>row.sourceObjectId)),new Set(actual.keys()));
 for(const row of observed){
  const blob=actual.get(row.sourceObjectId);
  assert.ok(blob);
  assert.equal(row.bytes,blob.size);
  assert.equal(row.sourceSha256,blob.sha256);
 }

 const schemaMapping=mappings.mappings.find((row:any)=>row.mappingKind==="tracked-file");
 const schema=evidence.observations.find((row:any)=>row.id===`${schemaMapping.sourceId}:${schemaMapping.referenceIndex}`);
 assert.equal(schema.sourceTargetObjectId,git("rev-parse",`${evidence.sourceCommit}:${schema.sourceTarget}`).toString().trim());
 assert.equal(digest(git("cat-file","blob",schema.sourceTargetObjectId)),schema.sourceTargetSha256);
 assert.equal(git("cat-file","blob",schema.sourceTargetObjectId).byteLength,schema.sourceTargetBytes);
 assert.equal(schema.asenTargetExists,false);
 assert.equal(directory.asenTargetExists,false);
 assert.equal(evidence.observations.every((row:any)=>row.result==="UNVERIFIED"),true);
});
