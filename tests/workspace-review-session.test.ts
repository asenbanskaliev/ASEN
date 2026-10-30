import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {cpSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {openWorkspaceReview,readWorkspaceReviewEvidence,closeWorkspaceReview,WorkspaceReviewScopeError} from "../src/review/workspace-review-session.js";
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

test("workspace review composes an exact tree, manifest, view, and RDD binding without changing HEAD or real index",t=>{
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

test("replacing the repository with identical bytes invalidates the review",t=>{
 const {root,git}=repository(t);writeFileSync(join(root,"target.txt"),"candidate\n");writeFileSync(join(root,"new.txt"),"untracked candidate\n");
 const review=open(t,root,git),original=root+"-original";
 t.after(()=>rmSync(original,{recursive:true,force:true}));
 try{
  renameSync(root,original);cpSync(original,root,{recursive:true});
  assert.throws(()=>assertReviewSessionOpen(review.session),/stale|identity|changed/u);
 }finally{closeWorkspaceReview(review);}
});

test("Git replacement objects cannot substitute the candidate diff",t=>{
 const {root,git}=repository(t);writeFileSync(join(root,"target.txt"),"real candidate\n");writeFileSync(join(root,"new.txt"),"untracked candidate\n");
 const review=open(t,root,git),directory=mkdtempSync(join(tmpdir(),"asen-replace-index-")),index=join(directory,"index");
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const env={...process.env,GIT_INDEX_FILE:index,GIT_NO_REPLACE_OBJECTS:"1"};
 const run=(args:string[],input?:string)=>execFileSync("git",["-C",root,...args],{encoding:"utf8",env,...(input===undefined?{}:{input})}).trim();
 try{
  const fake=run(["hash-object","-w","--stdin"],"fake review\n");
  run(["read-tree",review.projection.candidateTree]);run(["update-index","--cacheinfo",`100644,${fake},target.txt`]);
  const fakeTree=run(["write-tree"]);git("replace",review.projection.candidateTree,fakeTree);
  const evidence=readWorkspaceReviewEvidence(review);
  assert.match(evidence.diff,/real candidate/u);assert.doesNotMatch(evidence.diff,/fake review/u);
  assert.equal(evidence.candidateFiles.find(file=>file.path==="target.txt")?.content,"real candidate\n");
 }finally{closeWorkspaceReview(review);}
});

test("workspace review supports a linked Git worktree with a stable relationship",t=>{
 const {root,git}=repository(t),parent=mkdtempSync(join(tmpdir(),"asen-linked-review-")),linked=join(parent,"checkout");
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 git("worktree","add","--detach",linked,"HEAD");
 writeFileSync(join(linked,"target.txt"),"linked candidate\n");writeFileSync(join(linked,"new.txt"),"untracked candidate\n");
 const review=open(t,realpathSync(linked),git);
 try{assert.match(readWorkspaceReviewEvidence(review).diff,/linked candidate/u);assertReviewSessionOpen(review.session);}
 finally{try{closeWorkspaceReview(review);}finally{git("worktree","remove","--force",linked);}}
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

test("scope rejection precedes changed blob persistence and materialization of any review view",t=>{
 const {root}=repository(t),parent=mkdtempSync(join(tmpdir(),"asen-workspace-scope-parent-"));
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const input={repositoryRoot:root,intendedUntracked:[],sessionId:"pi-session",reviewerId:"reviewer-model",viewParent:parent,risk};
 writeFileSync(join(root,"target.txt"),"modified outside selection\n");
 const oid=execFileSync("git",["-C",root,"hash-object","--stdin"],{input:"modified outside selection\n",encoding:"utf8"}).trim();
 const present=()=>{try{execFileSync("git",["-C",root,"cat-file","-e",oid],{stdio:"ignore"});return true;}catch{return false;}};
 assert.equal(present(),false);
 assert.throws(()=>openWorkspaceReview(input,{reviewPaths:[]}),error=>error instanceof WorkspaceReviewScopeError&&error.kind==="outside-review"&&error.paths.join()=== "target.txt");
 assert.equal(present(),false);assert.deepEqual(readdirSync(parent),[]);
 writeFileSync(join(root,"unexpected.txt"),"unselected\n");
 assert.throws(()=>openWorkspaceReview(input,{reviewPaths:["target.txt"]}),error=>error instanceof WorkspaceReviewScopeError&&error.kind==="unexpected-untracked"&&error.paths.join()==="unexpected.txt");
 assert.deepEqual(readdirSync(parent),[]);
 rmSync(join(root,"unexpected.txt"));
 const review=openWorkspaceReview(input,{reviewPaths:["target.txt"]});
 try{assert.ok(readdirSync(parent).length>0);assert.match(readWorkspaceReviewEvidence(review).diff,/modified outside selection/u);}
 finally{closeWorkspaceReview(review);}
 assert.deepEqual(readdirSync(parent),[]);
});

test("out-of-scope drift does not persist a new blob during review revalidation",t=>{
 const {root,git}=repository(t),parent=mkdtempSync(join(tmpdir(),"asen-workspace-scope-drift-"));
 t.after(()=>rmSync(parent,{recursive:true,force:true}));
 writeFileSync(join(root,"protected.txt"),"before\n");git("add","protected.txt");git("commit","-qm","add protected file");
 writeFileSync(join(root,"target.txt"),"authorized review change\n");
 const input={repositoryRoot:root,intendedUntracked:[],sessionId:"pi-session",reviewerId:"reviewer-model",viewParent:parent,risk};
 const review=openWorkspaceReview(input,{reviewPaths:["target.txt"]});
 try{
  const changed="out of scope after session started\n";
  const oid=execFileSync("git",["-C",root,"hash-object","--stdin"],{input:changed,encoding:"utf8"}).trim();
  const present=()=>{try{execFileSync("git",["-C",root,"cat-file","-e",oid],{stdio:"ignore"});return true;}catch{return false;}};
  assert.equal(present(),false);writeFileSync(join(root,"protected.txt"),changed);
  assert.throws(()=>readWorkspaceReviewEvidence(review),/stale|invalidated/u);
  assert.equal(present(),false);
 }finally{closeWorkspaceReview(review);}
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
