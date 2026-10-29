import {createHash,randomUUID} from "node:crypto";
import {inspectCandidateGitTree,type CandidateGitTreeManifest} from "./review-tree-inspection.js";
import {openReviewSession,bindReviewSessionWorkspaceSource,type ReviewSession,assertReviewSessionOpen,closeReviewSession} from "./review-session.js";
import {captureWorkspaceReviewProjection,diffWorkspaceReviewProjection,isWorkspaceReviewProjectionGenuine,type WorkspaceReviewProjection,type WorkspaceReviewProjectionRequest,type WorkspaceCorrectionConstraint} from "./workspace-review-projection.js";
export {WorkspaceReviewScopeError} from "./workspace-review-projection.js";
import {isProxy} from "node:util/types";
import type {ReviewLens,ReviewRiskInput} from "./review-risk.js";
import {lstatSync,realpathSync} from "node:fs";
import {isAbsolute,relative,sep} from "node:path";
import {readReviewViewFile} from "./review-view.js";

export interface WorkspaceReviewSessionInput extends WorkspaceReviewProjectionRequest{
 readonly sessionId:string;
 readonly reviewerId:string;
 readonly viewParent:string;
 readonly risk:ReviewRiskInput;
}
export interface WorkspaceReviewSession{
 readonly requestId:string;
 readonly session:ReviewSession;
 readonly projection:WorkspaceReviewProjection;
 readonly manifest:CandidateGitTreeManifest;
}
export interface WorkspaceReviewEvidence{
 readonly schemaVersion:1;
 readonly requestId:string;
 readonly sessionId:string;
 readonly reviewerId:string;
 readonly candidate:Readonly<{revision:string;treeIdentity:string;parentIdentity:string;repositoryRoot:string}>;
 readonly repositoryState:Readonly<{baseCommit:string|null;baseTree:string;candidateTree:string;indexIdentity:string;sourceIdentity:string;intendedUntracked:readonly string[];unexpectedUntracked:readonly string[]}>;
 readonly modifiedFiles:readonly Readonly<{path:string;change:string;mode:string;objectId:string|null;contentSha256:string|null}>[];
 readonly candidateFiles:readonly Readonly<{path:string;encoding:"utf8"|"base64";content:string}>[];
 readonly diff:string;
 readonly tests:Readonly<{status:"not-run";records:readonly string[]}>;
 readonly risks:ReviewSession["risk"];
 readonly evidence:Readonly<{manifestTreeSha256:string;manifestEntries:number;viewIdentity:string}>;
}
interface WorkspaceClaim{readonly session:ReviewSession;readonly projection:WorkspaceReviewProjection;readonly request:WorkspaceReviewProjectionRequest;readonly requestId:string;readonly sessionId:string;readonly reviewerId:string;}
const liveWorkspaceReviews=new WeakMap<object,WorkspaceClaim>();
const issuedWorkspaceEvidence=new WeakSet<object>();
export function isWorkspaceReviewEvidenceGenuine(value:unknown):value is WorkspaceReviewEvidence{return typeof value==="object"&&value!==null&&issuedWorkspaceEvidence.has(value);}
function exactRecord(value:unknown,keys:readonly string[],label:string):Record<string,unknown>{
 if(typeof value!=="object"||value===null||isProxy(value)||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error(`${label} must be plain data`);
 const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(descriptors);
 if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key)))throw new Error(`${label} shape is invalid`);
 const output:Record<string,unknown>={};
 for(const key of keys){const descriptor=descriptors[key];if(!descriptor?.enumerable||!("value" in descriptor))throw new Error(`${label} shape is invalid`);output[key]=descriptor.value;}
 return output;
}
function stringArray(value:unknown,label:string):string[]{
 if(!Array.isArray(value)||isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new Error(`${label} must be a plain array`);
 const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(descriptors);
 if(own.length!==value.length+1||own.some(key=>key!=="length"&&!(typeof key==="string"&&/^(?:0|[1-9][0-9]*)$/u.test(key)&&Number(key)<value.length)))throw new Error(`${label} must be a dense plain array`);
 const result:string[]=[];
 for(let index=0;index<value.length;index++){const descriptor=descriptors[String(index)];if(!descriptor?.enumerable||!("value" in descriptor)||typeof descriptor.value!=="string")throw new Error(`${label} must be a dense plain string array`);result.push(descriptor.value);}
 return result;
}
function normalizeInput(value:unknown):WorkspaceReviewSessionInput{
 const raw=exactRecord(value,["repositoryRoot","intendedUntracked","sessionId","reviewerId","viewParent","risk"],"workspace review input");
 const risk=exactRecord(raw.risk,["riskId","reason","severity","lenses"],"workspace review risk");
 const lenses=stringArray(risk.lenses,"workspace review lenses");
 if(typeof risk.riskId!=="string"||typeof risk.reason!=="string"||(risk.severity!=="low"&&risk.severity!=="high")||lenses.some(lens=>!["risk","resilience","readability","reliability"].includes(lens)))throw new Error("Workspace review risk is invalid");
 const clean=(item:unknown):item is string=>typeof item==="string"&&item.length>0&&item===item.trim()&&item===item.normalize("NFC")&&!/[\u0000-\u001f\u007f-\u009f]/u.test(item);
 if(!clean(raw.repositoryRoot)||!clean(raw.sessionId)||!clean(raw.reviewerId)||!clean(raw.viewParent))throw new Error("Workspace review identity is invalid");
 return Object.freeze({repositoryRoot:raw.repositoryRoot,intendedUntracked:Object.freeze(stringArray(raw.intendedUntracked,"workspace untracked scope")),sessionId:raw.sessionId,reviewerId:raw.reviewerId,viewParent:raw.viewParent,risk:Object.freeze({riskId:risk.riskId,reason:risk.reason,severity:risk.severity,lenses:Object.freeze(lenses as ReviewLens[])})});
}

/** Captures workspace bytes as a Git tree, then binds one isolated view to those exact sources. */
export function openWorkspaceReview(input:WorkspaceReviewSessionInput,selection?:{readonly reviewPaths:readonly string[]},correction?:WorkspaceCorrectionConstraint):WorkspaceReviewSession{
 input=normalizeInput(input);
 const selected=selection===undefined?undefined:stringArray(exactRecord(selection,["reviewPaths"],"workspace review selection").reviewPaths,"workspace review paths");
 if(!isAbsolute(input.repositoryRoot)||!isAbsolute(input.viewParent))throw new Error("Workspace review paths must be absolute");
 const rootInfo=lstatSync(input.repositoryRoot),parentInfo=lstatSync(input.viewParent);
 if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!parentInfo.isDirectory()||parentInfo.isSymbolicLink())throw new Error("Workspace review directories are unsafe");
 const root=realpathSync(input.repositoryRoot),parent=realpathSync(input.viewParent),relativeParent=relative(root,parent);
 const parentIsInside=relativeParent===""||(!isAbsolute(relativeParent)&&relativeParent!==".."&&!relativeParent.startsWith(".."+sep));
 if(parentIsInside)throw new Error("Workspace review view parent must be outside the repository");
 const projectionRequest=Object.freeze({repositoryRoot:root,intendedUntracked:Object.freeze([...input.intendedUntracked])});
 const projection=captureWorkspaceReviewProjection(projectionRequest,selected,correction);
 const manifest=inspectCandidateGitTree({repositoryRoot:projection.repositoryRoot,treeIdentity:projection.candidateTree});
 const session=openReviewSession(projection.repositoryRoot,manifest,parent,input.risk);
 try{
  const requestId=createHash("sha256").update("asen.workspace-review.v1\0").update(JSON.stringify({
   attemptId:randomUUID(),
   sessionId:input.sessionId,reviewerId:input.reviewerId,repositoryRoot:projection.repositoryRoot,risk:session.risk,
   baseCommit:projection.baseCommit,baseTree:projection.baseTree,candidateTree:projection.candidateTree,
   intendedUntracked:projection.intendedUntracked,indexIdentity:projection.indexIdentity,sourceIdentity:projection.sourceIdentity,
  })).digest("hex");
  bindReviewSessionWorkspaceSource(session,projection,projectionRequest,{
   requestId,sessionId:input.sessionId,reviewerId:input.reviewerId,revision:projection.candidateTree,
   treeIdentity:projection.candidateTree,parentIdentity:projection.baseCommit??projection.baseTree,
  });
  assertReviewSessionOpen(session);
  const result=Object.freeze({requestId,session,projection,manifest});
  liveWorkspaceReviews.set(result,{session,projection,request:projectionRequest,requestId,sessionId:input.sessionId,reviewerId:input.reviewerId});
  return result;
 }catch(error){
  try{closeReviewSession(session);}catch{/* Preserve the original failure; cleanup failure is fail-closed. */}
  throw error;
 }
}

/** Materializes candidate evidence from Git objects and the owned view, never from agent summaries. */
export function readWorkspaceReviewEvidence(value:unknown):WorkspaceReviewEvidence{
 if(typeof value!=="object"||value===null)throw new Error("Workspace review session is not genuine");
 const claim=liveWorkspaceReviews.get(value);if(!claim||!isWorkspaceReviewProjectionGenuine(claim.projection))throw new Error("Workspace review session is not genuine");
 assertReviewSessionOpen(claim.session);
 const diff=diffWorkspaceReviewProjection(claim.projection,claim.request);
 assertReviewSessionOpen(claim.session);
 const projection=claim.projection,session=claim.session;
 const changedCandidateFiles=projection.entries.filter(entry=>entry.change!=="deleted"&&(entry.mode==="100644"||entry.mode==="100755"));
 const candidateFiles=Object.freeze(changedCandidateFiles.map(entry=>{
  const bytes=readReviewViewFile(session.view,entry.path);
  try{return Object.freeze({path:entry.path,encoding:"utf8" as const,content:new TextDecoder("utf-8",{fatal:true}).decode(bytes)});}
  catch{return Object.freeze({path:entry.path,encoding:"base64" as const,content:bytes.toString("base64")});}
 }));
 assertReviewSessionOpen(session);
 const evidence=Object.freeze({
  schemaVersion:1 as const,requestId:claim.requestId,sessionId:claim.sessionId,reviewerId:claim.reviewerId,
  candidate:Object.freeze({revision:projection.candidateTree,treeIdentity:projection.candidateTree,parentIdentity:projection.baseCommit??projection.baseTree,repositoryRoot:projection.repositoryRoot}),
  repositoryState:Object.freeze({baseCommit:projection.baseCommit,baseTree:projection.baseTree,candidateTree:projection.candidateTree,indexIdentity:projection.indexIdentity,sourceIdentity:projection.sourceIdentity,intendedUntracked:projection.intendedUntracked,unexpectedUntracked:projection.unexpectedUntracked}),
  modifiedFiles:Object.freeze(projection.entries.map(entry=>Object.freeze({path:entry.path,change:entry.change,mode:entry.mode,objectId:entry.objectId,contentSha256:entry.contentSha256}))),
  candidateFiles,
  diff,tests:Object.freeze({status:"not-run" as const,records:Object.freeze([] as string[])}),risks:session.risk,
  evidence:Object.freeze({manifestTreeSha256:claim.session.view.manifestDigest,manifestEntries:claim.session.view.entryCount,viewIdentity:claim.session.view.viewIdentity}),
 });
 issuedWorkspaceEvidence.add(evidence);return evidence;
}

/** Explicitly closes the view owned by a workspace review session. */
export function closeWorkspaceReview(value:unknown):void{
 if(typeof value!=="object"||value===null)throw new Error("Workspace review session is not genuine");
 const claim=liveWorkspaceReviews.get(value);if(!claim)throw new Error("Workspace review session is not genuine");
 closeReviewSession(claim.session);liveWorkspaceReviews.delete(value);
}
