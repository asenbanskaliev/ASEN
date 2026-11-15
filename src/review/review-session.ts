import {createHash} from "node:crypto";
import type {CandidateGitTreeManifest} from "./review-tree-inspection.js";
import {materializeReviewView,disposeReviewView,revalidateReviewView,type ReviewView} from "./review-view.js";
import {planReviewRisk,type ReviewPlan,type ReviewRiskInput} from "./review-risk.js";
import {assertOrdinaryReviewCheckoutGenuine,revalidateOrdinaryReviewCheckout,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import {isWorkspaceReviewProjectionGenuine,revalidateWorkspaceReviewProjection,type WorkspaceReviewProjection,type WorkspaceReviewProjectionRequest} from "./workspace-review-projection.js";
import {isProxy} from "node:util/types";

export type ReviewSessionState="open"|"closed";
export interface ReviewSession{
 readonly schemaVersion:1;
 readonly checkoutRepository:string;
 readonly checkoutTree:string;
 readonly view:ReviewView;
 readonly risk:ReviewPlan;
 readonly inputDigest:string;
 readonly state:ReviewSessionState;
}
interface SessionClaim{state:"open"|"closed"|"invalid";manifest:CandidateGitTreeManifest;checkout?:OrdinaryReviewCheckout;workspace?:{projection:WorkspaceReviewProjection;request:WorkspaceReviewProjectionRequest;review:WorkspaceReviewIdentity};rddClaimed?:boolean;}
const claims=new WeakMap<object,SessionClaim>();
export interface WorkspaceReviewIdentity{readonly requestId:string;readonly sessionId:string;readonly reviewerId:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;}
function exactWorkspaceIdentity(value:unknown):WorkspaceReviewIdentity{
 const keys=["requestId","sessionId","reviewerId","revision","treeIdentity","parentIdentity"] as const;
 if(typeof value!=="object"||value===null||isProxy(value)||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("Review session workspace identity is invalid");
 const descriptors=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(descriptors);
 if(own.length!==keys.length||own.some(key=>typeof key!=="string"||!keys.includes(key as typeof keys[number])))throw new Error("Review session workspace identity is invalid");
 const output={} as Record<typeof keys[number],string>;
 for(const key of keys){const item=descriptors[key];if(!item?.enumerable||!("value" in item)||typeof item.value!=="string"||!item.value||item.value!==item.value.trim()||item.value!==item.value.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(item.value))throw new Error("Review session workspace identity is invalid");output[key]=item.value;}
 return Object.freeze(output);
}

function digest(repository:string,tree:string,risk:ReviewPlan):string{
 return createHash("sha256").update("asen.review-session.v1\0").update(JSON.stringify({repository,tree,risk})).digest("hex");
}

export function openReviewSession(repository:string,manifest:CandidateGitTreeManifest,parent:string,riskInput:ReviewRiskInput):ReviewSession{
 if(typeof repository!=="string"||!repository)throw new Error("Review session repository is invalid");
 if(manifest.repositoryRoot!==repository)throw new Error("Review session manifest does not bind the checkout");
 const risk=planReviewRisk(riskInput);
 const view=materializeReviewView(manifest,parent);
 const session=Object.freeze({schemaVersion:1 as const,checkoutRepository:repository,checkoutTree:manifest.treeIdentity,view,risk,inputDigest:digest(repository,manifest.treeIdentity,risk),state:"open" as const});
 claims.set(session,{state:"open",manifest});return session;
}

/** Keeps source provenance private to the session; serialized clones cannot inherit it. */
export function bindReviewSessionSource(session:ReviewSession,checkout:OrdinaryReviewCheckout):void{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||claim.checkout)throw new Error("Review session source binding is unavailable");
 assertOrdinaryReviewCheckoutGenuine(checkout);
 if(checkout.repository!==session.checkoutRepository||checkout.treeIdentity!==session.checkoutTree)throw new Error("Review session source does not bind its exact candidate");
 revalidateOrdinaryReviewCheckout(checkout);claim.checkout=checkout;
}

/** Binds a session to an issued workspace projection; caller callbacks cannot supply freshness policy. */
export function bindReviewSessionWorkspaceSource(session:ReviewSession,projection:WorkspaceReviewProjection,request:WorkspaceReviewProjectionRequest,identity:WorkspaceReviewIdentity):void{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||claim.checkout||claim.workspace)throw new Error("Review session workspace binding is unavailable");
 if(!isWorkspaceReviewProjectionGenuine(projection))throw new Error("Review session workspace projection is not genuine");
 const boundIdentity=exactWorkspaceIdentity(identity);
 if(projection.repositoryRoot!==session.checkoutRepository||projection.candidateTree!==session.checkoutTree||boundIdentity.treeIdentity!==projection.candidateTree||boundIdentity.revision!==projection.candidateTree||boundIdentity.parentIdentity!==(projection.baseCommit??projection.baseTree))throw new Error("Review session workspace source does not bind its exact candidate");
 const current=revalidateWorkspaceReviewProjection(projection,request);
 if(current.candidateTree!==session.checkoutTree)throw new Error("Review session workspace candidate drifted");
 claim.workspace={projection,request:Object.freeze({repositoryRoot:current.repositoryRoot,intendedUntracked:Object.freeze([...current.intendedUntracked])}),review:boundIdentity};
}

export function assertReviewSessionCurrent(session:ReviewSession):void{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||session.state!=="open")throw new Error("Review session is closed or not genuine");
 try{if(claim.checkout)revalidateOrdinaryReviewCheckout(claim.checkout);if(claim.workspace)revalidateWorkspaceReviewProjection(claim.workspace.projection,claim.workspace.request);revalidateReviewView(session.view,claim.manifest);}catch{claim.state="invalid";throw new Error("Review session candidate is stale; previous approval invalidated");}
}

/** Transfers genuine session provenance to one RDD-result receiver. */
export interface ReviewSessionRddSource{
 readonly requestId:string;readonly sessionId:string;readonly reviewerId:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;
 assertCurrent():void;
}
export function claimReviewSessionRddSource(session:ReviewSession):ReviewSessionRddSource{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||(!claim.checkout&&!claim.workspace)||claim.rddClaimed)throw new Error("Review session is unavailable for RDD result binding");
 claim.rddClaimed=true;assertReviewSessionCurrent(session);
 const source=claim.checkout?{
  requestId:claim.checkout.request.requestId,sessionId:claim.checkout.request.participants.sessionId,reviewerId:claim.checkout.request.participants.reviewerId,
  revision:claim.checkout.revision,treeIdentity:claim.checkout.treeIdentity,parentIdentity:claim.checkout.parentIdentity,
 }:claim.workspace!.review;
 return Object.freeze({...source,assertCurrent:()=>assertReviewSessionCurrent(session)});
}

export function revalidateReviewSession(session:ReviewSession,manifest:CandidateGitTreeManifest):ReviewSession{
 assertReviewSessionCurrent(session);
 if(manifest.repositoryRoot!==session.checkoutRepository||manifest.treeIdentity!==session.checkoutTree)throw new Error("Review session checkout drifted");
 revalidateReviewView(session.view,manifest);
 return session;
}

export function closeReviewSession(session:ReviewSession):ReviewSession{
 const claim=claims.get(session);if(!claim||claim.state==="closed"||session.state!=="open")throw new Error("Review session is already closed or not genuine");
 disposeReviewView(session.view);
 claim.state="closed";const closed=Object.freeze({...session,state:"closed" as const});claims.set(closed,{...claim,state:"closed"});return closed;
}

export function assertReviewSessionOpen(session:ReviewSession):void{
 assertReviewSessionCurrent(session);
}
