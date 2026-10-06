import {readFileSync,existsSync,realpathSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {validateBaseline} from "./ecosystem-baseline.mjs";

const units=Array.from({length:16},(_,index)=>`ECO-${String(index+1).padStart(2,"0")}`);
const hash=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const candidate=value=>typeof value==="string"&&/^[a-f0-9]{40}$/.test(value);
const safePath=value=>typeof value==="string"&&/^(?:src|extensions|tests|scripts|docs|odd|registry)\//.test(value)&&
  !/[\\\u0000-\u001f]/.test(value)&&value.split("/").every(part=>part&&part!=="."&&part!=="..");

/** Static validation checks evidence contracts; it does not mint authority or execute evidence. */
export function validateEcosystemClaims({baseline,registry,existingPaths,observedHead,invalidatedPaths=[],recordDigests=new Map(),records=new Map()}) {
  const issues=validateBaseline(baseline);
  if(issues.length)return issues;
  if(!registry||registry.version!==1||registry.sourceCommit!==baseline.commit||!Array.isArray(registry.rows))
    return ["Invalid ecosystem claims envelope or frozen source identity"];
  const ids=registry.rows.map(row=>row?.id);
  if(ids.length!==units.length||new Set(ids).size!==units.length||units.some(id=>!ids.includes(id)))issues.push("Every ECO unit requires exactly one claim row");
  const sources=new Map(baseline.files.map(row=>[row.sha256,row.path]));
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
    for(const flag of ["stateful","platformSensitive","piBoundary","modelBoundary"])
      if(typeof row[flag]!=="boolean")issues.push(`${label}: explicit ${flag} boundary is required`);
    if(row.modelBoundary&&!row.piBoundary)issues.push(`${label}: model boundary requires Pi ownership`);
    if(row.status==="OUT-OF-SCOPE") {
      if(!["branding","copied-artwork-or-prose","provider-private-authority"].includes(row.difference))issues.push(`${label}: unaccepted scope exclusion`);
      continue;
    }
    if(row.status!=="FULL")continue;
    if(!candidate(row.candidate)||row.candidate!==observedHead)issues.push(`${label}: FULL must name the exact observed candidate`);
    if(row.remaining?.length)issues.push(`${label}: FULL cannot retain gaps`);
    if(!row.implementation?.length||!row.tests?.length)issues.push(`${label}: FULL needs implemented behavior and tests`);
    if(Array.isArray(row.sourceHashes)&&row.sourceHashes.some(id=>invalidatedPaths.includes(sources.get(id))))issues.push(`${label}: source drift invalidates FULL`);
    const requirements=["positive","negative","failure","recovery",...(row.stateful?["restart","cross-session"]:[]),
      ...(row.platformSensitive?["linux","windows","macos"]:[]),...(row.piBoundary?["pi-host"]:[]),...(row.modelBoundary?["pi-model"]:[])];
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

export function loadEcosystemClaims(root=fileURLToPath(new URL("../",import.meta.url))) {
  const baseline=JSON.parse(readFileSync(path.join(root,"registry/parity/ecosystem-sources-v1.json"),"utf8"));
  const registry=JSON.parse(readFileSync(path.join(root,"registry/parity/ecosystem-claims-v1.json"),"utf8"));
  const paths=registry.rows.flatMap(row=>[...(row.implementation??[]),...(row.tests??[]),...(row.evidence??[]).map(proof=>proof.recordPath)]);
  const existingPaths=new Set(paths.filter(value=>safePath(value)&&existsSync(path.join(root,value)))),recordDigests=new Map(),records=new Map();
  for(const filename of existingPaths)if(/^registry\/evidence\/ecosystem\/[^/]+\.json$/.test(filename)){
    const actual=realpathSync(path.join(root,filename)),relative=path.relative(realpathSync(root),actual);
    if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("Evidence receipt escapes project");
    const bytes=readFileSync(actual);recordDigests.set(filename,createHash("sha256").update(bytes).digest("hex"));
    records.set(filename,JSON.parse(bytes.toString("utf8")));
  }
  const observedHead=execFileSync("git",["-C",root,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  return {baseline,registry,existingPaths,recordDigests,records,observedHead};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=loadEcosystemClaims(),issues=validateEcosystemClaims(input);
  if(issues.length)throw new Error(issues.join("\n"));
  const counts={};for(const row of input.registry.rows)counts[row.status]=(counts[row.status]??0)+1;
  console.log(`ecosystem claims: PASS (${JSON.stringify(counts)}; validation is not global parity)`);
}
