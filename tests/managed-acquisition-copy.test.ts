import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {copyManagedAcquisitionToStage,verifyManagedAcquisitionDestinationDirectoryClaim,type ManagedAcquisitionDestinationDirectoryClaim} from "../src/runtime/managed-acquisition-copy.js";
import {ManagedAdditionalStageError,stageAdditionalManagedVersion,stageManagedInstall} from "../src/runtime/managed-install.js";

test("copy permits its own nested and sibling directories to change destination link counts",async()=>{
 const cache=path.join(process.cwd(),".cache");await fs.mkdir(cache,{recursive:true});
 const root=await fs.mkdtemp(path.join(cache,"u9d-directory-count-"));
 const source=path.join(root,"source"),stage=path.join(root,"stage");
 await fs.mkdir(source);await fs.mkdir(stage);
 const contents=[{sourcePath:"first",destinationPath:"one/two/first",bytes:"first bytes"},{sourcePath:"second",destinationPath:"one/other/second",bytes:"second bytes"}];
 for(const file of contents)await fs.writeFile(path.join(source,file.sourcePath),file.bytes);
 const sourceBefore=await fs.stat(source,{bigint:true});
 const claims=new Map<string,ManagedAcquisitionDestinationDirectoryClaim>();
 await copyManagedAcquisitionToStage(source,stage,{
  schema:"asen.managed-acquisition/v1",version:"2.0.0",
  files:contents.map(({bytes,...file})=>({...file,size:Buffer.byteLength(bytes),sha256:createHash("sha256").update(bytes).digest("hex")})),
 },undefined,(directory,claim)=>claims.set(directory,claim));
 for(const file of contents){
  assert.equal(await fs.readFile(path.join(stage,file.destinationPath),"utf8"),file.bytes);
  assert.equal(await fs.readFile(path.join(source,file.sourcePath),"utf8"),file.bytes);
 }
 assert.deepEqual((await fs.readdir(stage)).sort(),["one"]);
 assert.deepEqual((await fs.readdir(path.join(stage,"one"))).sort(),["other","two"]);
 const sourceAfter=await fs.stat(source,{bigint:true});
 assert.equal(sourceAfter.mtimeNs,sourceBefore.mtimeNs);assert.equal(sourceAfter.nlink,sourceBefore.nlink);
 for(const [directory,claim] of claims){
  const actual=await fs.stat(directory,{bigint:true});
  assert.equal(actual.dev,claim.dev);assert.equal(actual.ino,claim.ino);assert.equal(actual.mode,claim.mode);
  assert.equal(await verifyManagedAcquisitionDestinationDirectoryClaim(directory,claim),true,"a child-count change does not replace the owned directory");
 }
});

test("expected cleanup retains unknown child directories after the parent's link count changes",async()=>{
 const cache=path.join(process.cwd(),".cache");await fs.mkdir(cache,{recursive:true});
 const root=await fs.mkdtemp(path.join(cache,"u9d-unknown-child-"));
 const source=path.join(root,"source"),prefix=path.join(root,"prefix");
 await fs.mkdir(source);await fs.writeFile(path.join(source,"file"),"bytes");
 const files=[{sourcePath:"file",destinationPath:"dist/file"}];
 await stageManagedInstall({prefix,packageRoot:source,version:"1.0.0",files,confirmed:true,protectedPaths:[]});
 let foreign="",stagePath="";const cause=new Error("stop after adding unknown child");
 await assert.rejects(()=>stageAdditionalManagedVersion({
  prefix,packageRoot:source,version:"2.0.0",files,confirmed:true,protectedPaths:[],
  expectedAcquisition:{schema:"asen.managed-acquisition/v1",version:"2.0.0",files:[{...files[0]!,size:5,sha256:createHash("sha256").update("bytes").digest("hex")}]},
  hooks:{beforePublish:async()=>{
   const [name]=await fs.readdir(path.join(prefix,"install","staging"));assert.ok(name);
   stagePath=path.join(prefix,"install","staging",name);foreign=path.join(stagePath,"dist","unknown");
   await fs.mkdir(foreign);await fs.writeFile(path.join(foreign,"keep"),"FOREIGN");throw cause;
  }},
 }),error=>{
  assert.ok(error instanceof ManagedAdditionalStageError);
  assert.equal(error.report.error,cause.message);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.cleanup,"uncertain");
  assert.deepEqual(error.report.retainedPaths,[stagePath]);assert.equal(error.report.publication,"not-started");return true;
 });
 assert.equal(await fs.readFile(path.join(foreign,"keep"),"utf8"),"FOREIGN");
 await assert.rejects(()=>fs.lstat(path.join(prefix,"install","versions","2.0.0")),{code:"ENOENT"});
 assert.equal(await fs.readFile(path.join(prefix,"install","versions","1.0.0","dist","file"),"utf8"),"bytes");
});
