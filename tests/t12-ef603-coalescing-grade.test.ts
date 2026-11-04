import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Provider-free ESM acceptance grader intentionally has no d.ts.
import {gradeEf603LiveCoalescing} from "../scripts/t12-ef603-coalescing-grade.mjs";
const sha="a".repeat(40);
const valid=()=>({
 schema:"asen-ef603-real-pi-coalescing/v1",candidateSha:sha,
 status:"PASS_REAL_PI_EXPLORER_ONE_EXECUTION",piVersion:"1.2.0",
 provider:"ollama-cloud",model:"beam",logicalRequests:3,
 uniqueAgentIds:1,nativePiProcessCount:1,providerCallsReserved:1,
 durableAgents:1,durableState:"completed",role:"explorer",
 reviewerVerifierPolicy:"DISTINCT_RUNS_NO_COALESCING",
 sameSession:true,sameProject:true,gitUnchanged:true,noTools:true,
 writerAuthorized:false,humanConsent:false,independentABParity:false,globalFull:false
});
test("EF-603 strict grader admits only one real Pi Explorer execution, never global FULL",()=>{
 assert.equal(gradeEf603LiveCoalescing(valid(),sha).oneProviderCall,true);
 assert.equal(gradeEf603LiveCoalescing({...valid(),model:"beam:cloud"},sha).globalFull,false);
});
test("EF-603 fail-closed mutation tests prevent dual calls, role aliases, stale SHA and fake permissions",()=>{
 const mutations:Array<(x:any)=>void>=[
  x=>x.schema="wrong",x=>x.candidateSha="b".repeat(40),
  x=>x.status="PASS_FULL",x=>x.piVersion="1.1.0",
  x=>x.provider="paid",x=>x.model="other",
  x=>x.logicalRequests=2,x=>x.logicalRequests=4,
  x=>x.uniqueAgentIds=2,x=>x.nativePiProcessCount=2,
  x=>x.nativePiProcessCount=0,x=>x.providerCallsReserved=2,
  x=>x.durableAgents=2,x=>x.durableState="running",
  x=>x.role="worker",x=>x.reviewerVerifierPolicy="SHARED",
  x=>x.sameSession=false,x=>x.sameProject=false,
  x=>x.gitUnchanged=false,x=>x.noTools=false,
  x=>x.writerAuthorized=true,x=>x.humanConsent=true,
  x=>x.independentABParity=true,x=>x.globalFull=true,
  x=>x.extra="unreviewed",
 ];
 for(const [i,mutate] of mutations.entries()){
  const altered=valid();mutate(altered);
  assert.throws(()=>gradeEf603LiveCoalescing(altered,sha),Error,
   "Forged live Pi coalescing grade variant "+i);
 }
});
