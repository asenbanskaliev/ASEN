/** EF-603: evidence for ONE genuine Pi RPC Beam Explorer despite concurrent
 * equivalent ASEN launches. The receipt cannot certify upstream A/B parity.
 * Fail closed on added provider calls, Writer, wrong SHA or altered repository.
 */
import assert from "node:assert/strict";
const keys=[
 "schema","candidateSha","status","piVersion","provider","model",
 "logicalRequests","uniqueAgentIds","nativePiProcessCount",
 "providerCallsReserved","durableAgents","durableState","role",
 "reviewerVerifierPolicy","sameSession","sameProject","gitUnchanged",
 "noTools","writerAuthorized","humanConsent","independentABParity",
 "globalFull",
];
const exact=(v,expected)=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&
 Object.keys(v).sort().join("|")===expected.slice().sort().join("|");
export function gradeEf603LiveCoalescing(report,sha){
 assert.match(sha??"",/^[a-f0-9]{40}$/u);
 assert.ok(exact(report,keys),"EF-603 real receipt requires exact bounded shape");
 assert.equal(report.schema,"asen-ef603-real-pi-coalescing/v1");
 assert.equal(report.candidateSha,sha);
 assert.equal(report.status,"PASS_REAL_PI_EXPLORER_ONE_EXECUTION");
 assert.equal(report.piVersion,"1.2.0");
 assert.equal(report.provider,"ollama-cloud");
 assert.ok(report.model==="beam"||report.model==="beam:cloud");
 assert.equal(report.logicalRequests,3);
 assert.equal(report.uniqueAgentIds,1);
 assert.equal(report.nativePiProcessCount,1);
 assert.equal(report.providerCallsReserved,1);
 assert.equal(report.durableAgents,1);
 assert.equal(report.durableState,"completed");
 assert.equal(report.role,"explorer");
 assert.equal(report.reviewerVerifierPolicy,"DISTINCT_RUNS_NO_COALESCING");
 assert.equal(report.sameSession,true);
 assert.equal(report.sameProject,true);
 assert.equal(report.gitUnchanged,true);
 assert.equal(report.noTools,true);
 for(const key of ["writerAuthorized","humanConsent","independentABParity","globalFull"])
  assert.equal(report[key],false,"EF-603 cannot confer "+key);
 return Object.freeze({status:report.status,candidateSha:sha,
  authenticatedNativePi:true,oneNativePiProcess:true,oneProviderCallReserved:true,providerCallsActuallyObserved:null,writerAuthorized:false,globalFull:false});
}
