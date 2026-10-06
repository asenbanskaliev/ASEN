import {createHash} from "node:crypto";import {claimBoundOrdinaryReviewResult,type BoundOrdinaryReviewResult} from "./native-rdd-result.js";
export interface CorrectionRequest{readonly correctionId:string;readonly reviewResultId:string;readonly revision:string;readonly status:"correction-required";readonly round:1;}
export interface CorrectionValidation{readonly correctionId:string;readonly priorRevision:string;readonly correctedRevision:string;readonly validation:"pass"|"fail";readonly status:"validated";}
const live=new WeakMap<object,{review:BoundOrdinaryReviewResult;used:boolean}>();
/** Opens at most one bounded correction for a genuine failed ordinary review. */
export function openBoundedCorrection(value:unknown):CorrectionRequest{
 const review=claimBoundOrdinaryReviewResult(value);if(review.verdict!=="fail")throw new Error("Correction requires a failed RDD review");
 const payload={reviewResultId:review.resultId,revision:review.revision,status:"correction-required" as const,round:1 as const};
 const request=Object.freeze({...payload,correctionId:createHash("sha256").update("asen.review-correction.v1\0").update(JSON.stringify(payload)).digest("hex")});live.set(request,{review,used:false});return request;
}
/** Records validation only. It never grants delivery, merge, release or another correction. */
export function validateBoundedCorrection(request:unknown,input:{priorRevision:string;correctedRevision:string;validation:"pass"|"fail"}):CorrectionValidation{
 const state=typeof request==="object"&&request!==null?live.get(request):undefined;if(!state||state.used)throw new Error("Correction request is not live");state.used=true;
 if(typeof input!=="object"||input===null||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==3)throw new Error("Correction validation must be exact plain data");
 if(input.priorRevision!==state.review.revision||typeof input.correctedRevision!=="string"||!input.correctedRevision||input.correctedRevision.trim()!==input.correctedRevision||input.correctedRevision!==input.correctedRevision.normalize("NFC")||/[\\u0000-\\u001f\\u007f-\\u009f]/u.test(input.correctedRevision)||input.correctedRevision===input.priorRevision||(input.validation!=="pass"&&input.validation!=="fail"))throw new Error("Correction validation does not bind the reviewed revision");
 return Object.freeze({correctionId:(request as CorrectionRequest).correctionId,priorRevision:input.priorRevision,correctedRevision:input.correctedRevision,validation:input.validation,status:"validated"});
}
