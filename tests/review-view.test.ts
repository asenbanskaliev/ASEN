import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chmodSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,unlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {disposeReviewView,materializeReviewView,readReviewViewFile,revalidateReviewView,type ReviewView} from "../src/review/review-view.js";

function manifest(bytes="hello\n"){
 const encoded=Buffer.from(bytes);
 const repositoryRoot=realpathSync(".");
 return {schemaVersion:1 as const,repositoryRoot,gitDirectory:join(repositoryRoot,".git"),objectFormat:"sha1" as const,treeIdentity:"a".repeat(40),treeSize:1,treeSha256:"b".repeat(64),entries:[{
  path:"src/file.txt",kind:"regular" as const,mode:"100644" as const,objectId:"c".repeat(40),size:encoded.length,contentSha256:createHash("sha256").update(encoded).digest("hex"),bytesBase64:encoded.toString("base64")
 }]};
}

test("materializes one immutable read-only candidate view and disposes only owned files",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const view=materializeReviewView(manifest(),parent);
  assert.equal(revalidateReviewView(view,manifest()),view);
  assert.equal(readReviewViewFile(view,"src/file.txt").toString(),"hello\n");
  assert.equal(view.entryCount,1);
  assert.throws(()=>readReviewViewFile(view,"../outside"),/Unsafe portable review path/);
  disposeReviewView(view);
  assert.throws(()=>readFileSync(view.root),/ENOENT/);
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("rejects links and invalid content before materializing",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const invalid={...manifest(),entries:[{...manifest().entries[0]!,kind:"symlink" as const,mode:"120000" as const,bytesBase64:null,size:null,contentSha256:null}]};
  assert.throws(()=>materializeReviewView(invalid,parent),/links and gitlinks/);
  assert.equal(readdirSync(parent).length,0);
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("rejects an in-repository parent whose name begins with two dots",()=>{
 const repository=realpathSync("."),parent=join(repository,"..asen-review-inside-test");
 mkdirSync(parent);
 try{
  assert.throws(()=>materializeReviewView(manifest(),parent),/outside the repository/u);
  assert.deepEqual(readdirSync(parent),[]);
 }finally{rmSync(parent,{recursive:true,force:true});}
});

test("allows a candidate directory name beginning with two dots",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const base=manifest(),candidate={...base,entries:[{...base.entries[0]!,path:"..config/file.txt"}]};
  const view=materializeReviewView(candidate,parent);
  assert.equal(readReviewViewFile(view,"..config/file.txt").toString(),"hello\n");
  disposeReviewView(view);
 }finally{rmSync(parent,{recursive:true,force:true});}
});

for(const failWrite of [true,false])test(`materialization rejects a substituted directory with ${failWrite?"failed":"successful"} write`,{skip:process.platform==="win32"?"POSIX fixture replaces an open directory":false},()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const source=pathToFileURL(resolve("src/review/review-view.ts")).href;
  const script=`import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; import path from 'node:path';
   const original=fs.writeFileSync;let swapped='';
   fs.writeFileSync=function(target,...args){if(typeof target==='string'&&target.endsWith(path.join('src','file.txt'))){
    swapped=path.dirname(path.dirname(target));fs.renameSync(swapped,swapped+'-original');fs.mkdirSync(swapped);fs.mkdirSync(path.join(swapped,'src'));original(path.join(swapped,'foreign.txt'),'preserve');
    if(${failWrite})throw new Error('injected failure');return original.call(this,target,...args);
   }return original.call(this,target,...args);};syncBuiltinESMExports();
   const {materializeReviewView}=await import(${JSON.stringify(source)});let failed=false;
   try{materializeReviewView(${JSON.stringify(manifest())},${JSON.stringify(parent)});}catch(error){failed=String(error).includes('retained');}
   process.stdout.write(JSON.stringify({failed,foreign:fs.readFileSync(path.join(swapped,'foreign.txt'),'utf8'),original:fs.existsSync(swapped+'-original')}));`;
  const value=JSON.parse(execFileSync(process.execPath,["--import","tsx","--input-type=module","--eval",script],{encoding:"utf8"}));
  assert.deepEqual(value,{failed:true,foreign:"preserve",original:true});
 }finally{rmSync(parent,{recursive:true,force:true});}
});

test("does not remove a replaced view root",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const view=materializeReviewView(manifest(),parent),old=view.root;
  chmodSync(old,0o700);rmSync(old,{recursive:true,force:true});writeFileSync(old,"foreign");
  assert.throws(()=>disposeReviewView(view),/ownership is uncertain/);
  assert.throws(()=>readReviewViewFile(view,"src/file.txt"),/ownership is uncertain/);
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("rejects forged or cloned view ownership without deleting unrelated files",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const marker=join(parent,"keep.txt");writeFileSync(marker,"user data\n");
  const info=lstatSync(parent);
  const forged={schemaVersion:1,root:parent,candidateTree:"a".repeat(40),manifestDigest:"b".repeat(64),viewIdentity:"c".repeat(64),
   entryCount:1,platform:process.platform==="win32"?"windows":"posix",rootDev:info.dev,rootIno:info.ino,
   paths:["keep.txt"],entries:[{path:"keep.txt",size:10,contentSha256:createHash("sha256").update("user data\n").digest("hex"),mode:"100644"}]} as ReviewView;
  assert.throws(()=>disposeReviewView(forged),/ownership is uncertain/);
  assert.equal(readFileSync(marker,"utf8"),"user data\n");

  const view=materializeReviewView(manifest(),parent),clone={...view} as ReviewView;
  assert.throws(()=>readReviewViewFile(clone,"src/file.txt"),/ownership is uncertain/);
  assert.throws(()=>disposeReviewView(clone),/ownership is uncertain/);
  disposeReviewView(view);
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("refuses to relax view ACLs when unexpected data has entered the owned root",{skip:process.platform==="win32"?"POSIX fixture mutates directory mode bits":false},()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const view=materializeReviewView(manifest(),parent),foreign=join(view.root,"unexpected.txt");
  chmodSync(view.root,0o700);writeFileSync(foreign,"preserve me\n");
  assert.throws(()=>disposeReviewView(view),/contains unowned data/);
  assert.equal(readFileSync(foreign,"utf8"),"preserve me\n");
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("resumes disposal after an owned entry was already removed",{skip:process.platform==="win32"?"POSIX fixture mutates directory mode bits":false},()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const base=manifest(),bytes=Buffer.from("second\n"),second={...base.entries[0]!,path:"src/second.txt",size:bytes.length,
   contentSha256:createHash("sha256").update(bytes).digest("hex"),bytesBase64:bytes.toString("base64")};
  const candidate={...base,entries:[base.entries[0]!,second]},view=materializeReviewView(candidate,parent),source=join(view.root,"src/file.txt");
  chmodSync(view.root,0o700);chmodSync(join(view.root,"src"),0o700);unlinkSync(source);
  disposeReviewView(view);
  assert.throws(()=>lstatSync(view.root),/ENOENT/);
 } finally {rmSync(parent,{recursive:true,force:true});}
});

test("rejects reviewer-view bytes changed after materialization",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const candidate=manifest(),view=materializeReviewView(candidate,parent),file=join(view.root,"src/file.txt");
  chmodSync(view.root,0o700);chmodSync(join(view.root,"src"),0o700);chmodSync(file,0o600);writeFileSync(file,"tampered\n");
  assert.throws(()=>readReviewViewFile(view,"src/file.txt"),/contents drifted from the candidate/);
  assert.throws(()=>revalidateReviewView(view,candidate),/contents drifted from the candidate/);
 } finally {rmSync(parent,{recursive:true,force:true});}
});
