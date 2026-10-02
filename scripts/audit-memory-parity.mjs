import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST="registry/parity/memory-upstream-v3.json";
const FOUNDATION_MANIFEST="registry/parity/memory-foundation-contracts-v1.json";
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]+$/;
const TOP_FIELDS=["schemaVersion","scope","statusModel","limitations","targets","sources","families"];
const TARGET_FIELDS=["id","repository","version","tag","tagObject","commit","publishedAt","channel","apiRefUrl","tagUrl"];
const SOURCE_FIELDS=["id","targetId","path","bytes","sha256","rawUrl"];
const FAMILY_FIELDS=["id","title","status","facts","limitations"];
const FOUNDATION_TOP_FIELDS=["schemaVersion","scope","status","proofKind","limitations","sources","cases"];
const FOUNDATION_SOURCE_FIELDS=["id","path","bytes","sha256","commit","commitRole","lineStart","lineEnd"];
const FOUNDATION_CASE_FIELDS=["id","summary","evidence","input","trigger","ordering","output","durableState","sideEffects","negativeControls","versionControl","criticalValues"];
const FOUNDATION_EVIDENCE_FIELDS=["sourceId","startLine","endLine"];
const CORE_COMMIT="15a2f78885d7ad8ced23b2d1d88383e9bb472c17";
const FOUNDATION_SOURCE_ANCHORS={
 "internal/store/store.go":[501321,"2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b",997,9363],
 "internal/store/startup_gate_test.go":[24904,"d89e2f55fe5f33513902887ff8a150130f192773218b363383daf03f02205030",119,450],
 "internal/store/filesystem_policy.go":[2330,"7bf87a28de234d8c5319d9d5b75a40f58ecd6d5f51ed32a677a2234092e3a3e0",26,67],
 "internal/store/generation_fence.go":[12735,"39ca5c48d3843086867f64049894df2f218d165c1d28bdacd7ad4a31980a1865",16,110],
 "internal/store/migration_lock.go":[2500,"5259721e35d46953bb325ae482eb7dceed7f09324ad19e3de9ac7992245e7b4c",10,69]
};
const FOUNDATION_CRITICAL_ANCHORS={
 "FND-01":{absolutePathAccepted:true,relativePathRejected:true,rejectionBeforeMutation:true},
 "FND-02":{classification:"known_remote",rejected:true,mutationBarrier:["data_directory","database_triplet","instance_metadata","migration_lock"]},
 "FND-03":{unknown:"ALLOWED",inspectionFailure:"ALLOWED",unclassifiable:"ALLOWED",provedLocal:false,missingPathProbe:"closest_existing_ancestor"},
 "FND-04":{maxOpenConnections:1,transactionLock:"immediate",busyTimeoutMs:5000,journalMode:"WAL",synchronous:"NORMAL",foreignKeys:1,persistentWalMode:1,lockRetryBackoffMs:[10,25,50,100,200]},
 "FND-05":{schemaVersion:1,freshOrOlder:["migrate","repair","stamp_1"],currentVersion1:["migrate","repair","no_stamp"]},
 "FND-06":{futureVersionCondition:">1",skipStartup:["migration","repair","stamp"],compatibleCrudPermitted:["GET","Add","Update","Delete"],preVersionPreparationPermitted:true,readOnly:false},
 "FND-07":{processSerialization:true,versionRaceRecheck:true,replacementFence:true,lockFilePersists:true,startupWritesFenced:true},
 "FND-08":{failedPostOpenClosesHandle:true,normalCloseClosesHandle:true,persistentWalPreserved:true,priorFilesystemStateRolledBack:false}
};
const FOUNDATION_ORDER_ANCHOR=["generation_check","version_read","future_gate","migration_lock","generation_recheck","version_reread","migrate_repair","stamp_if_older"];
const FOUNDATION_EVIDENCE_ANCHORS=Object.freeze({
 "FND-01":Object.freeze([["SRC-FND-001",1007,1010]]),
 "FND-02":Object.freeze([["SRC-FND-001",1011,1016],["SRC-FND-002",144,211],["SRC-FND-003",41,55]]),
 "FND-03":Object.freeze([["SRC-FND-003",41,67],["SRC-FND-002",190,211]]),
 "FND-04":Object.freeze([["SRC-FND-001",1027,1112],["SRC-FND-002",119,143]]),
 "FND-05":Object.freeze([["SRC-FND-001",1114,1188],["SRC-FND-002",238,293]]),
 "FND-06":Object.freeze([["SRC-FND-001",1122,1179],["SRC-FND-001",3724,3853],["SRC-FND-001",4654,4663],["SRC-FND-001",4725,4809],["SRC-FND-001",4871,4951],["SRC-FND-002",339,450]]),
 "FND-07":Object.freeze([["SRC-FND-001",1119,1164],["SRC-FND-004",16,93],["SRC-FND-005",10,69]]),
 "FND-08":Object.freeze([["SRC-FND-001",1022,1056],["SRC-FND-002",119,143]])
});
// Pin repository identity without repeating external branding outside the provenance registry.
const REPOSITORY_SHA256="7ead05522b4ff6e758946f5c4e80e860bfea93b10ed488f217dc5ae97cf5cab3";
const TARGET_ANCHORS={
 core:{version:"3.0.0",tag:"v3.0.0",tagObject:"fcf2eb5b6fe445c19a2e5568612a0a421f0fd5e1",commit:"15a2f78885d7ad8ced23b2d1d88383e9bb472c17",publishedAt:"2026-10-01T22:30:47Z",channel:"core release"},
 pi:{version:"0.2.0",tag:"pi-v0.2.0",tagObject:"8795484df1725315d8bf2b9181afa67de78147b0",commit:"ce51810bd351f397e49728d6a5be81679cf18554",publishedAt:null,channel:"separate npm channel"}
};
const SOURCE_ANCHORS={
 "internal/store/store.go":[501321,"2ffd000ee7f8c8fc1ad0c3d130e88a8ab4878449866c9737215b3c6d8ffa555b"],
 "internal/store/store_migration_test.go":[39990,"70b196a0903c7690b7ae0a93295d9482345416ec5abae23c47bd5ce279ddacdc"],
 "internal/project/detect.go":[20411,"5ab182e6718761e0a759ff8c96336de359210ecf564b10f88f4a3aea45424300"],
 "internal/project/detect_test.go":[44643,"4d8a25a04a46f47ca23e2dd32dc468cef8b9cbe43fa7f9e72ca54ca762289741"],
 "internal/server/server.go":[73752,"53caec2f14679d5c9a2558c06ce6183e740bb1b78b4cebc33219b60271a53c20"],
 "internal/mcp/mcp.go":[147307,"613a6c74621cdae0c6b8af1fb79c5c121ba51ca4a9665621f9312c683199872d"],
 "plugin/pi/index.ts":[105598,"090e0fc8b6a30d36cff1259764aad093c432e5cfa65e28e687683795057ed431"]
};

const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const exactKeys=(value,expected,label,issues)=>{
 if(!object(value)){issues.push(`${label} must be an object`);return false;}
 const actual=Object.keys(value).sort(),wanted=[...expected].sort();
 if(actual.join("\n")!==wanted.join("\n"))issues.push(`${label} has unknown or missing properties`);
 return true;
};
const nonemptyStrings=value=>Array.isArray(value)&&value.every(item=>typeof item==="string"&&item.trim().length>0);
const duplicates=values=>new Set(values).size!==values.length;

/** Load the checked-in reference without network, database, or source execution. */
export function loadCheckedInMemoryParity(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory parity JSON ${MANIFEST}`,{cause:error});}
}

/** Load the source-inspected foundation contracts without executing upstream code. */
export function loadCheckedInMemoryFoundation(root=ROOT){
 try{return JSON.parse(readFileSync(resolve(root,FOUNDATION_MANIFEST),"utf8"));}
 catch(error){throw new Error(`cannot read memory foundation JSON ${FOUNDATION_MANIFEST}`,{cause:error});}
}

/** Pure structural and critical-value validation of source-inspected foundation contracts. */
export function validateMemoryFoundation(manifest){
 const issues=[];
 if(!exactKeys(manifest,FOUNDATION_TOP_FIELDS,"foundation manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("foundation schemaVersion must be 1");
 if(manifest.scope!=="reference_only")issues.push("foundation scope must be reference_only");
 if(manifest.status!=="SOURCE_INSPECTED")issues.push("foundation status must be SOURCE_INSPECTED");
 if(manifest.proofKind!=="source_inspection")issues.push("foundation proofKind must be source_inspection");
 if(!nonemptyStrings(manifest.limitations)||manifest.limitations.length===0)issues.push("foundation limitations must be nonempty strings");
 const sources=Array.isArray(manifest.sources)?manifest.sources:[],sourceIds=sources.map(source=>source?.id);
 const expectedSources=Array.from({length:5},(_,i)=>`SRC-FND-${String(i+1).padStart(3,"0")}`);
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("foundation source IDs must be strings");
 if(sources.length!==5||duplicates(sourceIds)||[...sourceIds].sort().join("\n")!==expectedSources.join("\n"))issues.push("foundation sources must contain exact unique IDs");
 const sourceById=new Map();
 for(const source of sources){
  if(!exactKeys(source,FOUNDATION_SOURCE_FIELDS,`foundation source ${source?.id??"unknown"}`,issues))continue;
  const anchor=typeof source.path==="string"?FOUNDATION_SOURCE_ANCHORS[source.path]:undefined;
  if(typeof source.id==="string")sourceById.set(source.id,source);
  if(!PATH.test(source.path??""))issues.push(`foundation source ${source.id} path is invalid`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`foundation source ${source.id} does not match its pinned byte/hash tuple`);
  if(source.commit!==CORE_COMMIT||source.commitRole!=="CORE-15a")issues.push(`foundation source ${source.id} has invalid commitRole or commit`);
  if(!anchor||source.lineStart!==anchor[2]||source.lineEnd!==anchor[3])issues.push(`foundation source ${source.id} has invalid declared line range`);
 }
 const cases=Array.isArray(manifest.cases)?manifest.cases:[],caseIds=cases.map(item=>item?.id);
 const expectedCases=Array.from({length:8},(_,i)=>`FND-${String(i+1).padStart(2,"0")}`);
 if(!caseIds.every(id=>typeof id==="string"))issues.push("foundation case IDs must be strings");
 if(cases.length!==8||duplicates(caseIds)||[...caseIds].sort().join("\n")!==expectedCases.join("\n"))issues.push("foundation cases must contain exact FND-01 through FND-08 as eight unique IDs");
 const covered=new Set();
 for(const item of cases){
  if(!exactKeys(item,FOUNDATION_CASE_FIELDS,`foundation case ${item?.id??"unknown"}`,issues))continue;
  for(const field of ["summary","input","trigger","output","durableState","sideEffects","negativeControls"])
   if(typeof item[field]!=="string"||!item[field].trim())issues.push(`foundation case ${item.id} ${field} must be a nonempty string`);
  if(item.versionControl!=="CORE-15a")issues.push(`foundation case ${item.id} has invalid versionControl`);
  if(!nonemptyStrings(item.ordering)||item.ordering.length===0)issues.push(`foundation case ${item.id} ordering must be nonempty strings`);
  if(!Array.isArray(item.evidence)||item.evidence.length===0)issues.push(`foundation case ${item.id} requires evidence`);
  else for(const evidence of item.evidence){
   if(!exactKeys(evidence,FOUNDATION_EVIDENCE_FIELDS,`foundation case ${item.id} evidence`,issues))continue;
   const source=sourceById.get(evidence.sourceId);
   if(!source)issues.push(`foundation case ${item.id} evidence has unknown sourceId`);
   else if(!Number.isInteger(evidence.startLine)||!Number.isInteger(evidence.endLine)||evidence.startLine>evidence.endLine||evidence.startLine<source.lineStart||evidence.endLine>source.lineEnd)issues.push(`foundation case ${item.id} evidence has invalid line range`);
   else covered.add(evidence.sourceId);
  }
  const evidenceAnchor=typeof item.id==="string"&&Object.hasOwn(FOUNDATION_EVIDENCE_ANCHORS,item.id)?FOUNDATION_EVIDENCE_ANCHORS[item.id]:undefined;
  if(!evidenceAnchor||!Array.isArray(item.evidence)||item.evidence.length!==evidenceAnchor.length||!item.evidence.every((evidence,index)=>typeof evidence.sourceId==="string"&&evidence.sourceId===evidenceAnchor[index][0]&&Number.isInteger(evidence.startLine)&&evidence.startLine===evidenceAnchor[index][1]&&Number.isInteger(evidence.endLine)&&evidence.endLine===evidenceAnchor[index][2]))issues.push(`foundation case ${item.id} has invalid pinned evidence`);
  const anchor=typeof item.id==="string"?FOUNDATION_CRITICAL_ANCHORS[item.id]:undefined;
  if(!object(item.criticalValues)||!anchor||JSON.stringify(item.criticalValues)!==JSON.stringify(anchor))issues.push(`foundation case ${item.id} has invalid critical values`);
  if(item.id==="FND-07"&&JSON.stringify(item.ordering)!==JSON.stringify(FOUNDATION_ORDER_ANCHOR))issues.push("foundation case FND-07 has invalid ordering");
 }
 if(expectedSources.some(id=>!covered.has(id)))issues.push("foundation cases must reference all pinned sources");
 return issues;
}

/** Pure structural validation of a supplied manifest value. */
export function validateMemoryParity(manifest){
 const issues=[];
 if(!exactKeys(manifest,TOP_FIELDS,"manifest",issues))return issues;
 if(manifest.schemaVersion!==1)issues.push("schemaVersion must be 1");
 if(manifest.scope!=="reference_only")issues.push("scope must be reference_only");
 if(JSON.stringify(manifest.statusModel)!==JSON.stringify(["MISSING","PARTIAL"]))issues.push("statusModel must allow only MISSING and PARTIAL");
 if(!nonemptyStrings(manifest.limitations)||manifest.limitations.length===0)issues.push("manifest limitations must be nonempty strings");
 const targets=Array.isArray(manifest.targets)?manifest.targets:[];
 if(targets.length!==2||duplicates(targets.map(target=>target?.id)))issues.push("targets must contain exactly two unique IDs");
 for(const target of targets){
  if(!exactKeys(target,TARGET_FIELDS,`target ${target?.id??"unknown"}`,issues))continue;
  if(typeof target.id!=="string")issues.push("target ID must be a string");
  const anchor=typeof target.id==="string"&&Object.hasOwn(TARGET_ANCHORS,target.id)?TARGET_ANCHORS[target.id]:undefined;
  if(!anchor)issues.push(`unknown target ID ${target.id}`);
  else for(const [field,value] of Object.entries(anchor))if(target[field]!==value)issues.push(`target ${target.id} has invalid ${field}`);
  if(typeof target.repository!=="string"||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.repository))issues.push(`target ${target.id} has invalid repository`);
  else if(createHash("sha256").update(target.repository).digest("hex")!==REPOSITORY_SHA256)issues.push(`target ${target.id} has invalid repository identity`);
  if(!SHA40.test(target.tagObject)||!SHA40.test(target.commit))issues.push(`target ${target.id} requires full lowercase Git hashes`);
  const base=`https://github.com/${target.repository}`;
  if(target.apiRefUrl!==`https://api.github.com/repos/${target.repository}/git/ref/tags/${target.tag}`)issues.push(`target ${target.id} API URL is not bound to its repository and tag`);
  if(target.tagUrl!==`${base}/releases/tag/${target.tag}`)issues.push(`target ${target.id} tag URL is not bound to its repository and tag`);
 }
 const targetById=new Map(targets.map(target=>[target.id,target]));
 const sources=Array.isArray(manifest.sources)?manifest.sources:[];
 const sourceIds=sources.map(source=>source?.id);
 const expectedSourceIds=Array.from({length:7},(_,index)=>`SRC-MEM-${String(index+1).padStart(3,"0")}`);
 if(!sourceIds.every(id=>typeof id==="string"))issues.push("source IDs must be strings");
 if(sources.length!==7||duplicates(sourceIds)||duplicates(sources.map(source=>source?.path))||duplicates(sources.map(source=>source?.rawUrl))||[...sourceIds].sort().join("\n")!==expectedSourceIds.join("\n"))issues.push("sources must contain exact unique IDs, paths, and URLs");
 for(const source of sources){
  if(!exactKeys(source,SOURCE_FIELDS,`source ${source?.id??"unknown"}`,issues))continue;
  const target=targetById.get(source.targetId),pathIsString=typeof source.path==="string";
  const anchor=pathIsString?SOURCE_ANCHORS[source.path]:undefined;
  if(!target)issues.push(`source ${source.id} has unknown targetId`);
  if(source.targetId!=="core")issues.push(`source ${source.id} must belong to the core snapshot`);
  if(!pathIsString)issues.push(`source ${source.id} path must be a string`);
  else if(!PATH.test(source.path))issues.push(`source ${source.id} path is not canonical relative syntax`);
  if(!Number.isInteger(source.bytes)||source.bytes<=0||source.bytes>2*1024*1024||!SHA64.test(source.sha256))issues.push(`source ${source.id} has invalid byte/hash tuple`);
  if(!anchor||source.bytes!==anchor[0]||source.sha256!==anchor[1])issues.push(`source ${source.id} does not match its pinned byte/hash tuple`);
  if(target&&pathIsString&&source.rawUrl!==`https://raw.githubusercontent.com/${target.repository}/${target.commit}/${source.path}`)issues.push(`source ${source.id} raw URL is not bound to owner, commit, and path`);
 }
 const families=Array.isArray(manifest.families)?manifest.families:[];
 const expectedIds=Array.from({length:18},(_,index)=>`E3-${String(index+1).padStart(2,"0")}`);
 const ids=families.map(family=>family?.id);
 if(!ids.every(id=>typeof id==="string"))issues.push("family IDs must be strings");
 if(families.length!==18||duplicates(ids)||[...ids].sort().join("\n")!==expectedIds.join("\n"))issues.push("families must cover exactly E3-01 through E3-18");
 for(const family of families){
  if(!exactKeys(family,FAMILY_FIELDS,`family ${family?.id??"unknown"}`,issues))continue;
  if(typeof family.title!=="string"||family.title.trim().length===0)issues.push(`family ${family.id} title must be a nonempty string`);
  if(!new Set(["MISSING","PARTIAL"]).has(family.status))issues.push(`family ${family.id} has invalid status; FULL is unsupported by this reference-only schema`);
  if(!nonemptyStrings(family.facts))issues.push(`family ${family.id} facts must be a string array`);
  if(!nonemptyStrings(family.limitations)||family.limitations.length===0)issues.push(`family ${family.id} requires explicit limitations`);
 }
 return issues;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){console.error("audit:memory-parity is offline-only and accepts no flags");process.exitCode=2;}
 else{
  const issues=[...validateMemoryParity(loadCheckedInMemoryParity()),...validateMemoryFoundation(loadCheckedInMemoryFoundation())];
  if(issues.length){console.error(issues.join("\n"));process.exitCode=1;}
  else console.log("memory parity reference: PASS (2 targets, 7 sources, 18 baseline families; 8 source-inspected foundation contracts; no runtime parity claim)");
 }
}
