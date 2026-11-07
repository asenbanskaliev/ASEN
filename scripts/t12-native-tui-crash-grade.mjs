import assert from "node:assert/strict";
/** EF-604 acceptance contract: two native TUI hosts and an actual Pi RPC
 * process, but NO model turn or real-inference resume. Evidence isn't self-FULL.
 */
const fields=[
 "schema","candidateSha","status","piVersion","platform","hostProcesses",
 "parentForceKilled","childPiRpcActiveAtParentDeath","nativePiRpcGetState",
 "sessionIdReused","durableAgentState","pendingNotices","uncertainNotices",
 "ackBlocked","providerCalls","replayedCalls","writerAuthorized","humanConsent",
 "modelStreamInterrupted","fullInteractiveHostRecovery","sourceGitUnchanged",
 "globalFull","tuiOutputSha256",
];
export function gradeNativeTuiCrashRecovery(report,sha){
 assert.match(sha??"",/^[a-f0-9]{40}$/u);
 assert.ok(report&&typeof report==="object"&&!Array.isArray(report));
 assert.deepEqual(Object.keys(report).sort(),fields.slice().sort(),"Unknown/native Pi report fields");
 assert.equal(report.schema,"asen-native-pi-tui-crash-recovery/v1");
 assert.equal(report.candidateSha,sha);
 assert.equal(report.status,"PASS_NATIVE_TUI_PARENT_CRASH_WITH_ACTIVE_PI_RPC_CHILD");
 assert.equal(report.piVersion,"1.2.0");
 assert.equal(report.platform,"linux");
 assert.equal(report.hostProcesses,2);
 for(const key of ["parentForceKilled","childPiRpcActiveAtParentDeath",
  "nativePiRpcGetState","sessionIdReused","sourceGitUnchanged"])
  assert.equal(report[key],true,"Missing native host evidence "+key);
 assert.equal(report.durableAgentState,"interrupted");
 assert.equal(report.pendingNotices,1);
 assert.equal(report.uncertainNotices,1);
 assert.equal(report.ackBlocked,2);
 for(const key of ["providerCalls","replayedCalls"])assert.equal(report[key],0,"No model replay permitted");
 for(const key of ["writerAuthorized","humanConsent","modelStreamInterrupted",
  "fullInteractiveHostRecovery","globalFull"])
  assert.equal(report[key],false,"Not allowed to promote "+key);
 assert.match(report.tuiOutputSha256,/^[a-f0-9]{64}$/u);
 return Object.freeze({status:report.status,candidateSha:sha,readOnly:true,
  actualHostCrash:true,hasModelResumptionProof:false,globalFull:false});
}
