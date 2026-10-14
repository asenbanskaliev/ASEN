import {readFileSync,existsSync,realpathSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {collectBaseline,detectMappedBaselineDrift,validateBaseline} from "./ecosystem-baseline.mjs";
import {verifyEcosystemCandidateReport} from "./ecosystem-candidate-report.mjs";

let defaultRoot;
try{defaultRoot=fileURLToPath(new URL("../",import.meta.url));}catch(error){throw error;}

const units=Array.from({length:16},(_,index)=>`ECO-${String(index+1).padStart(2,"0")}`),unitSet=new Set(units);
// Minimum obligations derived from the canonical ECO contract, independent of claim flags.
// Flags may add obligations but cannot remove these fixed unit boundaries.
const minimums=Object.freeze(Object.fromEntries(units.map((id,index)=>[id,Object.freeze({
  stateful:![2,3,4,15].includes(index+1),platformSensitive:true,
  piBoundary:index!==0,modelBoundary:[5,6,11,16].includes(index+1),
})])));
const hash=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const candidate=value=>typeof value==="string"&&/^[a-f0-9]{40}$/.test(value);
const safePath=value=>typeof value==="string"&&/^(?:src|extensions|tests|scripts|docs|odd|registry)\//.test(value)&&
  !/[\\\u0000-\u001f]/.test(value)&&value.split("/").every(part=>part&&part!=="."&&part!=="..");
const approvalPath=/^registry\/parity\/ecosystem-provenance-approvals\/(ECO-\d{2})\.json$/u;
const exactKeys=(value,keys)=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&Object.keys(value).every((key,index)=>key===keys[index]);
const canonicalText=(value,min,max)=>typeof value==="string"&&value===value.trim()&&value===value.normalize("NFC")&&
  [...value].length>=min&&[...value].length<=max&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
const utcMilliseconds=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)&&
  !Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
const hasUnpairedSurrogate=value=>{
  for(let index=0;index<value.length;index++){
    const code=value.charCodeAt(index);
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(index+1);if(next>=0xdc00&&next<=0xdfff){index++;continue;}return true;}
    if(code>=0xdc00&&code<=0xdfff)return true;
  }
  return false;
};

/** Bounded recursive descent retains raw member identity so JSON.parse cannot hide duplicates. */
function parseApprovalJson(bytes){
  let text,index=0,duplicate=false,invalidScalar=false;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return undefined;}
  const whitespace=()=>{while(/[\u0009\u000a\u000d\u0020]/u.test(text[index]??""))index++;};
  const string=()=>{
    if(text[index]!=="\"")throw new Error("string expected");const start=index++;
    let escaped=false;
    while(index<text.length){const character=text[index++];if(escaped){escaped=false;continue;}if(character==="\\"){escaped=true;continue;}if(character==="\""){
      let decoded;try{decoded=JSON.parse(text.slice(start,index));}catch{throw new Error("invalid string escape");}
      if(hasUnpairedSurrogate(decoded))invalidScalar=true;return decoded;
    }if(character.charCodeAt(0)<0x20)throw new Error("control in string");}
    throw new Error("unterminated string");
  };
  const value=depth=>{
    if(depth>16)throw new Error("JSON nesting exceeds approval schema");whitespace();const character=text[index];
    if(character==="\"")return string();
    if(character==="{"){
      index++;const object=Object.create(null),keys=new Set();whitespace();if(text[index]==="}"){index++;return object;}
      while(true){whitespace();const key=string();if(keys.has(key))duplicate=true;keys.add(key);whitespace();if(text[index++]!==":")throw new Error("colon expected");
        Object.defineProperty(object,key,{value:value(depth+1),enumerable:true,writable:true,configurable:true});whitespace();
        if(text[index]===","){index++;continue;}if(text[index]==="}"){index++;return object;}throw new Error("object delimiter expected");}
    }
    if(character==="["){
      index++;const array=[];whitespace();if(text[index]==="]"){index++;return array;}
      while(true){array.push(value(depth+1));whitespace();if(text[index]===","){index++;continue;}if(text[index]==="]"){index++;return array;}throw new Error("array delimiter expected");}
    }
    for(const [token,result] of [["true",true],["false",false],["null",null]])if(text.startsWith(token,index)){index+=token.length;return result;}
    const number=text.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];if(number){index+=number.length;return Number(number);}
    throw new Error("JSON value expected");
  };
  try{const parsed=value(0);whitespace();if(index!==text.length)throw new Error("trailing JSON");return {value:parsed,duplicate,invalidScalar};}catch{return undefined;}
}

export function isAllowedEcosystemOverlayPath(value){
  if(typeof value!=="string")return false;
  if(value==="registry/parity/ecosystem-claims-v1.json"||/^registry\/evidence\/ecosystem\/[A-Za-z0-9._-]+\.json$/u.test(value))return true;
  const match=typeof value==="string"&&value.match(approvalPath);return Boolean(match&&unitSet.has(match[1]));
}

/** Receipts are added after the exact tested source commit; only claim/receipt metadata may follow it. */
export function isEvidenceOnlyOverlay(paths){
  return Array.isArray(paths)&&paths.length>0&&new Set(paths).size===paths.length&&paths.every(isAllowedEcosystemOverlayPath);
}

function validateApproval(row,baselineCommit,approvalRecords){
  const label=row.id,reference=row.provenanceApproval,issues=[];
  const finish=()=>{if(reference!==undefined&&!["PARTIAL","FULL"].includes(row.status))issues.push(`${label}: EPA011_STATUS_NOT_ELIGIBLE`);return issues;};
  if(reference===undefined){if(row.status==="FULL")issues.push(`${label}: EPA001_REFERENCE_REQUIRED`);return finish();}
  const match=exactKeys(reference,["path","sha256"])&&typeof reference.path==="string"&&reference.path.match(approvalPath);
  const record=match&&match[1]===label&&hash(reference.sha256)?approvalRecords.get(reference.path):undefined;
  if(!match||match[1]!==label||!hash(reference.sha256)||record?.unsafe){issues.push(`${label}: EPA002_REFERENCE_INVALID`);return finish();}
  if(!record){issues.push(`${label}: EPA003_REFERENCE_MISSING`);return finish();}
  if(createHash("sha256").update(record.bytes).digest("hex")!==reference.sha256)issues.push(`${label}: EPA004_DIGEST_MISMATCH`);
  if(record.bytes.length>16_384)issues.push(`${label}: EPA005_SIZE_INVALID`);
  const parsed=record.bytes.length<=16_384?parseApprovalJson(record.bytes):undefined,value=parsed?.value,human=value?.approval?.humanVerification;
  const shape=record.bytes.length>0&&parsed&&!parsed.duplicate&&!parsed.invalidScalar&&exactKeys(value,["schema","claim","provenance","approval","constraints"])&&
    value.schema==="asen.ecosystem-provenance-approval.v1"&&exactKeys(value.claim,["id","status"])&&
    exactKeys(value.provenance,["testedCandidate","sourceBaseline","sourceSnapshot"])&&
    exactKeys(value.approval,["candidate","humanVerification"])&&
    exactKeys(human,["reviewerType","independence","authentication","method","reviewer","notes","verifiedAt"])&&
    exactKeys(value.constraints,["claimsPromotion","cryptographicAttestation","deliveryAuthority"])&&
    candidate(value.provenance.testedCandidate)&&candidate(value.provenance.sourceBaseline)&&candidate(value.provenance.sourceSnapshot)&&
    candidate(value.approval.candidate)&&utcMilliseconds(human.verifiedAt);
  if(!shape){issues.push(`${label}: EPA006_SHAPE_INVALID`);}
  else{
    if(value.claim.id!==row.id||value.claim.status!==row.status)issues.push(`${label}: EPA007_CLAIM_MISMATCH`);
    if(value.provenance.testedCandidate!==row.candidate||value.provenance.sourceBaseline!==baselineCommit||value.provenance.sourceSnapshot!==row.sourceSnapshotCommit)
      issues.push(`${label}: EPA008_PROVENANCE_MISMATCH`);
    if(value.approval.candidate!==value.provenance.testedCandidate)issues.push(`${label}: EPA009_APPROVAL_MISMATCH`);
    if(human.reviewerType!=="HUMAN"||human.independence!=="DECLARED_INDEPENDENT"||human.authentication!=="UNAUTHENTICATED_DECLARATION"||
      human.method!=="MANUAL_INDEPENDENT_VERIFICATION"||!canonicalText(human.reviewer,1,128)||!canonicalText(human.notes,1,2048)||
      value.constraints.claimsPromotion!==false||value.constraints.cryptographicAttestation!==false||value.constraints.deliveryAuthority!==false)
      issues.push(`${label}: EPA010_DECLARATION_INVALID`);
  }
  return finish();
}

/** Checks receipt/content consistency, not authenticity of execution; independent CI/audit must verify execution. */
export function validateEcosystemClaims({baseline,registry,existingPaths,observedHead,driftReport,recordDigests=new Map(),records=new Map(),candidateOverlays=new Map(),approvalRecords=new Map()}) {
  const issues=validateBaseline(baseline);
  if(issues.length)return issues;
  if(!registry||registry.version!==1||registry.sourceCommit!==baseline.commit||!Array.isArray(registry.rows))
    return ["Invalid ecosystem claims envelope or frozen source identity"];
  const ids=registry.rows.map(row=>row?.id);
  if(ids.length!==units.length||new Set(ids).size!==units.length||units.some(id=>!ids.includes(id)))issues.push("Every ECO unit requires exactly one claim row");
  const sources=new Map();
  for(const row of baseline.files){const paths=sources.get(row.sha256)??[];paths.push(row.path);sources.set(row.sha256,paths);}
  const mappedPaths=new Set(registry.rows.flatMap(row=>(row?.sourceHashes??[]).flatMap(id=>sources.get(id)??[])));
  for(const row of registry.rows) {
    if(!row||!units.includes(row.id)||!["FULL","PARTIAL","MISSING","OUT-OF-SCOPE"].includes(row.status)) {issues.push("Invalid ecosystem claim row");continue;}
    const label=row.id;
    if(!Array.isArray(row.sourceHashes)||!row.sourceHashes.length||row.sourceHashes.some(id=>!hash(id)||!sources.has(id))||new Set(row.sourceHashes).size!==row.sourceHashes.length)
      issues.push(`${label}: unresolved frozen source references`);
    for(const key of ["implementation","tests"]){
      if(!Array.isArray(row[key])||row[key].some(value=>!safePath(value)||!existingPaths.has(value))||new Set(row[key]).size!==row[key].length)
        issues.push(`${label}: invalid ${key} paths`);
    }
    if(!Array.isArray(row.remaining)||row.remaining.some(value=>typeof value!=="string"||!value.trim()))issues.push(`${label}: invalid remaining obligations`);
    if(["PARTIAL","MISSING"].includes(row.status)&&(!row.remaining?.length))issues.push(`${label}: non-final claim needs explicit gaps`);
    if(row.status==="MISSING"&&(row.implementation?.length||row.tests?.length))issues.push(`${label}: MISSING contradicts implementation mapping`);
    issues.push(...validateApproval(row,baseline.commit,approvalRecords));
    for(const flag of ["stateful","platformSensitive","piBoundary","modelBoundary"])
      if(typeof row[flag]!=="boolean")issues.push(`${label}: explicit ${flag} boundary is required`);
    if(row.modelBoundary&&!row.piBoundary)issues.push(`${label}: model boundary requires Pi ownership`);
    if(row.status==="OUT-OF-SCOPE") {
      if(!["branding","copied-artwork-or-prose","provider-private-authority"].includes(row.difference))issues.push(`${label}: unaccepted scope exclusion`);
      continue;
    }
    if(row.status!=="FULL")continue;
    if(!candidate(row.candidate)||row.candidate===observedHead||candidateOverlays.get(row.candidate)!==true)
      issues.push(`${label}: FULL must name the exact tested source candidate followed only by claim/evidence metadata`);
    if(!candidate(row.sourceSnapshotCommit)||!driftReport||driftReport.from!==baseline.commit||driftReport.to!==row.sourceSnapshotCommit||driftReport.autoAdopt!==false||
      !Array.isArray(driftReport.changes)||!Array.isArray(driftReport.invalidatedPaths)||driftReport.invalidatedPaths.some(value=>typeof value!=="string"))
      issues.push(`${label}: FULL requires an exact baseline-to-source-candidate drift report`);
    if(row.remaining?.length)issues.push(`${label}: FULL cannot retain gaps`);
    if(!row.implementation?.length||!row.tests?.length)issues.push(`${label}: FULL needs implemented behavior and tests`);
    const changedPaths=new Set((driftReport?.changes??[]).flatMap(change=>[change?.path,...(change?.to?[change.to]:[])]).filter(value=>typeof value==="string"));
    const unknownImpact=[...changedPaths].some(path=>!mappedPaths.has(path))||
      driftReport?.affectedRequirements?.some(impact=>impact?.requirementId===label)||
      driftReport?.unmappedImpactPaths?.length>0;
    if(unknownImpact||Array.isArray(row.sourceHashes)&&row.sourceHashes.some(id=>(sources.get(id)??[]).some(path=>driftReport?.invalidatedPaths?.includes(path))))issues.push(`${label}: source drift invalidates FULL`);
    const boundaries=Object.fromEntries(Object.keys(minimums[row.id]).map(key=>[key,minimums[row.id][key]||row[key]]));
    const requirements=["positive","negative","failure","recovery",...(boundaries.stateful?["restart","cross-session"]:[]),
      ...(boundaries.platformSensitive?["linux","windows","macos"]:[]),...(boundaries.piBoundary?["pi-host"]:[]),...(boundaries.modelBoundary?["pi-model"]:[])];
    if(!Array.isArray(row.evidence)){issues.push(`${label}: FULL lacks executed evidence`);continue;}
    const evidenceIds=new Set();
    for(const proof of row.evidence){
      if(!proof||typeof proof.id!=="string"||!proof.id.trim()||evidenceIds.has(proof.id)||proof.result!=="PASS"||
        proof.candidate!==row.candidate||proof.sourceCommit!==baseline.commit||!requirements.includes(proof.kind)||
        !["DETERMINISTIC_EXECUTION","OS_RUNTIME","REAL_PI_HOST","REAL_PI_MODEL"].includes(proof.class)||
        typeof proof.command!=="string"||!proof.command.trim()||typeof proof.observation!=="string"||!proof.observation.trim()||
        !safePath(proof.recordPath)||!proof.recordPath.startsWith("registry/evidence/ecosystem/")||!existingPaths.has(proof.recordPath)||!hash(proof.recordSha256)||
        recordDigests.get(proof.recordPath)!==proof.recordSha256)issues.push(`${label}: invalid executed evidence record`);
      evidenceIds.add(proof?.id);
      const receipt=records.get(proof?.recordPath);
      if(!receipt||["id","candidate","sourceCommit","kind","class","command","observation","result"].some(key=>receipt[key]!==proof?.[key]))
        issues.push(`${label}: evidence receipt/content binding mismatch`);
      if(proof?.kind==="pi-host"&&proof.class!=="REAL_PI_HOST"||proof?.kind==="pi-model"&&proof.class!=="REAL_PI_MODEL"||
        ["linux","windows","macos"].includes(proof?.kind)&&proof.class!=="OS_RUNTIME")issues.push(`${label}: fixture cannot prove host/platform/model execution`);
    }
    for(const kind of requirements)if(!row.evidence.some(proof=>proof?.kind===kind&&proof?.result==="PASS"))issues.push(`${label}: missing ${kind} evidence`);
  }
  return issues;
}

export function loadEcosystemClaims(root=defaultRoot,{verifyCandidateReport:verifyReport=verifyEcosystemCandidateReport}={}) {
 try{
  const baselineBytes=readFileSync(path.join(root,"registry/parity/ecosystem-sources-v1.json"));
  const claimsBytes=readFileSync(path.join(root,"registry/parity/ecosystem-claims-v1.json"));
  const adjudicationBytes=readFileSync(path.join(root,"registry/parity/ecosystem-reference-adjudications-v1.json"));
  const mappingBytes=readFileSync(path.join(root,"registry/parity/ecosystem-runtime-edge-mappings-v1.json"));
  const baseline=JSON.parse(baselineBytes.toString("utf8"));
  const registry=JSON.parse(claimsBytes.toString("utf8"));
  const sourceRepository=process.env.ECOSYSTEM_SOURCE_REPOSITORY,sourceSnapshotCommit=process.env.ECOSYSTEM_SOURCE_CANDIDATE,candidateReportPath=process.env.ECOSYSTEM_CANDIDATE_REPORT;
  if(Boolean(sourceRepository)!==Boolean(sourceSnapshotCommit)&&!candidateReportPath)throw new Error("An exact source repository and candidate commit must be supplied together");
  if(candidateReportPath&&!sourceRepository)throw new Error("Verifying a candidate report requires its exact source Git repository");
  let driftReport;
  if(candidateReportPath){
    const report=JSON.parse(readFileSync(candidateReportPath,"utf8"));
    if(sourceSnapshotCommit&&sourceSnapshotCommit!==report.inputs?.candidateCommit)throw new Error("Candidate report and source candidate commit disagree");
    const verified=verifyReport(sourceRepository,report,{baselineBytes,mappingBytes,adjudicationBytes,claimsBytes});
    driftReport={from:verified.inputs.baselineCommit,to:verified.inputs.candidateCommit,autoAdopt:false,changes:verified.changes,invalidatedPaths:verified.invalidatedPaths,
      affectedRequirements:verified.affectedRequirements,unmappedImpactPaths:verified.unmappedImpactPaths};
  }else if(sourceRepository&&sourceSnapshotCommit){
    const overlay=JSON.parse(adjudicationBytes.toString("utf8"));
    const mappings=JSON.parse(mappingBytes.toString("utf8"));
    driftReport=detectMappedBaselineDrift(sourceRepository,baseline,collectBaseline(sourceRepository,sourceSnapshotCommit),overlay,mappings);
  }
  const paths=registry.rows.flatMap(row=>[...(row.implementation??[]),...(row.tests??[]),...(row.evidence??[]).map(proof=>proof.recordPath)]);
  const existingPaths=new Set(paths.filter(value=>safePath(value)&&existsSync(path.join(root,value)))),recordDigests=new Map(),records=new Map(),approvalRecords=new Map();
  for(const filename of existingPaths)if(/^registry\/evidence\/ecosystem\/[^/]+\.json$/.test(filename)){
    const actual=realpathSync(path.join(root,filename)),relative=path.relative(realpathSync(root),actual);
    if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("Evidence receipt escapes project");
    const bytes=readFileSync(actual);recordDigests.set(filename,createHash("sha256").update(bytes).digest("hex"));
    records.set(filename,JSON.parse(bytes.toString("utf8")));
  }
  const rootReal=realpathSync(root);
  for(const row of registry.rows){
    const reference=row?.provenanceApproval,match=exactKeys(reference,["path","sha256"])&&typeof reference.path==="string"&&reference.path.match(approvalPath);
    if(!match||match[1]!==row.id||!existsSync(path.join(root,reference.path)))continue;
    const actual=realpathSync(path.join(root,reference.path)),relative=path.relative(rootReal,actual);
    if(relative.startsWith("..")||path.isAbsolute(relative)){approvalRecords.set(reference.path,{unsafe:true});continue;}
    approvalRecords.set(reference.path,{bytes:readFileSync(actual)});
  }
  const observedHead=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim(),candidateOverlays=new Map();
  for(const row of registry.rows.filter(row=>row?.status==="FULL"&&candidate(row.candidate)&&row.candidate!==observedHead)){
    let isAncestor=false,paths=[];
    try{
      execFileSync("git",["-C",root,"merge-base","--is-ancestor",row.candidate,observedHead],{stdio:"ignore"});
      isAncestor=true;
      paths=execFileSync("git",["-C",root,"diff","--name-only","-z",`${row.candidate}..${observedHead}`],{encoding:"utf8"}).split("\0").filter(Boolean);
    }catch{/* A missing/non-ancestor candidate fails closed. */}
    candidateOverlays.set(row.candidate,isAncestor&&isEvidenceOnlyOverlay(paths));
  }
  return {baseline,registry,existingPaths,recordDigests,records,approvalRecords,observedHead,driftReport,candidateOverlays};
 }catch(error){throw error;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=loadEcosystemClaims(),issues=validateEcosystemClaims(input);
  if(issues.length)throw new Error(issues.join("\n"));
  const counts={};for(const row of input.registry.rows)counts[row.status]=(counts[row.status]??0)+1;
  console.log(`ecosystem claims: PASS (${JSON.stringify(counts)}; validation is not global parity)`);
}
