import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openReviewSession,revalidateReviewSession,closeReviewSession,assertReviewSessionOpen,bindReviewSessionSource} from "../src/review/review-session.js";
import type {CandidateGitTreeManifest} from "../src/review/review-tree-inspection.js";

function manifest(repositoryRoot:string,contents:string):CandidateGitTreeManifest{
 const bytes=Buffer.from(contents),sha=createHash("sha256").update(bytes).digest("hex");
 return {schemaVersion:1,repositoryRoot,gitDirectory:repositoryRoot,objectFormat:"sha1",treeIdentity:"0123456789012345678901234567890123456789",treeSize:bytes.length,treeSha256:sha,entries:[{path:"src/file.txt",kind:"regular",mode:"100644",objectId:"abcdefabcdefabcdefabcdefabcdefabcdefabcd",size:bytes.length,contentSha256:sha,bytesBase64:bytes.toString("base64")}]};
}

test("opens, revalidates and closes one risk-scoped review session",()=>{
 const repository=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-repo-"))),parent=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-parent-")));
 try{
  const session=openReviewSession(repository,manifest(repository,"candidate"),parent,{riskId:"acl",reason:"private reviewer view",severity:"high",lenses:["risk","reliability"]});
  assertReviewSessionOpen(session);assert.equal(session.risk.independentVerifier,true);assert.equal(session.view.entryCount,1);
  assert.equal(revalidateReviewSession(session,manifest(repository,"candidate")),session);
  const closed=closeReviewSession(session);assert.equal(closed.state,"closed");assert.throws(()=>assertReviewSessionOpen(closed),/closed/);assert.throws(()=>closeReviewSession(closed),/already closed/);
 } finally {rmSync(repository,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});}
});

test("rejects candidate drift before review consumption",()=>{
 const repository=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-repo-"))),parent=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-parent-")));
 try{
  const first=manifest(repository,"one"),session=openReviewSession(repository,first,parent,{riskId:"content",reason:"candidate bytes",severity:"low",lenses:["readability"]});
  assert.throws(()=>revalidateReviewSession(session,manifest(repository,"two")),/drifted/);
  closeReviewSession(session);
 } finally {rmSync(repository,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});}
});

test("source binding refuses a caller-forged checkout and accepts no caller validator",()=>{
 const repository=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-binding-repo-"))),parent=realpathSync(mkdtempSync(join(tmpdir(),"asen-session-binding-parent-")));
 try{
  const input=manifest(repository,"candidate"),session=openReviewSession(repository,input,parent,{riskId:"binding",reason:"source claim",severity:"low",lenses:["reliability"]});
  assert.throws(()=>bindReviewSessionSource(session,{repository,treeIdentity:input.treeIdentity} as any),/genuine/u);
  closeReviewSession(session);
 }finally{rmSync(repository,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});}
});
