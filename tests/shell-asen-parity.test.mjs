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
