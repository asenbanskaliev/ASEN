import {existsSync,readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST_PATH="registry/parity/skill-sources-v1.json";
const MATRIX_PATH="registry/parity/skill-contract-parity-v1.json";
const CAPABILITY_PATH="registry/capabilities/CAP-SKL-001-pi-native-skills.yaml";
const DIMENSIONS=["activation","hardRules","decisionGates","outputs","prohibited"];
const STATUSES=new Set(["FULL","PARTIAL","MISSING"]);
const SUPPORT_DOCUMENTS=new Map([
 ["skills/_shared/review-ledger-contract.md","present"],
 ["skills/chained-pr/references/chaining-details.md","present"],
 ["skills/issue-creation/references/delegated-workflow-actions.md","present"],
 ["skills/judgment-day/references/prompts-and-formats.md","present"],
 ["docs/skill-style-guide.md","present"],
 ["skills/_shared/skill-resolver.md","absent-at-baseline"]
]);
const HASH=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const AUTOMATED_PATH=/^(?:tests\/|scripts\/)/;
const REPOSITORY_PATH=/^(?:docs|registry|scripts|skills|src|tests)\//;

/** @typedef {{id:string,kind:string,path:string,status:string,bytes:number|null,sha256:string|null}} Source */
/** @typedef {{manifest:{baseline:{commit:string},sources:Source[]},matrix:Record<string,any>,existingPaths:Set<string>,capabilityStatus:string}} SkillParityInput */

/** Load the self-contained checked-in contract data and repository path facts. */
export function loadCheckedInSkillContractParity(root=ROOT){
 const readJson=path=>{
  try{return JSON.parse(readFileSync(resolve(root,path),"utf8"));}
  catch(error){throw new Error(`cannot read parity JSON ${path}`,{cause:error});}
 };
 const manifest=readJson(MANIFEST_PATH),matrix=readJson(MATRIX_PATH);
 const candidates=new Set();
 const visit=value=>{
  if(typeof value==="string"&&REPOSITORY_PATH.test(value))candidates.add(value);
  else if(Array.isArray(value))value.forEach(visit);
  else if(value&&typeof value==="object")Object.values(value).forEach(visit);
 };
 visit(matrix);
 const existingPaths=new Set([...candidates].filter(path=>existsSync(resolve(root,path))));
 const capability=readFileSync(resolve(root,CAPABILITY_PATH),"utf8");
 const capabilityStatus=capability.match(/^status:\s*(\S+)\s*$/m)?.[1]??"";
 return {manifest,matrix,existingPaths,capabilityStatus};
}

/** Pure validation: all filesystem facts are supplied through input.existingPaths. */
export function validateSkillContractParity(input){
 const {manifest,matrix,existingPaths,capabilityStatus}=input;
 const issues=[];
 const sources=Array.isArray(manifest?.sources)?manifest.sources:[];
 const skillSources=sources.filter(source=>source.kind==="skill");
 const skillIds=skillSources.map(source=>source.id);
 const sourceIds=new Set(sources.map(source=>source.id));
 const uniqueSkillIds=new Set(skillIds);
 if(skillSources.length!==12||uniqueSkillIds.size!==12)
  issues.push(`expected exactly 12 unique source Skills, got ${skillSources.length}/${uniqueSkillIds.size}`);
 if(sourceIds.size!==sources.length)issues.push("source document IDs must be unique");

 for(const source of sources){
  const present=source.status==="present";
  const absent=source.status==="absent-at-baseline";
  const presentMetadata=Number.isInteger(source.bytes)&&source.bytes>0&&HASH.test(source.sha256??"");
  const absentMetadata=source.bytes===null&&source.sha256===null;
  if((present&&!presentMetadata)||(absent&&!absentMetadata)||(!present&&!absent))
   issues.push(`invalid document metadata for ${source.id}`);
 }
 for(const [path,status] of SUPPORT_DOCUMENTS){
  const source=sources.find(candidate=>candidate.path===path&&candidate.kind==="support-contract");
  if(!source)issues.push(`missing support contract ${path}`);
  else if(source.status!==status)issues.push(`invalid support contract status for ${path}`);
 }

 const matrixSourceCommit=matrix?.sourceCommit;
 if(typeof matrixSourceCommit!=="string"||!GIT_SHA.test(matrixSourceCommit))
  issues.push("matrix source commit must be a 40-character lowercase Git SHA");
 else if(matrixSourceCommit!==manifest?.baseline?.commit)
  issues.push("matrix source commit does not match the manifest source commit");
 const contracts=Array.isArray(matrix?.contracts)?matrix.contracts:[];
 const contractIds=new Set(contracts.map(contract=>contract.id));
 const rows=Array.isArray(matrix?.rows)?matrix.rows:[];
 const referencedSources=[];
 const collectReferences=value=>{
  if(!value||typeof value!=="object")return;
  for(const [key,child] of Object.entries(value)){
   if(key==="sourceId"&&typeof child==="string")referencedSources.push(child);
   if(key==="sourceReferences"&&Array.isArray(child))referencedSources.push(...child);
   collectReferences(child);
  }
 };
 collectReferences(matrix);
 for(const reference of referencedSources)
  if(!sourceIds.has(reference))issues.push(`unknown source reference ${reference}`);

 const rowSourceIds=rows.map(row=>row.sourceId);
 const exactRows=rowSourceIds.length===skillIds.length&&new Set(rowSourceIds).size===rowSourceIds.length&&
  [...rowSourceIds].sort().join("\n")===[...skillIds].sort().join("\n");
 if(!exactRows)issues.push("row source IDs must equal the manifest's exact 12 Skill IDs");

 for(const row of rows){
  const label=row.sourceId??"unknown row";
  if(!STATUSES.has(row.status))issues.push(`invalid status for ${label}`);
  for(const dimension of DIMENSIONS){
   if(!Array.isArray(row[dimension])||row[dimension].length===0)
    issues.push(`${label} requires nonempty ${dimension}`);
   for(const id of row[dimension]??[])
    if(!contractIds.has(id))issues.push(`${label} references undeclared contract ID ${id}`);
  }
  for(const field of ["gaps","equivalentAdaptations"])
   for(const difference of row[field]??[])
    if(!contractIds.has(difference.contractId))issues.push(`${label} ${field} references undeclared contract ID ${difference.contractId}`);
  if((row.status==="PARTIAL"||row.status==="MISSING")&&(!Array.isArray(row.gaps)||row.gaps.length===0))
   issues.push(`${label} ${row.status} requires a documented gap`);
  if(row.status==="FULL"){
   if((row.gaps?.length??0)>0)issues.push(`${label} FULL cannot declare gaps`);
   if(!Array.isArray(row.evidence)||row.evidence.length===0)issues.push(`${label} FULL requires evidence`);
   const evidencePaths=(row.evidence??[]).filter(value=>typeof value==="string"&&REPOSITORY_PATH.test(value));
   for(const path of evidencePaths)if(!existingPaths.has(path))issues.push(`${label} evidence path does not exist: ${path}`);
   if(!evidencePaths.some(path=>AUTOMATED_PATH.test(path)&&existingPaths.has(path)))
    issues.push(`${label} FULL requires an existing automated evidence path under tests/ or scripts/`);
  }
  if(typeof row.asenSkill!=="string"||!existingPaths.has(row.asenSkill))
   issues.push(`${label} ASEN Skill does not exist: ${row.asenSkill??"missing"}`);
 }

 if(matrix?.registryPath!==".asen/skill-registry.md")issues.push("registryPath must be .asen/skill-registry.md");
 if(/\.atl(?:\/|\\|\b)/i.test(JSON.stringify(matrix)))issues.push("forbidden legacy registry token found");
 if(capabilityStatus!=="specified")issues.push("CAP-SKL-001 must remain specified");
 return issues;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const issues=validateSkillContractParity(loadCheckedInSkillContractParity());
 if(issues.length){console.error(issues.join("\n"));process.exitCode=1;}
 else console.log("skill contract parity: PASS (12 Skills)");
}
