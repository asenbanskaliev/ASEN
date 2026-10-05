import {createHash} from "node:crypto";
import {claimOrdinaryReviewCheckout,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
export type NativeRddVerdict="pass"|"fail";
export interface NativeRddResult{readonly schemaVersion:1;readonly requestId:string;readonly sessionId:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;readonly reviewerId:string;readonly verdict:NativeRddVerdict;readonly summary:string;}
export interface BoundOrdinaryReviewResult extends NativeRddResult{readonly resultId:string;readonly status:"observed";}
const live=new WeakMap<object,OrdinaryReviewCheckout>(),used=new WeakSet<object>(),issuedResults=new WeakSet<object>(),claimedResults=new WeakSet<object>();
const text=(v:unknown,n:string):string=>{if(typeof v!=="string"||!v||v.trim()!==v||v!==v.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(v))throw new Error(`${n} is malformed`);return v;};
function exact(value:unknown):NativeRddResult{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("RDD result must be exact plain data");
 const keys=["schemaVersion","requestId","sessionId","revision","treeIdentity","parentIdentity","reviewerId","verdict","summary"] as const,own=Reflect.ownKeys(value);
 if(own.length!==keys.length||own.some(k=>typeof k!=="string"||!keys.includes(k as typeof keys[number]))||keys.some(k=>!Object.hasOwn(value,k)))throw new Error("RDD result shape is invalid");
 const r=Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!("value" in d))throw new Error("RDD result shape is invalid");return [k,d.value];}));if(r.schemaVersion!==1||(r.verdict!=="pass"&&r.verdict!=="fail"))throw new Error("RDD result value is invalid");
 return {schemaVersion:1,requestId:text(r.requestId,"request"),sessionId:text(r.sessionId,"session"),revision:text(r.revision,"revision"),treeIdentity:text(r.treeIdentity,"tree"),parentIdentity:text(r.parentIdentity,"parent"),reviewerId:text(r.reviewerId,"reviewer"),verdict:r.verdict,summary:text(r.summary,"summary")};
}
/** Creates a one-use receiver from genuine checkout provenance; it creates no RDD authority. */
export function awaitNativeRddResult(value:OrdinaryReviewCheckout):Readonly<Record<string,never>>{const checkout=claimOrdinaryReviewCheckout(value),handle=Object.freeze({});live.set(handle,checkout);return handle;}
/** Binds externally observed RDD data to the exact candidate. PASS remains descriptive, never delivery authority. */
export function bindNativeRddResult(handle:unknown,value:unknown):BoundOrdinaryReviewResult{
 if(typeof handle!=="object"||handle===null||!live.has(handle)||used.has(handle))throw new Error("RDD observation handle is not live");
 used.add(handle);const checkout=live.get(handle)!,result=exact(value),q=checkout.request;
 if(result.requestId!==q.requestId||result.sessionId!==q.participants.sessionId||result.reviewerId!==q.participants.reviewerId||result.revision!==checkout.revision||result.treeIdentity!==checkout.treeIdentity||result.parentIdentity!==checkout.parentIdentity)throw new Error("RDD result does not bind the exact review candidate");
 const payload={...result,status:"observed" as const};return Object.freeze({...payload,resultId:createHash("sha256").update("asen.native-rdd-result.v1\0").update(JSON.stringify(payload)).digest("hex")});
}

/** One-use provenance handoff to correction/review controllers. */
export function claimBoundOrdinaryReviewResult(value:unknown):BoundOrdinaryReviewResult{
 if(typeof value!=="object"||value===null||!issuedResults.has(value))throw new Error("Bound RDD result was not issued here");
 if(claimedResults.has(value))throw new Error("Bound RDD result was already consumed");claimedResults.add(value);return value as BoundOrdinaryReviewResult;
}
