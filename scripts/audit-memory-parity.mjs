import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const MANIFEST="registry/parity/memory-upstream-v3.json";
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]+$/;
const TOP_FIELDS=["schemaVersion","scope","statusModel","limitations","targets","sources","families"];
const TARGET_FIELDS=["id","repository","version","tag","tagObject","commit","publishedAt","channel","apiRefUrl","tagUrl"];
const SOURCE_FIELDS=["id","targetId","path","bytes","sha256","rawUrl"];
const FAMILY_FIELDS=["id","title","status","facts","limitations"];
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
  const issues=validateMemoryParity(loadCheckedInMemoryParity());
  if(issues.length){console.error(issues.join("\n"));process.exitCode=1;}
  else console.log("memory parity reference: PASS (2 targets, 7 sources, 18 baseline families; no runtime parity claim)");
 }
}
