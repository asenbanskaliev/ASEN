import {createHash} from "node:crypto";
import {isProxy} from "node:util/types";
import {claimWorkUnitReviewCandidate,type WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
import {exactRecord,text} from "../delivery/work-unit-policy.js";
export interface OrdinaryReviewInput{
 readonly authorId:string;readonly reviewerId:string;readonly sessionId:string;
}
export interface OrdinaryReviewRequest{
 readonly schemaVersion:1;readonly requestId:string;readonly status:"prepared";
 readonly candidate:WorkUnitReviewCandidate;readonly participants:Readonly<OrdinaryReviewInput>;
}
const issued=new WeakSet<object>(),consumed=new WeakSet<object>();
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
