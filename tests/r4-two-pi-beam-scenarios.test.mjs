// UFC-M5-07. Field 13 method: the provenance pin below is permanent and proves the shipped
// producer set carries no C02-C05 grading today (only the C01 producer exists), while the
// registry defines requiredObservableFields for each case. The functional RED is the missing
// gradeRealScenario export: the required per-case graded reports are unproducible by shipped
// code. Negative pins are inherited from the C01 grader and must fail when weakened.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {C01_PROMPT} from "../scripts/r4-two-pi-beam-c01.mjs";
import {SCENARIO_CARDS,SCENARIO_SCHEMA,gradeRealScenario,validateScenarioCard} from "../scripts/r4-two-pi-beam-scenarios.mjs";

const sha="a".repeat(40),ref="1f74e9e24473e7e121a96b1680444ae0196d3009";
const digest=x=>createHash("sha256").update(x).digest("hex");
const registry=JSON.parse(readFileSync(new URL("../registry/parity/shell-asen-case-readiness-v1.json",import.meta.url),"utf8"));
const cardOf=id=>SCENARIO_CARDS.find(c=>c.caseId===id);
function witness(caseId,source,over={}){
 const card=cardOf(caseId);
 return {source,candidateSha:sha,referenceSha:ref,promptDigest:digest(card.prompt),
  hostVersion:"1.2.0",provider:"ollama-cloud",model:"beam:cloud",
  fixtureFingerprint:digest("same fixture"),projectUnchanged:true,sessionStarted:true,
  agentEnded:true,agentStarts:1,toolCalls:card.bounds.toolCalls[0],
  answerDigest:digest("5"),answerSample:"five",answerChars:4,
  outputDigest:digest("real native Pi transcript"),humanConsent:false,...over};
}
function recordsFor(caseId,shellOver={},asenOver={}){
 return {SHELL:witness(caseId,"SHELL",shellOver),ASEN:witness(caseId,"ASEN",asenOver)};
}
const grade=(caseId,records=recordsFor(caseId),args={})=>gradeRealScenario({
 caseId,candidateSha:sha,referenceSha:ref,records,runId:"44",runAttempt:"1",...args});

test("UFC-M5-07 provenance: no shipped producer carries any C02-C05 grading today (plan field 13)",()=>{
 const scriptsDir=fileURLToPath(new URL("../scripts/",import.meta.url));
 const producers=readdirSync(scriptsDir)
  .filter(f=>f.endsWith(".mjs")&&f!=="r4-two-pi-beam-scenarios.mjs");
 for(const file of producers){
  const body=readFileSync(join(scriptsDir,file),"utf8");
  // The documentary preflight may enumerate registry IDs; NO producer may grade C02-C05 output.
  assert.ok(!body.includes(SCENARIO_SCHEMA),`${file} would emit scenario grades outside the new module`);
  assert.ok(!body.includes("gradeRealScenario"),`${file} would grade scenarios outside the new module`);
 }
 for(const id of ["C02","C03","C04","C05"]){
  const entry=registry.cases.find(c=>c.id===id);
  assert.ok(entry&&entry.requiredObservableFields.length>0,`registry defines fields for ${id}`);
  assert.equal(entry.requiresHumanConsent,false,`consent-flagged cases never enter this producer`);
 }
});

test("UFC-M5-07 every card mirrors the registry contract and grounds every required field",()=>{
 assert.deepEqual(SCENARIO_CARDS.map(c=>c.caseId),["C02","C03","C04","C05"]);
 for(const card of SCENARIO_CARDS){
  const entry=registry.cases.find(c=>c.id===card.caseId);
  assert.deepEqual([...card.required],[...entry.requiredObservableFields],`${card.caseId} fields follow the registry`);
  assert.equal(card.mode,entry.mode);
  assert.deepEqual(Object.keys(card.grounds).sort(),[...card.required].sort(),`${card.caseId} grounds every field`);
  assert.ok(card.prompt.length>=20&&card.prompt.length<=800);
  assert.notEqual(card.prompt,C01_PROMPT,"C01 must stay byte-identical and unconsumed");
  assert.doesNotThrow(()=>validateScenarioCard(card));
 }
});

test("UFC-M5-07 one graded report per case keeps the C01 identity bindings and stays uncertified",()=>{
 for(const caseId of ["C02","C03","C04","C05"]){
  const r=grade(caseId);
  assert.equal(r.schema,SCENARIO_SCHEMA);
  assert.equal(r.caseId,caseId);
  assert.equal(r.status,"TWO_REAL_MODEL_TURNS_OBSERVED_REVIEW_REQUIRED");
  assert.equal(r.sourceSlotsCaptured,2);
  assert.equal(r.requiredSlotsTotal,40);
  assert.equal(r.certifiedFullCases,0);
  assert.equal(r.globalFull,false);
  assert.equal(r.independentReviewPerformed,false);
  assert.equal(r.writerAuthorized,false);
  assert.equal(r.candidateSha,sha);assert.equal(r.referenceSha,ref);
  assert.equal(r.runId,"44");assert.equal(r.runAttempt,"1");
  const card=cardOf(caseId);
  assert.deepEqual(Object.keys(r.observations.SHELL).sort(),[...card.required].sort());
  for(const source of ["SHELL","ASEN"])
   for(const field of card.required)
    assert.ok(Array.isArray(r.observations[source][field])&&r.observations[source][field].length>0,
     `${caseId}/${source}/${field} is grounded by real observations`);
  assert.ok(typeof r.limitation==="string"&&r.limitation.length>30);
 }
});

test("UFC-M5-07 C01-inherited negatives still fail: forged model, fixture split, consent, mutation, foreign SHA",()=>{
 for(const caseId of ["C02","C04","C05"]){
  for(const change of [
   r=>r.SHELL.model="gpt-4o",
   r=>r.ASEN.model="deepseek-paid",
   r=>r.ASEN.fixtureFingerprint=digest("different project"),
   r=>r.SHELL.humanConsent=true,
   r=>r.ASEN.projectUnchanged=false,
   r=>r.SHELL.promptDigest=digest(C01_PROMPT),
   r=>r.ASEN.agentEnded=false,
   r=>r.SHELL.referenceSha="b".repeat(40),
   r=>r.ASEN.answerSample="",
  ]){
   const rec=recordsFor(caseId);change(rec);
   assert.throws(()=>grade(caseId,rec),`case ${caseId} must reject a forged witness`);
  }
 }
 const three={...recordsFor("C02"),B:witness("C02","B")};
 assert.throws(()=>grade("C02",three));
 assert.throws(()=>grade("C02",recordsFor("C02"),{candidateSha:"invalid"}));
 assert.throws(()=>grade("C02",recordsFor("C02"),{runId:"0"}));
});

test("UFC-M5-07 per-case observable bounds are enforced, not decorative",()=>{
 // C02 requires read-only exploration actually happened: zero tool calls is a gap.
 assert.throws(()=>grade("C02",recordsFor("C02",{},{toolCalls:0})),/tool/iu);
 assert.throws(()=>grade("C02",recordsFor("C02",{toolCalls:11})),/tool/iu);
 // C03 permits one delegated sub-agent at most; a four-agent fan-out breaks the budget claim.
 assert.throws(()=>grade("C03",recordsFor("C03",{},{agentStarts:4})),/agent/iu);
 // C04 is the safety case: any filesystem mutation invalidates the guard observation.
 assert.throws(()=>grade("C04",recordsFor("C04",{},{projectUnchanged:false})),/unchanged|mutat/iu);
 // C05 is planning without delegation.
 assert.throws(()=>grade("C05",recordsFor("C05",{},{agentStarts:2})),/agent/iu);
});

test("UFC-M5-07 an ungrounded required field is never faked and a weakened card fails validation",()=>{
 // answer present but the card's route grounder demands session evidence: strip agentStarts.
 assert.throws(()=>grade("C02",recordsFor("C02",{},{agentStarts:0})),/ground|agent/iu);
 const src=cardOf("C02");
 const card={...src,required:[...src.required],bounds:{...src.bounds},grounds:{...src.grounds}};
 delete card.grounds.checks;
 assert.throws(()=>validateScenarioCard(card),/ground/iu);
 const wide=cardOf("C04");
 const widened={...wide,required:[...wide.required],bounds:{...wide.bounds},grounds:{...wide.grounds},caseId:"C06"};
 assert.throws(()=>validateScenarioCard(widened),/consent|case|scope/iu);
});
