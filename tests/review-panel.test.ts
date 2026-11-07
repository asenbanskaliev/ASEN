import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test,{type TestContext} from "node:test";
import {planWorkUnitBoundary,type ReadyWorkUnitBoundary,type WorkUnitBoundaryInput} from "../src/delivery/work-unit-policy.js";
import {recordCompletedWorkUnit,type CompletedWorkUnit,type WorkUnitEvidenceInput} from "../src/delivery/work-unit-evidence.js";
import {recordWorkUnitReviewCandidate,type ReviewCandidateKind,type WorkUnitReviewCandidateInput} from "../src/delivery/work-unit-review-candidate.js";
import {bindOrdinaryReviewCheckout,claimOrdinaryReviewCheckout,prepareOrdinaryReview,type OrdinaryReviewCheckout} from "../src/review/ordinary-review-controller.js";
import {prepareReviewPanelDescriptor,renderReviewPanel,type ReviewPanelDescriptor} from "../src/runtime/review-panel.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

const tracker="odd/tasks/ui-runtime-delivery-order.md";
const repositoryIdentity="https://github.com/acme/asen";

function git(root:string,...args:string[]):string{
 return execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
function createRepository(t:TestContext):{root:string;revision:string;treeIdentity:string;parentIdentity:string}{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"asen-review-panel-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 git(root,"init","-q");
 for(let index=0;index<2;index++)git(root,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m",`test(review): panel ${index}`);
 return {root,revision:git(root,"rev-parse","HEAD"),treeIdentity:git(root,"rev-parse","HEAD^{tree}"),parentIdentity:git(root,"rev-parse","HEAD^")};
}
function completed(snapshot:{revision:string;treeIdentity:string;parentIdentity:string}):CompletedWorkUnit{
 const boundaryInput:WorkUnitBoundaryInput={
  featureIdentity:"R15-U1",taskIdentity:"R15-U1-review-panel",taskDocumentPath:tracker,purpose:"Project a candidate-only review descriptor",behaviorIds:["candidate-only-review-panel"],
  currentBranch:"feat/review-panel",defaultBranch:"main",authoredAdditions:120,authoredDeletions:0,
  expectedChangedPaths:["src/runtime/review-panel.ts","tests/review-panel.test.ts","docs/asen-review-panel.md",tracker],rollbackBoundaries:["Revert R15-U1 review panel"],generatedArtifacts:[],previousReviewedBoundary:null,
  focusedTests:{kind:"required"},runtimeHarness:{kind:"n_a",reason:"Pure renderer slice"},documentation:{kind:"required"},deliveryRelationship:{kind:"single"},
 };
 const boundary=planWorkUnitBoundary(boundaryInput) as ReadyWorkUnitBoundary;
 const evidence:WorkUnitEvidenceInput={
  featureIdentity:boundary.featureIdentity,taskIdentity:boundary.taskIdentity,taskDocumentPath:boundary.taskDocumentPath,boundaryId:boundary.boundaryId,repositoryIdentity,purpose:boundary.purpose,
  deliveryRelationship:boundary.deliveryRelationship,previousReviewedBoundary:boundary.previousReviewedBoundary,rollbackBoundary:boundary.rollbackBoundaries[0]!,
  commit:{identity:snapshot.revision,treeIdentity:snapshot.treeIdentity,parentIdentity:snapshot.parentIdentity,message:"feat(review): add candidate panel",currentTreeIdentity:snapshot.treeIdentity},
  authoredAdditions:boundary.authoredAdditions,authoredDeletions:boundary.authoredDeletions,changedPaths:[...boundary.expectedChangedPaths],behaviorPaths:["src/runtime/review-panel.ts"],
  focusedTestPaths:["tests/review-panel.test.ts"],documentationPaths:["docs/asen-review-panel.md"],generatedArtifacts:[],
  focusedTests:{status:"pass",command:"node --import tsx --test tests/review-panel.test.ts",scenario:"candidate-only review panel",exitCode:0,summary:"Focused checks passed"},
  runtimeHarness:{status:"n_a",reason:"Pure renderer slice"},documentation:{status:"required",paths:["docs/asen-review-panel.md"]},taskDocumentCommitIdentity:snapshot.revision,
 };
 return recordCompletedWorkUnit(boundary,evidence);
}
function candidate(record:CompletedWorkUnit,kind:ReviewCandidateKind):WorkUnitReviewCandidateInput{
 return {kind,identity:kind==="commit"?record.commit.identity:`${repositoryIdentity}/pull/27`,revision:record.commit.identity,treeIdentity:record.commit.treeIdentity,
  repositoryIdentity,featureIdentity:record.featureIdentity,taskIdentity:record.taskIdentity,taskDocumentPath:record.taskDocumentPath,boundaryId:record.boundaryId,
  previousReviewedBoundary:record.previousReviewedBoundary,deliveryRelationship:record.deliveryRelationship};
}
function checkout(t:TestContext,kind:ReviewCandidateKind="commit"):{checkout:OrdinaryReviewCheckout;root:string;revision:string;treeIdentity:string;parentIdentity:string}{
 const snapshot=createRepository(t),record=completed(snapshot),reviewCandidate=recordWorkUnitReviewCandidate(record,candidate(record,kind));
 const request=prepareOrdinaryReview(reviewCandidate,{authorId:"author",reviewerId:"reviewer",sessionId:"session"});
 return {...snapshot,checkout:bindOrdinaryReviewCheckout(request,"session",snapshot.root)};
}

const descriptorKeys=["candidate","candidateKind","deliveryApproval","nativeAcknowledgement","nativeStatus","reviewState","schemaVersion"].sort();
const candidateKeys=["parentIdentity","revision","treeIdentity"].sort();

test("prepares the exact deeply frozen whitelist for both genuine candidate kinds",t=>{
 for(const kind of ["commit","pr_slice"] as const){
  const fixture=checkout(t,kind);let privateReads=0;
  const input={checkout:fixture.checkout} as {checkout:OrdinaryReviewCheckout}&Record<string,unknown>;
  for(const key of ["modelVerdict","summary","findings","repository","session","participant","task","path","payload"])
   Object.defineProperty(input,key,{enumerable:true,get(){privateReads++;throw new Error(`private ${key}`);}});
  const descriptor=prepareReviewPanelDescriptor(input);
  assert.ok(descriptor);assert.equal(privateReads,0);assert.deepEqual(Object.keys(descriptor).sort(),descriptorKeys);assert.deepEqual(Object.keys(descriptor.candidate).sort(),candidateKeys);
  assert.deepEqual(descriptor,{schemaVersion:1,candidateKind:kind,candidate:{revision:fixture.revision,treeIdentity:fixture.treeIdentity,parentIdentity:fixture.parentIdentity},reviewState:"review-needed",nativeStatus:"unavailable",nativeAcknowledgement:"not-acknowledged",deliveryApproval:"not-approved"});
  assert.equal(Object.isFrozen(descriptor)&&Object.isFrozen(descriptor.candidate),true);
  assert.throws(()=>{(descriptor.candidate as {revision:string}).revision="forged";},TypeError);
 }
});

test("returns null for forged or malformed checkout input and renders one fixed unavailable label without leaked data",()=>{
 const secret="PRIVATE-FORGED-REPOSITORY";
 for(const value of [null,{}, {checkout:{}},{checkout:{repository:secret}}]){
  const descriptor=prepareReviewPanelDescriptor(value as Readonly<{checkout:OrdinaryReviewCheckout}>);
  assert.equal(descriptor,null);const lines=renderReviewPanel(descriptor,140);
  assert.deepEqual(lines,["Review unavailable"]);assert.doesNotMatch(lines.join("\n"),/PRIVATE-FORGED-REPOSITORY/u);
 }
});

test("fails closed when a genuine checkout becomes dirty or stale",t=>{
 const dirty=checkout(t);writeFileSync(join(dirty.root,"untracked-private.txt"),"PRIVATE DIRTY DATA");
 assert.equal(prepareReviewPanelDescriptor({checkout:dirty.checkout}),null);assert.deepEqual(renderReviewPanel(null,40),["Review unavailable"]);
 const stale=checkout(t);git(stale.root,"-c","user.name=ASEN Test","-c","user.email=test@example.invalid","commit","-q","--allow-empty","-m","test(review): stale checkout");
 assert.equal(prepareReviewPanelDescriptor({checkout:stale.checkout}),null);assert.deepEqual(renderReviewPanel(null,40),["Review unavailable"]);
});

test("descriptor projection does not consume checkout provenance",t=>{
 const fixture=checkout(t);assert.ok(prepareReviewPanelDescriptor({checkout:fixture.checkout}));
 assert.equal(claimOrdinaryReviewCheckout(fixture.checkout),fixture.checkout);
});

test("renders fixed candidate-only labels at widths 12, 40, 72, and 140",()=>{
 const descriptor:ReviewPanelDescriptor=Object.freeze({schemaVersion:1,candidateKind:"pr_slice",candidate:Object.freeze({revision:"a".repeat(40),treeIdentity:"b".repeat(40),parentIdentity:"c".repeat(40)}),reviewState:"review-needed",nativeStatus:"unavailable",nativeAcknowledgement:"not-acknowledged",deliveryApproval:"not-approved"});
 const full=["Review candidate: pr_slice",`Revision: ${descriptor.candidate.revision}`,`Tree: ${descriptor.candidate.treeIdentity}`,`Parent: ${descriptor.candidate.parentIdentity}`,"Review state: review-needed","Native status: unavailable","Native acknowledgement: not-acknowledged","Delivery approval: not-approved"];
 assert.deepEqual(renderReviewPanel(descriptor,140),full);
 for(const width of [12,40,72,140]){
  const lines=renderReviewPanel(descriptor,width);assert.equal(lines.length,full.length);assert.equal(Object.isFrozen(lines),true);
  assert.ok(lines.every(line=>visibleWidth(line)<=width));assert.ok(lines.every(line=>!/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(line)));
 }
});

test("renderer ignores model, human, host ACK, and structural acceptance fields and keeps authority constants",()=>{
 const base:ReviewPanelDescriptor={schemaVersion:1,candidateKind:"commit",candidate:{revision:"a".repeat(40),treeIdentity:"b".repeat(40),parentIdentity:"c".repeat(40)},reviewState:"review-needed",nativeStatus:"unavailable",nativeAcknowledgement:"not-acknowledged",deliveryApproval:"not-approved"};let privateReads=0;
 const augmented={...base} as ReviewPanelDescriptor&Record<string,unknown>;
 for(const key of ["verdict","humanAcceptance","hostAcknowledgement","structuralAcceptance","findings","rawPayload"])
  Object.defineProperty(augmented,key,{enumerable:true,get(){privateReads++;return key==="verdict"?"PASS":true;}});
 const lines=renderReviewPanel(augmented,140);assert.equal(privateReads,0);
 assert.ok(lines.includes("Review state: review-needed"));assert.ok(lines.includes("Native status: unavailable"));assert.ok(lines.includes("Native acknowledgement: not-acknowledged"));assert.ok(lines.includes("Delivery approval: not-approved"));
 assert.doesNotMatch(lines.join("\n"),/PASS|humanAcceptance|hostAcknowledgement|structuralAcceptance/u);
});
