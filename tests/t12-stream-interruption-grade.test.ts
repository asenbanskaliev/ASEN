import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error JS-only strict receipt contract used by the real Pi acceptance.
import {gradeStreamInterruptionEvidence} from "../scripts/t12-stream-interruption-grade.mjs";
const sha="e".repeat(40);
const base=()=>({
 schema:"asen-pi-stream-interruption/v1",
 candidateSha:sha,status:"PASS_REAL_PI_STREAM_INTERRUPTED_AND_REOPENED_BOUNDED",
 piVersion:"1.2.0",provider:"ollama-cloud",model:"beam:cloud",
 nativeChildProcess:true,assistantTextDeltaObserved:true,
 assistantTextDeltaCount:1,assistantCharactersObserved:14,
 nativeProcessClosedNonzero:true,durableState:"cancelled",
 reopenDifferentOsProcess:true,noticeDelivery:"pending",
 providerCallsReserved:1,replayedCalls:0,projectUnchanged:true,
 noTools:true,writerAuthorized:false,humanConsent:false,
 fullInteractiveHostRecovery:false,independentABParity:false,globalFull:false,
});
test("EF-604 bounded authentic stream interruption receipt never elevates authority",()=>{
 const result=gradeStreamInterruptionEvidence(base(),sha);
 assert.equal(result.boundedStreaming,true);
 assert.equal(result.providerCallsReserved,1);
 assert.equal(result.writerAuthorized,false);
 assert.equal(result.globalFull,false);
});
test("EF-604 forged streaming, wrong process, untrusted provider and replay are all rejected",()=>{
 const changes:Array<(x:any)=>void>=[
  x=>x.candidateSha="a".repeat(40),
  x=>x.status="PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED",
  x=>x.piVersion="1.1.0",
  x=>x.provider="openrouter",
  x=>x.model="unregistered-fallback",
  x=>x.nativeChildProcess=false,
  x=>x.assistantTextDeltaObserved=false,
  x=>x.assistantTextDeltaCount=0,
  x=>x.assistantTextDeltaCount=101,
  x=>x.assistantCharactersObserved=0,
  x=>x.assistantCharactersObserved=500000,
  x=>x.nativeProcessClosedNonzero=false,
  x=>x.durableState="completed",
  x=>x.reopenDifferentOsProcess=false,
  x=>x.noticeDelivery="enqueued",
  x=>x.providerCallsReserved=2,
  x=>x.replayedCalls=1,
  x=>x.projectUnchanged=false,
  x=>x.noTools=false,
  x=>x.writerAuthorized=true,
  x=>x.humanConsent=true,
  x=>x.fullInteractiveHostRecovery=true,
  x=>x.independentABParity=true,
  x=>x.globalFull=true,
  x=>x.unverifiedField="FORGED",
 ];
 for(const [index,mutate] of changes.entries()){
  const x=base();mutate(x);
  assert.throws(()=>gradeStreamInterruptionEvidence(x,sha),Error,
   "Forgery variant "+index+" must be rejected");
 }
});
