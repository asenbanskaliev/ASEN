import {execFileSync} from "node:child_process";
import {lstatSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {isProxy} from "node:util/types";
import {claimWorkUnitReviewCandidate,type WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {exactRecord,text} from "../delivery/work-unit-policy.js";
import {materializeReviewView,type ReviewView} from "./review-view.js";
import {bindReviewSessionSource,openReviewSession,type ReviewSession} from "./review-session.js";
import type {ReviewRiskInput} from "./review-risk.js";
import type {CandidateGitTreeManifest} from "./review-tree-inspection.js";
export interface OrdinaryReviewInput{
 readonly authorId:string;readonly reviewerId:string;readonly sessionId:string;
}
export interface OrdinaryReviewRequest{
 readonly schemaVersion:1;readonly requestId:string;readonly status:"prepared";
 readonly candidate:WorkUnitReviewCandidate;readonly participants:Readonly<OrdinaryReviewInput>;
}
const issued=new WeakSet<object>(),consumed=new WeakSet<object>(),issuedCheckouts=new WeakSet<object>(),consumedCheckouts=new WeakSet<object>();
interface CheckoutClaim{readonly repository:string;readonly dev:number;readonly ino:number;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;}
const checkoutClaims=new WeakMap<object,CheckoutClaim>();
function observeCheckout(request:OrdinaryReviewRequest,root:string):{dev:number;ino:number;tree:string;parent:string}{
 const filesystem=lstatSync(root);if(!filesystem.isDirectory()||filesystem.isSymbolicLink())throw new Error("checkout root changed");const identity={dev:filesystem.dev,ino:filesystem.ino};
 const git=(...args:string[])=>execFileSync("git",["-c","core.fsmonitor=false","--no-replace-objects","-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],env:{PATH:process.env.PATH??"",HOME:process.platform==="win32"?process.env.USERPROFILE??"":process.env.HOME??"",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"",GIT_OPTIONAL_LOCKS:"0",GIT_NO_REPLACE_OBJECTS:"1",GIT_EXTERNAL_DIFF:"",GIT_TERMINAL_PROMPT:"0",GIT_ALLOW_PROTOCOL:"file"}}).trim();
 const rootIdentity=realpathSync(root);if(rootIdentity!==root)throw new Error("checkout path changed");
 const tags=git("ls-files","-v","-z").split("\0").filter(Boolean);if(tags.some(line=>line[0]!=="H"))throw new Error("index flags changed");
 if(git("status","--porcelain=v1","--untracked-files=all"))throw new Error("checkout is dirty");
 const head=git("rev-parse","HEAD"),tree=git("rev-parse","HEAD^{tree}"),parent=git("rev-parse","HEAD^");
 if(head!==request.candidate.revision||tree!==request.candidate.treeIdentity||parent!==request.candidate.completedWorkUnit.commit.parentIdentity)throw new Error("checkout identity changed");
 return {...identity,tree,parent};
}
function revalidateClaim(value:unknown):void{
 if(typeof value!=="object"||value===null)throw new Error("review checkout is not genuine");const claim=checkoutClaims.get(value);
 if(!claim)throw new Error("review checkout is not genuine");const checkout=value as OrdinaryReviewCheckout,info=observeCheckout(checkout.request,claim.repository);
 if(info.dev!==claim.dev||info.ino!==claim.ino||info.tree!==claim.treeIdentity||info.parent!==claim.parentIdentity)throw new Error("review checkout changed after preparation; stale approval rejected");
}
/** Preparación descriptiva: IDs declarados no autentican al usuario o al revisor. */
export function prepareOrdinaryReview(value:WorkUnitReviewCandidate,input:OrdinaryReviewInput):OrdinaryReviewRequest{
 const candidate=claimWorkUnitReviewCandidate(value);
 if(isProxy(input))throw new Error("La preparación requiere datos planos");
 const raw=exactRecord(input,["authorId","reviewerId","sessionId"],"preparación de revisión");
 const participants=Object.freeze({authorId:text(raw.authorId,"autor"),reviewerId:text(raw.reviewerId,"revisor"),sessionId:text(raw.sessionId,"sesión")});
 if(participants.authorId===participants.reviewerId)throw new Error("Autor y revisor deben ser distintos; no acredita autenticación");
 const requestId=createHash("sha256").update("asen.ordinary-review.preparation.v1\0").update(JSON.stringify({candidate,participants})).digest("hex");
 const request=Object.freeze({schemaVersion:1 as const,requestId,status:"prepared" as const,candidate,participants});
 issued.add(request);return request;
}
/** Traspaso único de preparación, nunca autoridad de revisión nativa. */
export function claimOrdinaryReviewRequest(value:unknown,sessionId:string):OrdinaryReviewRequest{
 if(typeof value!=="object"||value===null||!issued.has(value))throw new Error("Se requiere preparación genuina");
 if(consumed.has(value))throw new Error("La preparación ya fue consumida");
 consumed.add(value);const request=value as OrdinaryReviewRequest;
 if(typeof sessionId!=="string"||sessionId!==request.participants.sessionId)throw new Error("La sesión de preparación no coincide");
 return request;
}

export interface OrdinaryReviewCheckout{
 readonly request:OrdinaryReviewRequest;
 readonly repository:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;
}
/** Observa Git local; la relación URL→directorio sigue siendo una declaración del llamante. */
export function bindOrdinaryReviewCheckout(value:OrdinaryReviewRequest,sessionId:string,repository:string):OrdinaryReviewCheckout{
 const request=claimOrdinaryReviewRequest(value,sessionId);
 const root=text(repository,"repositorio local");let observed:{dev:number;ino:number;tree:string;parent:string};
 try{
  observed=observeCheckout(request,root);
 }catch{throw new Error("No se pudo verificar el checkout exacto de revisión");}
 const checkout=Object.freeze({request,repository:root,revision:request.candidate.revision,treeIdentity:observed.tree,parentIdentity:observed.parent});issuedCheckouts.add(checkout);checkoutClaims.set(checkout,{repository:root,dev:observed.dev,ino:observed.ino,revision:checkout.revision,treeIdentity:checkout.treeIdentity,parentIdentity:checkout.parentIdentity});return checkout;
}

/** Rechecks source identity after a reviewer has consumed its frozen view. */
export function revalidateOrdinaryReviewCheckout(value:unknown):void{revalidateClaim(value);}

/** Consumes genuine checkout provenance for an external review transaction. */
export function claimOrdinaryReviewCheckout(value:unknown):OrdinaryReviewCheckout{
 if(typeof value!=="object"||value===null||!issuedCheckouts.has(value))throw new Error("Se requiere checkout de revisión genuino");
 if(consumedCheckouts.has(value))throw new Error("El checkout de revisión ya fue consumido");
 consumedCheckouts.add(value);return value as OrdinaryReviewCheckout;
}

/** Binds one frozen tree manifest to the exact checkout before creating a reviewer view. */
export function materializeOrdinaryReviewView(value:unknown,parent:string,manifest:CandidateGitTreeManifest):ReviewView{
 const checkout=claimOrdinaryReviewCheckout(value);
 revalidateClaim(checkout);
 if(manifest.repositoryRoot!==checkout.repository||manifest.treeIdentity!==checkout.treeIdentity){
  throw new Error("Review view manifest does not bind the exact checkout");
 }
 return materializeReviewView(manifest,parent);
}

/** Opens the public review composition only from a genuine exact checkout. */
export function openOrdinaryReviewSession(value:unknown,parent:string,manifest:CandidateGitTreeManifest,risk:ReviewRiskInput):ReviewSession{
 const checkout=claimOrdinaryReviewCheckout(value);
 revalidateClaim(checkout);
 if(manifest.repositoryRoot!==checkout.repository||manifest.treeIdentity!==checkout.treeIdentity){
  throw new Error("Review session manifest does not bind the exact checkout");
 }
 const session=openReviewSession(checkout.repository,manifest,parent,risk);
 bindReviewSessionSource(session,checkout,()=>revalidateClaim(checkout));
 return session;
}
