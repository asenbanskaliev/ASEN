/** EF-604 single-call native Pi streaming interruption evidence.
 * This verifies a bounded receipt only. It does not certify A/B parity,
 * recovery of a TUI parent turn or a human Writer authorization. */
import assert from "node:assert/strict";
const exact=(x,fields)=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).sort().join("|")===fields.slice().sort().join("|");
const keys=[
 "schema","candidateSha","status","piVersion","provider","model",
 "nativeChildProcess","assistantTextDeltaObserved",
 "assistantTextDeltaCount","assistantCharactersObserved",
 "nativeProcessClosedNonzero","durableState","reopenDifferentOsProcess",
 "noticeDelivery","providerCallsReserved","replayedCalls",
 "projectUnchanged","noTools","writerAuthorized","humanConsent",
 "fullInteractiveHostRecovery","independentABParity","globalFull"
];
export function gradeStreamInterruptionEvidence(value,expectedSha){
 assert.ok(exact(value,keys),"Incorrect stream interruption evidence shape");
 assert.match(expectedSha??"",/^[0-9a-f]{40}$/u);
 assert.equal(value.schema,"asen-pi-stream-interruption/v1");
 assert.equal(value.candidateSha,expectedSha,"Evidence SHA does not match immutable checkout");
 assert.equal(value.status,"PASS_REAL_PI_STREAM_INTERRUPTED_AND_REOPENED_BOUNDED");
 assert.equal(value.piVersion,"1.2.0");
 assert.equal(value.provider,"ollama-cloud");
 assert.ok(value.model==="beam"||value.model==="beam:cloud","No unregistered provider model");
 assert.equal(value.nativeChildProcess,true);
 assert.equal(value.assistantTextDeltaObserved,true);
 assert.ok(Number.isSafeInteger(value.assistantTextDeltaCount)&&value.assistantTextDeltaCount>=1&&value.assistantTextDeltaCount<=100,
  "Native Pi must yield at least one bounded assistant text delta");
 assert.ok(Number.isSafeInteger(value.assistantCharactersObserved)&&
  value.assistantCharactersObserved>0&&value.assistantCharactersObserved<=409600);
 assert.equal(value.nativeProcessClosedNonzero,true);
 assert.equal(value.durableState,"cancelled");
 assert.equal(value.reopenDifferentOsProcess,true);
 assert.equal(value.noticeDelivery,"pending");
 assert.equal(value.providerCallsReserved,1,"Only one model invocation may be reserved");
 assert.equal(value.replayedCalls,0);
 assert.equal(value.projectUnchanged,true);
 assert.equal(value.noTools,true);
 for(const k of ["writerAuthorized","humanConsent","fullInteractiveHostRecovery",
  "independentABParity","globalFull"])assert.equal(value[k],false,"No authority or global FULL from "+k);
 return Object.freeze({status:value.status,candidateSha:value.candidateSha,
  boundedStreaming:true,providerCallsReserved:1,writerAuthorized:false,globalFull:false});
}
