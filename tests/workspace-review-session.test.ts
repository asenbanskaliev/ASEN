import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview} from "../src/review/workspace-review-session.js";
import {assertReviewSessionOpen} from "../src/review/review-session.js";
import {readReviewViewFile} from "../src/review/review-view.js";
import {awaitNativeRddResult,bindNativeRddResult} from "../src/review/native-rdd-result.js";

function repository(t:unknown):{root:string;git:(...args:string[])=>string}{
 const root=mkdtempSync(join(tmpdir(),"asen-workspace-review-session-"));
 (t as {after(callback:()=>void):void}).after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 git("init","-q");git("config","user.name","ASEN test");git("config","user.email","asen@example.invalid");
 writeFileSync(join(root,"target.txt"),"base\n");git("add","target.txt");git("commit","-qm","base");
 return {root:resolve(root),git};
}
const risk={riskId:"T05-workspace",reason:"Review exact workspace candidate",severity:"high" as const,lenses:["risk" as const,"reliability" as const]};
function open(t:unknown,root:string,git:(...args:string[])=>string){
 const parent=mkdtempSync(join(tmpdir(),"asen-workspace-review-view-parent-"));
 (t as {after(callback:()=>void):void}).after(()=>rmSync(parent,{recursive:true,force:true}));
 return openWorkspaceReview({repositoryRoot:root,intendedUntracked:["new.txt"],sessionId:"pi-session",reviewerId:"reviewer-model",viewParent:parent,risk});
}
function result(review:ReturnType<typeof openWorkspaceReview>,verdict:"pass"|"fail"="pass"){
 return {schemaVersion:1,requestId:review.requestId,sessionId:"pi-session",revision:review.projection.candidateTree,
  treeIdentity:review.projection.candidateTree,parentIdentity:review.projection.baseCommit??review.projection.baseTree,
  reviewerId:"reviewer-model",verdict,summary:"local provenance probe"};
}

test("workspace review composes private-index snapshot, manifest, view, and RDD binding without changing HEAD or real index",t=>{
 const {root,git}=repository(t);writeFileSync(join(root,"target.txt"),"candidate\n");writeFileSync(join(root,"new.txt"),"untracked candidate\n");
 const before={head:git("rev-parse","HEAD"),index:git("write-tree"),status:git("status","--porcelain=v1","--untracked-files=all")};
 const review=open(t,root,git);
 try{
  assert.equal(review.projection.baseCommit,before.head);
  assert.equal(review.projection.intendedUntracked[0],"new.txt");
  assert.ok(review.projection.entries.some(entry=>entry.path==="target.txt"&&entry.change==="modified"));
  assert.ok(review.projection.entries.some(entry=>entry.path==="new.txt"&&entry.change==="added"));
  assert.equal(review.session.view.entryCount,review.manifest.entries.length);
  assert.equal(readReviewViewFile(review.session.view,"target.txt").toString(),"candidate\n");
  assert.equal(readReviewViewFile(review.session.view,"new.txt").toString(),"untracked candidate\n");
  assert.deepEqual({head:git("rev-parse","HEAD"),index:git("write-tree"),status:git("status","--porcelain=v1","--untracked-files=all")},before);
  assertReviewSessionOpen(review.session);
  const handle=awaitNativeRddResult(review.session),bound=bindNativeRddResult(handle,result(review));
  assert.equal(bound.treeIdentity,review.projection.candidateTree);
  assert.equal("delivery" in bound,false);
  const evidence=readWorkspaceReviewEvidence(review);
  assert.deepEqual(evidence.modifiedFiles.map(file=>[file.path,file.change]),[["new.txt","added"],["target.txt","modified"]]);
  assert.match(evidence.diff,/candidate/);assert.match(evidence.diff,/untracked candidate/);
  assert.deepEqual(evidence.tests,{status:"not-run",records:[]});
  assert.equal(evidence.candidate.treeIdentity,review.projection.candidateTree);
 }finally{closeWorkspaceReview(review);}
});

test("workspace drift after capture invalidates the session and rejects its prior result",t=>{
 const {root,git}=repository(t);writeFileSync(join(root,"target.txt"),"candidate\n");writeFileSync(join(root,"new.txt"),"untracked candidate\n");
 const review=open(t,root,git),handle=awaitNativeRddResult(review.session);
 try{
  writeFileSync(join(root,"target.txt"),"changed after review\n");
  assert.throws(()=>bindNativeRddResult(handle,result(review)),/stale|drift|changed/u);
  assert.throws(()=>assertReviewSessionOpen(review.session),/stale|drift|changed|closed/u);
 }finally{closeWorkspaceReview(review);}
});

test("workspace review input rejects proxies and malformed scope before capturing candidate objects",t=>{
 const {root,git}=repository(t),parent=mkdtempSync(join(tmpdir(),"asen-workspace-review-view-parent-"));
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const before={head:git("rev-parse","HEAD"),index:git("write-tree"),objects:git("count-objects","-v")};
 const input={repositoryRoot:root,intendedUntracked:[],sessionId:"pi-session",reviewerId:"reviewer-model",viewParent:parent,risk};
 assert.throws(()=>openWorkspaceReview(new Proxy(input,{getOwnPropertyDescriptor(){throw new Error("proxy trap");}}) as any),/plain data/u);
 assert.throws(()=>openWorkspaceReview({...input,intendedUntracked:new Proxy([], {}) as any}),/plain array/u);
 assert.deepEqual({head:git("rev-parse","HEAD"),index:git("write-tree"),objects:git("count-objects","-v")},before);
});

test("workspace session rejects a two-dot child view parent before snapshotting Git objects",t=>{
 const {root,git}=repository(t),parent=join(root,"..asen-review-inside");
 mkdirSync(parent);
 const before={head:git("rev-parse","HEAD"),index:git("write-tree"),objects:git("count-objects","-v")};
 try{
  assert.throws(()=>openWorkspaceReview({repositoryRoot:root,intendedUntracked:[],sessionId:"pi-session",reviewerId:"reviewer-model",viewParent:parent,risk}),/outside the repository/u);
  assert.deepEqual({head:git("rev-parse","HEAD"),index:git("write-tree"),objects:git("count-objects","-v")},before);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
