/**
 * Machine-auditable C01–C20 acceptance readiness. This inventories obligations;
 * it does not execute reference A/B or ASEN and never creates "real" receipts.
 */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,lstatSync,realpathSync} from "node:fs";
import {isAbsolute,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {CASE_IDS,REFERENCE_SHA,compareAgentObservations} from "./agent-observable-parity.mjs";
import {buildObservationScaffold} from "./agent-observable-scaffold.mjs";
import {pinnedAgentABSources} from "./agent-ab-source-witness.mjs";

const ALLOWED_FIELDS=new Set(["route","roles","guards","checks","notifications","effects"]);
const MODES=new Set(["direct","read-only","safety","planning","write","review",
 "notification","recovery","provider-unavailable","human-decision","end-to-end"]);
const WRITE_APPROVAL=new Set(["C06","C07","C08","C18","C19","C20"]);
const unsafeDisplay=/[\u0000-\u001f\u007f-\u009f\u200e-\u200f\u2028-\u202e\u2066-\u2069]/u;
const EXACT_KEYS=(value,keys)=>Boolean(value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join("|")===keys.slice().sort().join("|"));
const manifestFile=new URL("../registry/parity/agent-ab-case-readiness-v1.json",import.meta.url);
export function validateAgentABCaseReadiness(manifest){
 if(!EXACT_KEYS(manifest,["schema","description","comparisonFields","sources","cases"])||
    manifest.schema!=="asen-agent-ab-case-readiness/v1"||
    !Array.isArray(manifest.comparisonFields)||
    JSON.stringify(manifest.comparisonFields)!==JSON.stringify([...ALLOWED_FIELDS])||
    JSON.stringify(manifest.sources)!==JSON.stringify(["A","B","ASEN"])||
    typeof manifest.description!=="string"||manifest.description.length<30||
    manifest.description.length>1024||unsafeDisplay.test(manifest.description)||
    !Array.isArray(manifest.cases)||manifest.cases.length!==CASE_IDS.length)
  throw Error("Invalid C01-C20 readiness manifest header");
 for(const [i,entry] of manifest.cases.entries()){
  if(!EXACT_KEYS(entry,["id","scenario","requiredObservableFields","mode",
    "requiresHumanConsent","stage"])||
    entry.id!==CASE_IDS[i]||typeof entry.scenario!=="string"||
    entry.scenario.trim()!==entry.scenario||entry.scenario.length<12||
    entry.scenario.length>512||unsafeDisplay.test(entry.scenario)||
    !MODES.has(entry.mode)||typeof entry.requiresHumanConsent!=="boolean"||
    entry.requiresHumanConsent!==WRITE_APPROVAL.has(entry.id)||
    entry.stage!=="NOT_EXECUTED"||
    !Array.isArray(entry.requiredObservableFields)||
    entry.requiredObservableFields.length===0||
    entry.requiredObservableFields.length>ALLOWED_FIELDS.size||
    new Set(entry.requiredObservableFields).size!==entry.requiredObservableFields.length||
    !entry.requiredObservableFields.every(x=>ALLOWED_FIELDS.has(x)))
   throw Error("Invalid pending C01-C20 scenario: "+CASE_IDS[i]);
 }
 assert.equal(manifest.cases.find(x=>x.id==="C19")?.mode,"write");
 assert.equal(manifest.cases.find(x=>x.id==="C16")?.mode,"provider-unavailable");
 return manifest.cases.map(entry=>Object.freeze({
  id:entry.id,mode:entry.mode,
  requiresHumanConsent:entry.requiresHumanConsent,
  requiredObservableFields:Object.freeze([...entry.requiredObservableFields]),
  stage:"NOT_EXECUTED",
 }));
}
export function buildAgentABCaseReadiness({candidateSha,manifest=JSON.parse(readFileSync(manifestFile,"utf8"))}){
 if(!/^[0-9a-f]{40}$/u.test(candidateSha??""))throw Error("Exact ASEN candidate SHA required");
 const sources=pinnedAgentABSources();
 assert.deepEqual(Object.fromEntries(sources.map(source=>[source.id,source.commit])),REFERENCE_SHA,
  "The frozen source witness and comparator must bind the same A/B commits");
 const cases=validateAgentABCaseReadiness(manifest);
 const scaffold=buildObservationScaffold(candidateSha);
 const report=compareAgentObservations({
  reference:scaffold.reference,candidate:scaffold.candidate,candidateSha,
 });
 assert.equal(report.counts.blocked,20);
 assert.equal(report.counts.match,0);
 assert.equal(report.counts.fail,0);
 return Object.freeze({
  schema:"asen-agent-ab-case-readiness-report/v1",
  status:"READINESS_ONLY_NOT_EXECUTED",candidateSha,
  casesPrepared:cases.length,sourceSlotsRequired:60,
  evidenceCaptured:0,referenceCasesExecuted:0,asenCasesExecuted:0,
  casesBlocked:report.counts.blocked,
  sourceCommits:Object.fromEntries(sources.map(source=>[source.id,source.commit])),
  interactiveCases:cases.filter(x=>x.requiresHumanConsent).map(x=>x.id),
  cases,modelCalls:0,humanConsentReceived:false,
  globalFull:false,
  limitation:"The scenario contract, frozen Git objects and static placeholders cannot prove any of the 60 runtime observations.",
 });
}
/** EF-002/701: create-only report in a physically canonical output directory.
 * No caller-controlled alias or old receipt may become a new source witness. */
export function writeAgentABReadinessCreateOnly({file,report}){
 if(typeof file!=="string"||!isAbsolute(file)||resolve(file)!==file)
  throw Error("A/B readiness requires a normalized absolute report path");
 const parent=dirname(file),stat=lstatSync(parent);
 if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(parent)!==parent)
  throw Error("A/B readiness output directory must be physical and canonical");
 if(report?.globalFull!==false||report?.status!=="READINESS_ONLY_NOT_EXECUTED")
  throw Error("A/B readiness output cannot claim completed observations");
 writeFileSync(file,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2||!process.env.ASEN_EXPECTED_SHA||
     !process.env.ASEN_AB_CASE_READINESS_OUTPUT||
     !isAbsolute(process.env.ASEN_AB_CASE_READINESS_OUTPUT))
   throw Error("Exact candidate and absolute create-only output path required");
  const result=buildAgentABCaseReadiness({candidateSha:process.env.ASEN_EXPECTED_SHA});
  writeAgentABReadinessCreateOnly({file:process.env.ASEN_AB_CASE_READINESS_OUTPUT,report:result});
  console.log("ASEN_AB_CASE_READINESS_ONLY "+JSON.stringify({
   casesPrepared:result.casesPrepared,sourceSlotsRequired:result.sourceSlotsRequired,
   evidenceCaptured:0,globalFull:false,
  }));
 }catch(error){console.error(error);process.exitCode=1;}
}
