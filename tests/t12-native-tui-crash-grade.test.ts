import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Intentional ESM-only receipt grader, independent of TypeScript host types.
import {gradeNativeTuiCrashRecovery} from "../scripts/t12-native-tui-crash-grade.mjs";
const sha="c".repeat(40);
const valid=()=>({
 schema:"asen-native-pi-tui-crash-recovery/v1",candidateSha:sha,
 status:"PASS_NATIVE_TUI_PARENT_CRASH_WITH_ACTIVE_PI_RPC_CHILD",
 piVersion:"1.2.0",platform:"linux",hostProcesses:2,
 parentForceKilled:true,childPiRpcActiveAtParentDeath:true,
 nativePiRpcGetState:true,sessionIdReused:true,
 durableAgentState:"interrupted",pendingNotices:1,
 uncertainNotices:1,ackBlocked:2,providerCalls:0,replayedCalls:0,
 writerAuthorized:false,humanConsent:false,modelStreamInterrupted:false,
 fullInteractiveHostRecovery:false,sourceGitUnchanged:true,
 globalFull:false,tuiOutputSha256:"d".repeat(64)
});
test("EF-604 native Pi TUI crash grader keeps authentic-host scope separate from model FULL",()=>{
 const x=gradeNativeTuiCrashRecovery(valid(),sha);
 assert.equal(x.actualHostCrash,true);
 assert.equal(x.hasModelResumptionProof,false);
 assert.equal(x.globalFull,false);
});
test("EF-604 native Pi host crash report rejects mismatched identity, missing processes and fake Writer authority",()=>{
 const alterations:Array<(x:any)=>void>=[
  x=>x.candidateSha="e".repeat(40),
  x=>x.status="FULL",
  x=>x.piVersion="1.1.0",
  x=>x.platform="win32",
  x=>x.hostProcesses=1,
  x=>x.parentForceKilled=false,
  x=>x.childPiRpcActiveAtParentDeath=false,
  x=>x.nativePiRpcGetState=false,
  x=>x.sessionIdReused=false,
  x=>x.durableAgentState="completed",
  x=>x.pendingNotices=0,
  x=>x.uncertainNotices=0,
  x=>x.ackBlocked=1,
  x=>x.providerCalls=1,
  x=>x.replayedCalls=1,
  x=>x.writerAuthorized=true,
  x=>x.humanConsent=true,
  x=>x.modelStreamInterrupted=true,
  x=>x.fullInteractiveHostRecovery=true,
  x=>x.sourceGitUnchanged=false,
  x=>x.globalFull=true,
  x=>x.tuiOutputSha256="fake",
  x=>x.extra="unreviewed"
 ];
 for(const [i,modify] of alterations.entries()){
  const report=valid();modify(report);
  assert.throws(()=>gradeNativeTuiCrashRecovery(report,sha),Error,
   "Forged native TUI crash proof variant "+i);
 }
});
