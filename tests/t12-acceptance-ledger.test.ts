import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Deliberately JavaScript-only, provider-free acceptance helper.
import {buildT12AcceptanceLedger,matchT12ValidatedLiveGate,writeT12AcceptanceLedgerCreateOnly} from "../scripts/t12-acceptance-ledger.mjs";

const sha="a".repeat(40);
const real=()=>({
 passed:true,status:"PASS_BOUNDED_READ_ONLY",candidateSha:sha,
 provider:"ollama-cloud",model:"beam",inferenceCalls:5,
 explorer:"PASS",planner:"PASS",reviewer:"PASS_TWO_JUDGMENTS",verifier:"PASS_NEGATIVE_REJECTION",
 toolsAllowed:false,writer:"BLOCKED_INTERACTIVE",authorization:"NOT_GRANTED",
 liveProviderRecovery:"NOT_VERIFIED",independentAudit:"NOT_PERFORMED",
});

test("F7 exact-SHA offline results cannot be promoted to a global FULL",()=>{
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true});
 assert.equal(report.globalStatus,"PARTIAL");
 assert.equal(report.globalFull,false);
 assert.equal(report.classification,"SELF_ASSESSED_PROVIDER_FREE");
 assert.equal(report.externalCi,"NOT_ASSERTED_BY_THIS_REPORT");
 assert.equal(report.units.F2,"PASS_PROVIDER_FREE_ONLY");
 assert.equal(report.units.F5,"PARTIAL_REAL_VERIFIER_MISSING");
 assert.equal(report.units.F4,"BLOCKED_INTERACTIVE");
 assert.equal(report.units.F6,"PARTIAL_REAL_PROVIDER_RECOVERY_MISSING");
 assert.equal(report.units.F7,"SELF_AUDIT_ONLY");
 assert.equal(report.liveProviderEvidence,"NOT_RUN");
});
test("F7 bounded, fully validated read-only evidence never grants Writer or live recovery",()=>{
 const result=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:real()});
 assert.equal(result.evidenceType,"REAL_READ_ONLY_PLUS_PROVIDER_FREE");
 assert.equal(result.units.F5,"PASS_BOUNDED_NEGATIVE_REJECTION");
 assert.equal(result.units.F2,"PASS_REAL_READ_ONLY");
 assert.equal(result.globalFull,false);
 assert.equal(result.units.F4,"BLOCKED_INTERACTIVE");
 assert.equal(result.units.F6,"PARTIAL_REAL_PROVIDER_RECOVERY_MISSING");
 assert.equal(result.independentAudit,"NOT_PERFORMED");
});
test("F7 rejects failed, stale, incomplete or forged provider reports",()=>{
 const valid=real(),input={sha,offlineConfirmed:true};
 assert.throws(()=>buildT12AcceptanceLedger({...input,offlineConfirmed:false}),
  /provider-free tests must have completed/);
 assert.throws(()=>buildT12AcceptanceLedger({...input,sha:"bad"}),/exact SHA/);
 const mutations=[
  {...valid,candidateSha:"b".repeat(40)},
  {...valid,passed:false},
  {...valid,status:"VERIFIER_EVIDENCE_INCOMPLETE"},
  {...valid,writer:"AUTHORIZED"},
  {...valid,authorization:"GRANTED"},
  {...valid,independentAudit:"PASS"},
  {...valid,liveProviderRecovery:"VERIFIED"},
  {...valid,inferenceCalls:4},
  {...valid,reviewer:"NOT_RUN"},
  {...valid,verifier:"NOT_RUN"},
  {...valid,toolsAllowed:true},
  {...valid,model:"paid-inference"},
 ];
 for(const forged of mutations)
  assert.throws(()=>buildT12AcceptanceLedger({...input,liveEvidence:forged}),
   /SHA|failed|unrecognized|Writer|independence|recovery|five model|Reviewers|Verifier|tools|model/);
});
test("F7 limited 3-call connectivity evidence stays partial without Reviewer or Verifier",()=>{
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:{
  ...real(),status:"PARTIAL_CALL_BUDGET",inferenceCalls:3,
  reviewer:"NOT_RUN",verifier:"NOT_RUN",
 }});
 assert.equal(report.liveProviderEvidence,"PARTIAL_CALL_BUDGET");
 assert.equal(report.units.F5,"PARTIAL_REAL_VERIFIER_MISSING");
 assert.equal(report.units.F2,"PASS_REAL_READ_ONLY");
 assert.equal(report.units.F3,"PASS_REAL_READ_ONLY");
 assert.equal(report.evidenceType,"REAL_EXPLORER_PLANNER_PARTIAL_PLUS_PROVIDER_FREE");
 assert.equal(report.classification,"SELF_ASSESSED_WITH_REAL_RECEIPT");
 assert.equal(report.globalFull,false);
});
test("F7 summary whitelists output fields and never copies unrelated provider payloads",()=>{
 const secret="SYNTHETIC_SECRET_NEVER_EMIT";
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:{
  ...real(),secret,rawProviderText:secret,reviewerOutput:{apiKey:secret},
 }});
 assert.equal(JSON.stringify(report).includes(secret),false);
 assert.deepEqual(Object.keys(report.units),["F0","F1","F2","F3","F4","F5","F6","F7"]);
});

test("F7 replayed strict gate must match byte-for-byte; plausible stale status is rejected",()=>{
 const value=real();
 const computed={...value,fixtureSha256:"c".repeat(64)};
 assert.deepEqual(matchT12ValidatedLiveGate({reported:computed,computed}),computed);
 const forged={...computed,verifier:"NOT_RUN"};
 assert.throws(()=>matchT12ValidatedLiveGate({reported:forged,computed}),
  /differs from strict real-evidence gate/);
 assert.throws(()=>matchT12ValidatedLiveGate({reported:{...computed,paidFallback:true},computed}),
  /differs from strict real-evidence gate/);
 assert.throws(()=>matchT12ValidatedLiveGate({reported:null,computed}),
  /differs from strict real-evidence gate/);
});
test("F7 three-call real receipt requires Explorer and Planner grades, not just a bounded count",()=>{
 const partial={...real(),status:"PARTIAL_CALL_BUDGET",inferenceCalls:3,
  reviewer:"NOT_RUN",verifier:"NOT_RUN"};
 for(const invalid of [{...partial,explorer:"NOT_RUN"},{...partial,planner:"NOT_RUN"}])
  assert.throws(()=>buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:invalid}),
   /no real PASS/);
});
test("F7 a real bounded receipt is self-assessed, not independent external audit or release FULL",()=>{
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true,liveEvidence:real()});
 assert.equal(report.classification,"SELF_ASSESSED_WITH_REAL_RECEIPT");
 assert.equal(report.externalCi,"NOT_ASSERTED_BY_THIS_REPORT");
 assert.equal(report.independentAudit,"NOT_PERFORMED");
 assert.equal(report.globalFull,false);
});


test("EF-703/704 T12 ledger is create-only and rejects symlinked output parents",async t=>{
 const {mkdtemp,mkdir,rm,readFile,realpath,symlink}=await import("node:fs/promises");
 const {join}=await import("node:path");
 const {tmpdir}=await import("node:os");
 const home=await realpath(await mkdtemp(join(tmpdir(),"asen-t12-evidence-write-")));
 t.after(()=>rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
 const directory=join(home,"physical");await mkdir(directory);
 const file=join(directory,"t12-acceptance-ledger.json");
 const report=buildT12AcceptanceLedger({sha,offlineConfirmed:true});
 await writeT12AcceptanceLedgerCreateOnly({file,report});
 const before=await readFile(file,"utf8");
 await assert.rejects(()=>writeT12AcceptanceLedgerCreateOnly({file,report}),
  (error:any)=>error.code==="EEXIST");
 assert.equal(await readFile(file,"utf8"),before,"The original evidence must not be overwritten");
 await assert.rejects(()=>writeT12AcceptanceLedgerCreateOnly({file:join(directory,"..","physical","t12-acceptance-ledger.json"),report}),
  /normalized absolute output path/u);
 const alias=join(home,"alias");
 try{await symlink(directory,alias,process.platform==="win32"?"junction":"dir");}
 catch(error){if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){t.skip("Windows symlinks need privileges");return;}throw error;}
 await assert.rejects(()=>writeT12AcceptanceLedgerCreateOnly({file:join(alias,"t12-acceptance-ledger.json"),report}),
  /physical and canonical/u);
 assert.equal(await readFile(file,"utf8"),before);
});
