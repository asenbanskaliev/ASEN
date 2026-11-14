import {createHash} from "node:crypto";
import {claimOrdinaryReviewCheckout,revalidateOrdinaryReviewCheckout,type OrdinaryReviewCheckout} from "./ordinary-review-controller.js";
import {claimReviewSessionRddSource,type ReviewSession,type ReviewSessionRddSource} from "./review-session.js";
export type NativeRddVerdict="pass"|"fail";
export interface NativeRddResult{readonly schemaVersion:1;readonly requestId:string;readonly sessionId:string;readonly revision:string;readonly treeIdentity:string;readonly parentIdentity:string;readonly reviewerId:string;readonly verdict:NativeRddVerdict;readonly summary:string;}
export interface BoundOrdinaryReviewResult extends NativeRddResult{readonly resultId:string;readonly status:"observed";}
const live=new WeakMap<object,ReviewSessionRddSource>(),used=new WeakSet<object>(),issuedResults=new WeakSet<object>(),claimedResults=new WeakSet<object>(),resultFreshness=new WeakMap<object,()=>void>();
const text=(v:unknown,n:string):string=>{if(typeof v!=="string"||!v||v.trim()!==v||v!==v.normalize("NFC")||/[\u0000-\u001f\u007f-\u009f]/u.test(v))throw new Error(`${n} is malformed`);return v;};
function exact(value:unknown):NativeRddResult{
 if(typeof value!=="object"||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error("RDD result must be exact plain data");
 const keys=["schemaVersion","requestId","sessionId","revision","treeIdentity","parentIdentity","reviewerId","verdict","summary"] as const,own=Reflect.ownKeys(value);
 if(own.length!==keys.length||own.some(k=>typeof k!=="string"||!keys.includes(k as typeof keys[number]))||keys.some(k=>!Object.hasOwn(value,k)))throw new Error("RDD result shape is invalid");
 const r=Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!("value" in d))throw new Error("RDD result shape is invalid");return [k,d.value];}));if(r.schemaVersion!==1||(r.verdict!=="pass"&&r.verdict!=="fail"))throw new Error("RDD result value is invalid");
 return {schemaVersion:1,requestId:text(r.requestId,"request"),sessionId:text(r.sessionId,"session"),revision:text(r.revision,"revision"),treeIdentity:text(r.treeIdentity,"tree"),parentIdentity:text(r.parentIdentity,"parent"),reviewerId:text(r.reviewerId,"reviewer"),verdict:r.verdict,summary:text(r.summary,"summary")};
}
/** Creates a one-use receiver from genuine checkout provenance; it creates no RDD authority. */
export function awaitNativeRddResult(value:OrdinaryReviewCheckout|ReviewSession):Readonly<Record<string,never>>{
 const source="view" in value?claimReviewSessionRddSource(value):(()=>{const checkout=claimOrdinaryReviewCheckout(value);return Object.freeze({
  requestId:checkout.request.requestId,sessionId:checkout.request.participants.sessionId,reviewerId:checkout.request.participants.reviewerId,
  revision:checkout.revision,treeIdentity:checkout.treeIdentity,parentIdentity:checkout.parentIdentity,
  assertCurrent:()=>revalidateOrdinaryReviewCheckout(checkout),
 });})();
 const handle=Object.freeze({});live.set(handle,source);return handle;
}
/** Binds externally observed RDD data to the exact candidate. PASS remains descriptive, never delivery authority. */
export function bindNativeRddResult(handle:unknown,value:unknown):BoundOrdinaryReviewResult{
 if(typeof handle!=="object"||handle===null||!live.has(handle)||used.has(handle))throw new Error("RDD observation handle is not live");
 used.add(handle);const source=live.get(handle)!;source.assertCurrent();const result=exact(value);
 if(result.requestId!==source.requestId||result.sessionId!==source.sessionId||result.reviewerId!==source.reviewerId||result.revision!==source.revision||result.treeIdentity!==source.treeIdentity||result.parentIdentity!==source.parentIdentity)throw new Error("RDD result does not bind the exact review candidate");
 const payload={...result,status:"observed" as const},bound=Object.freeze({...payload,resultId:createHash("sha256").update("asen.native-rdd-result.v1\0").update(JSON.stringify(payload)).digest("hex")});issuedResults.add(bound);resultFreshness.set(bound,source.assertCurrent);return bound;
}

/** One-use provenance handoff to correction/review controllers. */
export function claimBoundOrdinaryReviewResult(value:unknown):BoundOrdinaryReviewResult{
 if(typeof value!=="object"||value===null||!issuedResults.has(value))throw new Error("Bound RDD result was not issued here");
 if(claimedResults.has(value))throw new Error("Bound RDD result was already consumed");claimedResults.add(value);assertBoundOrdinaryReviewResultCurrent(value as BoundOrdinaryReviewResult);return value as BoundOrdinaryReviewResult;
}

/** Rechecks source and candidate freshness at the acceptance boundary. */
export function assertBoundOrdinaryReviewResultCurrent(value:BoundOrdinaryReviewResult):void{
 if(typeof value!=="object"||value===null||!issuedResults.has(value))throw new Error("Bound RDD result was not issued here");
 const validate=resultFreshness.get(value);if(!validate)throw new Error("Bound RDD result freshness is unavailable");validate();
}
