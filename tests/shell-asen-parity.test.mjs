import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {buildShellAsenReadiness,validateShellAsenBaseline,
 validateShellAsenScenarios,compareShellAsenClaims} from "../scripts/shell-asen-parity.mjs";
const sha="a".repeat(40);
const ready=()=>buildShellAsenReadiness({candidateSha:sha});
const trace=()=>({route:"direct",roles:["primary"],guards:[],checks:[],notifications:[],effects:[]});
const obs=(rows=[])=>({schema:"asen-shell-asen-observations/v1",
 candidateSha:sha,referenceSha:ready().referenceSha,rows});
const row=(id,source,overrides={})=>({
 id,source,sha:source==="SHELL"?ready().referenceSha:sha,
 execution:"real",trace:trace(),receipt:"claim-not-attested",...overrides,
});
test("R4-04 active baseline is exactly Shell 4.6.0 on Pi against ASEN on Pi",()=>{
 const x=ready();
 assert.equal(x.referenceSha,"1f74e9e24473e7e121a96b1680444ae0196d3009");
 assert.equal(x.referenceVersion,"4.6.0");
 assert.equal(x.referenceTree,"64d14750450d0144d65230eb0b6ecc69d841a8f3");
 assert.deepEqual(x.sources,["SHELL","ASEN"]);
 assert.equal(x.casesPrepared,20);
 assert.equal(x.sourceSlotsRequired,40);
 assert.equal(x.rows.length,20);
 assert.ok(x.rows.every(y=>y.sources.length===2&&y.sources[0].source==="SHELL"));
 assert.equal(x.evidenceCaptured,0);
 assert.equal(x.casesBlocked,20);
 assert.equal(x.globalFull,false);
 assert.equal(x.independentReviewPerformed,false);
 assert.equal(x.historicalTriad.active,false);
});
test("R4-04 cannot silently reintroduce a third runtime, shift target SHA or change version",()=>{
 const x=ready();
 const b={schema:"asen-pi-shell-parity-baseline/v1",
  purpose:"This is the active frozen native Pi reference",
  reference:{id:"SHELL",repository:"Gen"+"tleman-Programming/"+"gen"+"tle-shell",
   tag:"v4.6.0",commit:x.referenceSha,tree:x.referenceTree,packageVersion:"4.6.0",host:"pi"},
  candidate:{id:"ASEN",host:"pi"},sources:["SHELL","ASEN"],
  cases:Array.from({length:20},(_,i)=>"C"+String(i+1).padStart(2,"0")),
  slotsRequired:40,legacyTriadStatus:"HISTORICAL_NON_NORMATIVE",
  fullRequiresIndependentReview:true,
 };
 assert.ok(validateShellAsenBaseline(b));
 for(const delta of [
  {sources:["SHELL","B","ASEN"]},{slotsRequired:60},
  {reference:{...b.reference,commit:"b".repeat(40)}},
  {reference:{...b.reference,packageVersion:"4.5.1"}},
  {legacyTriadStatus:"ACTIVE"},
  {fullRequiresIndependentReview:false},
 ])assert.throws(()=>validateShellAsenBaseline({...b,...delta}));
});
test("R4-04 empty observations cannot turn either Pi system into a passing case",()=>{
 const result=compareShellAsenClaims({readiness:ready(),observations:obs()});
 assert.equal(result.cases.length,20);
 assert.equal(result.requiredSlots,40);
 assert.equal(result.claimedSlots,0);
 assert.ok(result.cases.every(x=>x.status==="BLOCKED"));
 assert.equal(result.globalFull,false);
});
test("R4-04 matching claims are not real hosted independent observations",()=>{
 const result=compareShellAsenClaims({readiness:ready(),
  observations:obs([row("C01","SHELL"),row("C01","ASEN")])});
 assert.equal(result.cases[0].status,"MATCH_CLAIM_UNATTESTED");
 assert.equal(result.certifiedMatches,0);
 assert.equal(result.globalFull,false);
});
test("R4-04 different claims are recorded as differences but never certified from JSON alone",()=>{
 const local=row("C01","ASEN",{trace:{...trace(),route:"delegate"}});
 const res=compareShellAsenClaims({readiness:ready(),
  observations:obs([row("C01","SHELL"),local])});
 assert.equal(res.cases[0].status,"DIFFERENCE_CLAIM_UNATTESTED");
 assert.deepEqual(res.cases[0].differences,["route"]);
 assert.equal(res.certifiedDifferences,0);
 assert.equal(res.globalFull,false);
});
test("R4-04 demands both actual executions, never accepts static fixtures",()=>{
 const x=compareShellAsenClaims({readiness:ready(),
 observations:obs([row("C02","SHELL",{execution:"static"}),row("C02","ASEN")])});
 assert.equal(x.cases[1].status,"BLOCKED");
 assert.equal(x.cases[1].reason,"REAL_EXECUTION_REQUIRED");
});
test("R4-04 rejects B as a runtime, stale SHA, duplicate, invalid trace and self-declared approval",()=>{
 const valid=obs([row("C01","SHELL"),row("C01","ASEN")]);
 const altered=[
  {...valid,rows:[row("C01","B")]},
  {...valid,rows:[row("C01","SHELL",{sha:"b".repeat(40)})]},
  {...valid,rows:[row("C01","SHELL"),row("C01","SHELL")]},
  {...valid,rows:[row("C01","SHELL",{trace:{route:"direct"}})]},
  {...valid,rows:[row("C01","SHELL",{trace:{...trace(),roles:"primary"}})]},
  {...valid,rows:[row("C01","SHELL",{globalFull:true})]},
  {...valid,referenceSha:"b".repeat(40)},
  {...valid,globalFull:true},
 ];
 for(const observations of altered)assert.throws(()=>
  compareShellAsenClaims({readiness:ready(),observations}));
});
test("R4-04 preserves exact candidate identity and canonical C01-C20 scenarios",()=>{
 assert.throws(()=>buildShellAsenReadiness({candidateSha:"short"}));
 assert.throws(()=>buildShellAsenReadiness({candidateSha:ready().referenceSha}));
 const wrong=structuredClone(ready());
 wrong.schema="old-triple";
 assert.throws(()=>compareShellAsenClaims({readiness:wrong,observations:obs()}));
});

test("R4-04 scenario contract excludes methodology as a third runtime",()=>{
 const fs=JSON.parse(readFileSync(new URL("../registry/parity/shell-asen-case-readiness-v1.json",import.meta.url),"utf8"));
 assert.deepEqual(fs.sources,["SHELL","ASEN"]);
 assert.equal(validateShellAsenScenarios(fs).length,20);
 assert.throws(()=>validateShellAsenScenarios({...fs,sources:["A","B","ASEN"]}));
 assert.throws(()=>validateShellAsenScenarios({...fs,cases:fs.cases.slice(1)}));
 const bad=structuredClone(fs);
 bad.cases[0].stage="EXECUTED";
 assert.throws(()=>validateShellAsenScenarios(bad));
 const consent=structuredClone(fs);
 consent.cases[18].requiresHumanConsent=false;
 assert.throws(()=>validateShellAsenScenarios(consent));
});

// UFC-M5-06 adapter pins. Honest functional RED (plan field 13): the shipped comparator already
// rejects foreign SHA/duplicates/non-real rows, but NO shipped component converts a genuine C01
// beam report into an accepted observation pair — these assertions fail today because that
// behaviour is absent, exactly the inert-artifact gap §Q7 names. Negatives below are specified
// now and proven at GREEN; none may regress the existing comparator rules.
import {gradeRealC01,C01_PROMPT} from "../scripts/r4-two-pi-beam-c01.mjs";
import {observationsFromC01Report,attestC01Comparison,validateParityConsentReceipt,
 validateParityReviewRecord} from "../scripts/shell-asen-parity.mjs";
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const digest=x=>createHash("sha256").update(x).digest("hex");
const c01Witness=(source,cand=sha)=>({source,candidateSha:cand,referenceSha:ready().referenceSha,
 promptDigest:digest(C01_PROMPT),hostVersion:"1.2.0",provider:"ollama-cloud",model:"beam:cloud",
 fixtureFingerprint:digest("same fixture"),projectUnchanged:true,sessionStarted:true,agentEnded:true,
 agentStarts:1,toolCalls:0,answerDigest:digest("5"),answerSample:"5",answerChars:1,
 outputDigest:digest("real native Pi transcript"),humanConsent:false});
const c01Report=(over={})=>gradeRealC01({candidateSha:sha,referenceSha:ready().referenceSha,
 records:{SHELL:c01Witness("SHELL"),ASEN:c01Witness("ASEN")},runId:"44",runAttempt:"1",...over});
function scratchC01(report){
 const dir=mkdtempSync(join(tmpdir(),"asen-parity-adapter-"));
 const file=join(dir,"c01-beam.json");
 writeFileSync(file,JSON.stringify(report,null," ")+"\n");
 return {dir,file};
}
const consumed=(report,artifact)=>compareShellAsenClaims({readiness:ready(),
 observations:observationsFromC01Report({report,readiness:ready(),artifactPath:artifact})});
const RUN={candidateSha:sha,runId:"44",runAttempt:"1"};
const consentReceipt=(over={})=>({schema:"asen-parity-consent-receipt/v1",
 receiptId:"owner-consent-000001",grantedBy:"owner:asenbanskaliev",
 grantedAt:"2026-11-08T00:00:00.000Z",candidateSha:sha,
 decision:"consumption-and-attestation-wiring",runId:"44",runAttempt:"1",...over});
const reviewRecord=(over={})=>({schema:"asen-parity-independent-review/v1",
 reviewerId:"reviewer:independent-socket",performedAt:"2026-11-08T00:10:00.000Z",
 candidateSha:sha,runId:"44",runAttempt:"1",verdict:"approved",
 findings:"bounded C01 match reviewed against the frozen contract",...over});

test("UFC-M5-06 a genuine C01 report becomes a schema-validated observation pair the comparator consumes",t=>{
 const report=c01Report();const {dir,file}=scratchC01(report);
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:8}));
 const comparison=consumed(report,file);
 const c01=comparison.cases.find(x=>x.id==="C01");
 assert.equal(c01.status,"MATCH_CLAIM_UNATTESTED","a consumed genuine pair must reach the attested-claim path, never stay inert");
 assert.equal(comparison.claimedSlots,2);
 assert.equal(comparison.cases.filter(x=>x.id!=="C01"&&x.status==="BLOCKED").length,19);
 assert.equal(comparison.certifiedMatches,0);assert.equal(comparison.certifiedDifferences,0);
 assert.equal(comparison.globalFull,false);assert.equal(comparison.independentReviewPerformed,false);
});

test("UFC-M5-06 the adapter still rejects foreign SHA, duplicated, non-real, promoted and mismatched artifacts",t=>{
 const report=c01Report();const {dir,file}=scratchC01(report);
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:8}));
 const r=ready();
 assert.throws(()=>observationsFromC01Report({report:{...report,candidateSha:"b".repeat(40)},readiness:r,artifactPath:file}),/candidate SHA/iu);
 assert.throws(()=>observationsFromC01Report({report:{...report,referenceSha:"f".repeat(40)},readiness:r,artifactPath:file}),/reference SHA/iu);
 assert.throws(()=>observationsFromC01Report({report:{...report,sourceAnswers:[report.sourceAnswers[0],report.sourceAnswers[0]]},readiness:r,artifactPath:file}),/duplicat/iu);
 assert.throws(()=>observationsFromC01Report({report:{...report,modelCallsVerifiedByAgentStarts:false},readiness:r,artifactPath:file}),/real|observ/iu);
 assert.throws(()=>observationsFromC01Report({report:{...report,globalFull:true},readiness:r,artifactPath:file}),/promotion|globalFull|never/iu);
 const bad=join(dir,"tampered.json");writeFileSync(bad,JSON.stringify({...report,sourceAnswers:
  report.sourceAnswers.map(a=>({...a,answerSample:"tampered"}))},null," ")+"\n");
 assert.throws(()=>observationsFromC01Report({report,readiness:r,artifactPath:bad}),/artifact/iu);
});

test("UFC-M5-06 a symlinked or otherwise non-canonical artifact path is never admitted",t=>{
 const report=c01Report();const {dir,file}=scratchC01(report);
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:8}));
 const linkRoot=join(dir,"link");
 symlinkSync(dir,linkRoot,"junction");
 assert.throws(()=>observationsFromC01Report({report,readiness:ready(),
  artifactPath:join(linkRoot,"c01-beam.json")}),/canonical/iu);
});

test("UFC-M5-06 verdicts stay UNATTESTED without attestation inputs and a partial pair fails closed",t=>{
 const report=c01Report();const {dir,file}=scratchC01(report);
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:8}));
 const comparison=consumed(report,file);
 assert.deepEqual(attestC01Comparison({comparison,runContext:RUN}),comparison,"no inputs means byte-identical inert verdicts");
 assert.throws(()=>attestC01Comparison({comparison,consentReceipt:consentReceipt(),runContext:RUN}),/both/iu);
 assert.throws(()=>attestC01Comparison({comparison,reviewRecord:reviewRecord(),runContext:RUN}),/both/iu);
 assert.throws(()=>attestC01Comparison({comparison,consentReceipt:consentReceipt(),
  reviewRecord:reviewRecord(),runContext:{...RUN,candidateSha:"c".repeat(40)}}),/identity|match/iu);
});

test("UFC-M5-06 genuine bound attestation marks claims yet can never certify FULL or touch counters",t=>{
 const report=c01Report();const {dir,file}=scratchC01(report);
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:8}));
 const comparison=consumed(report,file);
 const attested=attestC01Comparison({comparison,consentReceipt:consentReceipt(),
  reviewRecord:reviewRecord(),runContext:RUN});
 assert.equal(attested.cases.find(x=>x.id==="C01").status,"MATCH_CLAIM_ATTESTED");
 assert.equal(attested.certifiedMatches,0);assert.equal(attested.certifiedDifferences,0);
 assert.equal(attested.globalFull,false);
 assert.equal(attested.independentReviewPerformed,true,"the review record exists in this shape");
 assert.equal(attested.attestation.consentReceiptId,"owner-consent-000001");
});

test("UFC-M5-06 consent receipts are SHA-bound, run-bound and never replayable across identities",()=>{
 assert.doesNotThrow(()=>validateParityConsentReceipt(consentReceipt(),RUN));
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({runId:"45"}),RUN),/bind|run/iu);
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({runAttempt:"2"}),RUN),/bind|run/iu);
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({candidateSha:"d".repeat(40)}),RUN),/SHA|bind/iu);
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({receiptId:"x"})),/receiptId|shape|receipt/iu);
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({grantedAt:"not-a-time"})),/time|date|grantedAt/iu);
 assert.throws(()=>validateParityConsentReceipt(consentReceipt({decision:"anything-else"})),/decision/iu);
 assert.throws(()=>validateParityConsentReceipt({...consentReceipt(),extra:1}),/shape/iu);
});

test("UFC-M5-06 independent review records demand independence and an approving verdict",()=>{
 assert.doesNotThrow(()=>validateParityReviewRecord(reviewRecord(),RUN));
 assert.throws(()=>validateParityReviewRecord(reviewRecord({verdict:"rejected"}),RUN),/approved|verdict/iu);
 assert.throws(()=>validateParityReviewRecord(reviewRecord({reviewerId:"owner:asenbanskaliev"}),RUN),/independ|owner/iu);
 assert.throws(()=>validateParityReviewRecord({...reviewRecord(),findings:""},RUN),/findings/iu);
 const report=c01Report();const {dir,file}=scratchC01(report);
 try{
  assert.throws(()=>attestC01Comparison({comparison:consumed(report,file),
   consentReceipt:consentReceipt(),reviewRecord:reviewRecord({verdict:"rejected"}),runContext:RUN}),/approved|verdict/iu);
 }finally{rmSync(dir,{recursive:true,force:true,maxRetries:8});}
});
