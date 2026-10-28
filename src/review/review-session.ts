import {createHash} from "node:crypto";
import type {CandidateGitTreeManifest} from "./review-tree-inspection.js";
import {materializeReviewView,disposeReviewView,revalidateReviewView,type ReviewView} from "./review-view.js";
import {planReviewRisk,type ReviewPlan,type ReviewRiskInput} from "./review-risk.js";
import {assertOrdinaryReviewCheckoutGenuine,revalidateOrdinaryReviewCheckout,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";

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
interface SessionClaim{state:"open"|"closed"|"invalid";manifest:CandidateGitTreeManifest;checkout?:OrdinaryReviewCheckout;rddClaimed?:boolean;}
const claims=new WeakMap<object,SessionClaim>();

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

export function assertReviewSessionCurrent(session:ReviewSession):void{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||session.state!=="open")throw new Error("Review session is closed or not genuine");
 try{if(claim.checkout)revalidateOrdinaryReviewCheckout(claim.checkout);revalidateReviewView(session.view,claim.manifest);}catch{claim.state="invalid";throw new Error("Review session candidate is stale; previous approval invalidated");}
}

/** Transfers genuine session provenance to one RDD-result receiver. */
export function claimReviewSessionRddSource(session:ReviewSession):Readonly<{checkout:OrdinaryReviewCheckout;assertCurrent:()=>void}>{
 const claim=claims.get(session);if(!claim||claim.state!=="open"||!claim.checkout||claim.rddClaimed)throw new Error("Review session is unavailable for RDD result binding");
 claim.rddClaimed=true;assertReviewSessionCurrent(session);return Object.freeze({checkout:claim.checkout,assertCurrent:()=>assertReviewSessionCurrent(session)});
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
