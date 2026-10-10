import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {collectBaseline,detectMappedBaselineDrift,validateBaseline,verifyBaselineObjects} from "./ecosystem-baseline.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const sha256=value=>createHash("sha256").update(value).digest("hex");
const readJson=relative=>readFileSync(path.join(root,relative));
const safePath=value=>typeof value==="string"&&value.length>0&&value.length<1024&&!/[\\\u0000-\u001f\u007f]/.test(value)&&!path.posix.isAbsolute(value)&&value.split("/").every(part=>part&&part!=="."&&part!=="..");
const claimStatuses=["FULL","PARTIAL","MISSING","OUT-OF-SCOPE"];
const changeKinds=["ADDED","REMOVED","RENAMED","CONTENT_CHANGED","PERMISSIONS_CHANGED","ANCHORS_CHANGED","REFERENCES_CHANGED","DEPENDENCIES_CHANGED"];
const reportAnchors=source=>source?[...source.anchors,{line:1,kind:"source-content",sha256:source.sha256}]:[];

export function assertExactCandidate(repository,commit,baselineCommit){
 if(typeof commit!=="string"||!/^[a-f0-9]{40}$/.test(commit))throw new Error("Candidate must be an exact full Git commit SHA");
 if(typeof baselineCommit!=="string"||!/^[a-f0-9]{40}$/.test(baselineCommit))throw new Error("Frozen source must be an exact full Git commit SHA");
 const git=(...args)=>execFileSync("git",["-C",repository,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],env:{...process.env,GIT_NO_REPLACE_OBJECTS:"1"},maxBuffer:32*1024*1024}).trim();
 if(git("cat-file","-t",commit)!=="commit")throw new Error("Candidate SHA is unavailable as a commit object");
 if(git("cat-file","-t",baselineCommit)!=="commit")throw new Error("Frozen source SHA is unavailable as a commit object");
 try{git("merge-base","--is-ancestor",baselineCommit,commit);}catch{throw new Error("Candidate is not a descendant of the frozen source commit");}
}

export function bindEcosystemDriftReport({baseline,after,drift,baselineBytes=JSON.stringify(baseline),mappingBytes,adjudicationBytes,claimsBytes}){
 if(validateBaseline(baseline).length||validateBaseline(after).length||!drift||drift.from!==baseline.commit||drift.to!==after.commit||drift.autoAdopt!==false||
  !Array.isArray(drift.changes)||!Array.isArray(drift.invalidatedPaths)||drift.invalidatedPaths.some(value=>!safePath(value))||
  new Set(drift.invalidatedPaths).size!==drift.invalidatedPaths.length||JSON.stringify([...drift.invalidatedPaths].sort())!==JSON.stringify(drift.invalidatedPaths)||
  drift.changes.some(change=>!change||!changeKinds.includes(change.kind)||!safePath(change.path)||
   (change.kind==="RENAMED"?!safePath(change.to):change.to!==undefined)||
   change.kind==="PERMISSIONS_CHANGED"&&(!["100644","100755"].includes(change.fromMode)||!["100644","100755"].includes(change.toMode)||change.fromMode===change.toMode)))
  throw new Error("Cannot bind an invalid or adoptive ecosystem drift report");
 if(drift.changes.some(change=>!drift.invalidatedPaths.includes(change.path)||(change.kind==="RENAMED"&&!drift.invalidatedPaths.includes(change.to))))
  throw new Error("Drift invalidation omits a changed source path");
 const parseBytes=value=>JSON.parse(Buffer.isBuffer(value)?value.toString("utf8"):value);
 const parsedBaseline=parseBytes(baselineBytes),mapping=parseBytes(mappingBytes),adjudications=parseBytes(adjudicationBytes),claims=parseBytes(claimsBytes),pathsByHash=new Map();
 if(JSON.stringify(parsedBaseline)!==JSON.stringify(baseline))throw new Error("Baseline bytes do not identify the compared source manifest");
 if(!mapping||mapping.version!==1||mapping.baselineCommit!==baseline.commit||!Array.isArray(mapping.mappings)||
  !adjudications||adjudications.version!==1||adjudications.baselineCommit!==baseline.commit||!Array.isArray(adjudications.adjudications))throw new Error("Drift mappings are not bound to the frozen source baseline");
 if(!claims||claims.version!==1||claims.sourceCommit!==baseline.commit||!Array.isArray(claims.rows))throw new Error("Requirement/evidence map is not bound to the frozen source baseline");
 const requirementIds=Array.from({length:16},(_,index)=>`ECO-${String(index+1).padStart(2,"0")}`);
 if(claims.rows.length!==16||new Set(claims.rows.map(row=>row?.id)).size!==16||requirementIds.some(id=>!claims.rows.some(row=>row?.id===id)))throw new Error("Requirement/evidence map must identify every unique ECO unit");
 for(const source of baseline.files){const paths=pathsByHash.get(source.sha256)??[];paths.push(source.path);pathsByHash.set(source.sha256,paths);}
 const coveredPaths=new Set(claims.rows.flatMap(row=>row.sourceHashes.flatMap(hash=>pathsByHash.get(hash)??[])));
 const changedPaths=[...new Set(drift.changes.flatMap(change=>[change.path,...(change.to?[change.to]:[])]))];
 const beforeFiles=new Map(baseline.files.map(file=>[file.path,file])),afterFiles=new Map(after.files.map(file=>[file.path,file]));
 // Preserve the exact anchor inventory on both sides so public-contract and normative-line
 // changes are reviewable without re-running a line-number heuristic against a later checkout.
 // The whole-blob digest also makes implementation-only edits visible when heuristics find no anchor.
 const anchorDiffs=changedPaths.flatMap(sourcePath=>{
  const before=reportAnchors(beforeFiles.get(sourcePath)),next=reportAnchors(afterFiles.get(sourcePath));
  return JSON.stringify(before)===JSON.stringify(next)?[]:[{path:sourcePath,beforeCommit:baseline.commit,afterCommit:after.commit,before,after:next}];
 }).sort((a,b)=>a.path.localeCompare(b.path,"en"));
 // A changed or added source with no explicit requirement mapping has unknown semantic impact.
 // Conservatively require every ECO row to be audited instead of silently omitting it.
 const unmappedImpactPaths=changedPaths.filter(sourcePath=>!coveredPaths.has(sourcePath)).sort();
 const affectedRequirements=[];
 for(const row of claims.rows){
  if(!row||!claimStatuses.includes(row.status)||!Array.isArray(row.sourceHashes)||!row.sourceHashes.length||new Set(row.sourceHashes).size!==row.sourceHashes.length||row.sourceHashes.some(hash=>!pathsByHash.has(hash))||
   !Array.isArray(row.evidence)||row.evidence.some(item=>!item||typeof item.id!=="string"||!item.id.trim()||!safePath(item.recordPath)||
    item.recordSha256!==undefined&&!/^[a-f0-9]{64}$/.test(item.recordSha256))||new Set(row.evidence.map(item=>item.id)).size!==row.evidence.length)
   throw new Error("Requirement/evidence map contains an unresolved source identity");
  const sourcePaths=[...new Set((row.sourceHashes??[]).flatMap(hash=>pathsByHash.get(hash)??[]))].sort();
  const impacted=[...new Set([...sourcePaths.filter(sourcePath=>drift.invalidatedPaths.includes(sourcePath)),...unmappedImpactPaths])].sort();
  if(!impacted.length)continue;
  const evidence=(row.evidence??[]).map(item=>({id:item.id,path:item.recordPath,sha256:item.recordSha256??null})).sort((a,b)=>a.id.localeCompare(b.id,"en"));
  affectedRequirements.push({requirementId:row.id,claimStatus:row.status,auditRequired:true,impactBasis:unmappedImpactPaths.length?"CONSERVATIVE_UNMAPPED_FALLBACK":"SOURCE_MAP",
   effectiveStatus:row.status==="FULL"?"INVALIDATED":"REVIEW_REQUIRED",invalidatedSourcePaths:impacted,evidence});
 }
 affectedRequirements.sort((a,b)=>a.requirementId.localeCompare(b.requirementId,"en"));
 const unsigned={schema:"asen.ecosystem-drift-report.v3",autoAdopt:false,
  inputs:{baselineCommit:baseline.commit,baselineTree:baseline.tree,baselineSha256:sha256(baselineBytes),candidateCommit:after.commit,candidateTree:after.tree,
   runtimeEdgeMapSha256:sha256(mappingBytes),referenceAdjudicationSha256:sha256(adjudicationBytes),requirementEvidenceMapSha256:sha256(claimsBytes)},
  changes:drift.changes,invalidatedPaths:drift.invalidatedPaths,anchorDiffs,unmappedImpactPaths,affectedRequirements};
 return {...unsigned,integritySha256:sha256(JSON.stringify(unsigned))};
}

/** Builds an immutable report bound to exact source and metadata identities; it never updates a manifest or claim. */
export function createEcosystemCandidateReport(repository,candidateCommit,{baselineBytes=readJson("registry/parity/ecosystem-sources-v1.json"),mappingBytes=readJson("registry/parity/ecosystem-runtime-edge-mappings-v1.json"),adjudicationBytes=readJson("registry/parity/ecosystem-reference-adjudications-v1.json"),claimsBytes=readJson("registry/parity/ecosystem-claims-v1.json")}={}){
 const baseline=JSON.parse(baselineBytes),mapping=JSON.parse(mappingBytes),adjudications=JSON.parse(adjudicationBytes);
 if(validateBaseline(baseline).length)throw new Error("Frozen source baseline is malformed");
 assertExactCandidate(repository,candidateCommit,baseline.commit);
 verifyBaselineObjects(repository,baseline);
 const after=collectBaseline(repository,candidateCommit),drift=detectMappedBaselineDrift(repository,baseline,after,adjudications,mapping);
 return bindEcosystemDriftReport({baseline,after,drift,baselineBytes,mappingBytes,adjudicationBytes,claimsBytes});
}

export function validateEcosystemCandidateReport(report){
 if(!report||report.schema!=="asen.ecosystem-drift-report.v3"||report.autoAdopt!==false||!report.inputs||
  !/^[a-f0-9]{40}$/.test(report.inputs.baselineCommit??"")||!/^[a-f0-9]{40}$/.test(report.inputs.candidateCommit??"")||
  !["baselineSha256","runtimeEdgeMapSha256","referenceAdjudicationSha256","requirementEvidenceMapSha256"].every(key=>/^[a-f0-9]{64}$/.test(report.inputs[key]??""))||
  !/^[a-f0-9]{40}$/.test(report.inputs.baselineTree??"")||!/^[a-f0-9]{40}$/.test(report.inputs.candidateTree??"")||
  !["runtimeEdgeMapSha256","referenceAdjudicationSha256","requirementEvidenceMapSha256"].every(key=>/^[a-f0-9]{64}$/.test(report.inputs[key]??""))||
  !Array.isArray(report.changes)||report.changes.some(change=>!change||!changeKinds.includes(change.kind)||!safePath(change.path)||
   (change.kind==="RENAMED"?!safePath(change.to):change.to!==undefined)||
   change.kind==="PERMISSIONS_CHANGED"&&(!["100644","100755"].includes(change.fromMode)||!["100644","100755"].includes(change.toMode)||change.fromMode===change.toMode))||
  !Array.isArray(report.unmappedImpactPaths)||report.unmappedImpactPaths.some(value=>!safePath(value))||
  new Set(report.unmappedImpactPaths).size!==report.unmappedImpactPaths.length||JSON.stringify([...report.unmappedImpactPaths].sort())!==JSON.stringify(report.unmappedImpactPaths)||
  !Array.isArray(report.anchorDiffs)||report.anchorDiffs.some(row=>!row||!safePath(row.path)||row.beforeCommit!==report.inputs.baselineCommit||row.afterCommit!==report.inputs.candidateCommit||
   !Array.isArray(row.before)||!Array.isArray(row.after)||JSON.stringify(row.before)===JSON.stringify(row.after)||
   !report.changes.some(change=>change.path===row.path||change.to===row.path)||
   [...row.before,...row.after].some(anchor=>!anchor||!Number.isSafeInteger(anchor.line)||anchor.line<1||!/^[a-f0-9]{64}$/.test(anchor.sha256)||
    anchor.kind==="public-contract"&&(!Number.isSafeInteger(anchor.endLine)||anchor.endLine<anchor.line)||
    anchor.kind==="source-content"&&(anchor.line!==1||anchor.endLine!==undefined)||
    anchor.kind!==undefined&&!["public-contract","source-content"].includes(anchor.kind)||
    anchor.kind===undefined&&anchor.endLine!==undefined))||
  !Array.isArray(report.invalidatedPaths)||report.invalidatedPaths.some(value=>!safePath(value))||new Set(report.invalidatedPaths).size!==report.invalidatedPaths.length||
  JSON.stringify([...report.invalidatedPaths].sort())!==JSON.stringify(report.invalidatedPaths)||report.changes.some(change=>!report.invalidatedPaths.includes(change.path)||(change.kind==="RENAMED"&&!report.invalidatedPaths.includes(change.to)))||
  !Array.isArray(report.affectedRequirements)||new Set(report.affectedRequirements.map(row=>row?.requirementId)).size!==report.affectedRequirements.length||report.affectedRequirements.some(row=>!row||typeof row.requirementId!=="string"||
   !["FULL","PARTIAL","MISSING","OUT-OF-SCOPE"].includes(row.claimStatus)||!Array.isArray(row.invalidatedSourcePaths)||
   !["SOURCE_MAP","CONSERVATIVE_UNMAPPED_FALLBACK"].includes(row.impactBasis)||
   row.auditRequired!==true||row.effectiveStatus!==(row.claimStatus==="FULL"?"INVALIDATED":"REVIEW_REQUIRED")||
   row.invalidatedSourcePaths.some(value=>!report.invalidatedPaths.includes(value)||!safePath(value))||!row.invalidatedSourcePaths.length||
   new Set(row.invalidatedSourcePaths).size!==row.invalidatedSourcePaths.length||JSON.stringify([...row.invalidatedSourcePaths].sort())!==JSON.stringify(row.invalidatedSourcePaths)||!Array.isArray(row.evidence)||
   row.evidence.some(item=>!item||typeof item.id!=="string"||typeof item.path!=="string"||!safePath(item.path)||item.sha256!==null&&!/^[a-f0-9]{64}$/.test(item.sha256))||new Set(row.evidence.map(item=>item.id)).size!==row.evidence.length)||
  !/^[a-f0-9]{64}$/.test(report.integritySha256??""))return false;
 const {integritySha256,...unsigned}=report;
 return integritySha256===sha256(JSON.stringify(unsigned));
}

/** A caller-computed self-hash is not source authority; exact re-derivation must match every field. */
export function assertCandidateReportMatches(expected,report){
 if(!validateEcosystemCandidateReport(expected)||!validateEcosystemCandidateReport(report)||JSON.stringify(expected)!==JSON.stringify(report))
  throw new Error("Candidate report does not match re-derived exact source drift and impact");
 return expected;
}

/** Re-derive a report from the exact candidate objects and trusted frozen inputs before it can affect claims. */
export function verifyEcosystemCandidateReport(repository,report,{baselineBytes=readJson("registry/parity/ecosystem-sources-v1.json"),mappingBytes=readJson("registry/parity/ecosystem-runtime-edge-mappings-v1.json"),adjudicationBytes=readJson("registry/parity/ecosystem-reference-adjudications-v1.json"),claimsBytes=readJson("registry/parity/ecosystem-claims-v1.json")}={}){
 if(!validateEcosystemCandidateReport(report))throw new Error("Candidate report integrity check failed");
 const expected=createEcosystemCandidateReport(repository,report.inputs.candidateCommit,{baselineBytes,mappingBytes,adjudicationBytes,claimsBytes});
 return assertCandidateReportMatches(expected,report);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [repository,candidateCommit,outputPath]=process.argv.slice(2);
 if(!repository||!candidateCommit)throw new Error("Usage: node scripts/ecosystem-candidate-report.mjs <source-git-repository> <exact-candidate-sha> [report.json]");
 const report=createEcosystemCandidateReport(repository,candidateCommit);
 if(!validateEcosystemCandidateReport(report))throw new Error("Generated report integrity check failed");
 const output=JSON.stringify(report,null,2)+"\n";
 if(outputPath)writeFileSync(outputPath,output,{flag:"wx"});
 else process.stdout.write(output);
}
