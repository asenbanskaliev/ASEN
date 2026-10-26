import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {chmodSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {disposeReviewView,materializeReviewView,readReviewViewFile,revalidateReviewView} from "../src/review/review-view.js";

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

test("does not remove a replaced view root",()=>{
 const parent=mkdtempSync(join(tmpdir(),"asen-review-parent-"));
 try{
  const view=materializeReviewView(manifest(),parent),old=view.root;
  chmodSync(old,0o700);rmSync(old,{recursive:true,force:true});writeFileSync(old,"foreign");
  assert.throws(()=>disposeReviewView(view),/ownership is uncertain/);
  assert.throws(()=>readReviewViewFile(view,"src/file.txt"),/ownership is uncertain/);
 } finally {rmSync(parent,{recursive:true,force:true});}
});
