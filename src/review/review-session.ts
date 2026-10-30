import {createHash} from "node:crypto";
import type {CandidateGitTreeManifest} from "./review-tree-inspection.js";
import {materializeReviewView,disposeReviewView,revalidateReviewView,type ReviewView} from "./review-view.js";
import {planReviewRisk,type ReviewPlan,type ReviewRiskInput} from "./review-risk.js";

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

function digest(repository:string,tree:string,risk:ReviewPlan):string{
 return createHash("sha256").update("asen.review-session.v1\0").update(JSON.stringify({repository,tree,risk})).digest("hex");
}

export function openReviewSession(repository:string,manifest:CandidateGitTreeManifest,parent:string,riskInput:ReviewRiskInput):ReviewSession{
 if(typeof repository!=="string"||!repository)throw new Error("Review session repository is invalid");
 if(manifest.repositoryRoot!==repository)throw new Error("Review session manifest does not bind the checkout");
 const risk=planReviewRisk(riskInput);
 const view=materializeReviewView(manifest,parent);
 return Object.freeze({schemaVersion:1 as const,checkoutRepository:repository,checkoutTree:manifest.treeIdentity,view,risk,inputDigest:digest(repository,manifest.treeIdentity,risk),state:"open" as const});
}

export function revalidateReviewSession(session:ReviewSession,manifest:CandidateGitTreeManifest):ReviewSession{
 if(session.state!=="open")throw new Error("Review session is closed");
 if(manifest.repositoryRoot!==session.checkoutRepository||manifest.treeIdentity!==session.checkoutTree)throw new Error("Review session checkout drifted");
 revalidateReviewView(session.view,manifest);
 return session;
}

export function closeReviewSession(session:ReviewSession):ReviewSession{
 if(session.state!=="open")throw new Error("Review session is already closed");
 disposeReviewView(session.view);
 return Object.freeze({...session,state:"closed" as const});
}

export function assertReviewSessionOpen(session:ReviewSession):void{
 if(session.state!=="open")throw new Error("Review session is closed");
}
