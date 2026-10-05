import {createHash} from "node:crypto";
import {lstat,mkdir,readFile,realpath} from "node:fs/promises";
import path from "node:path";
import {atomicWriteText} from "../io/atomic-write.js";
import {discoverSkills,type SkillRegistryEntry,type SkillScanResult,type SkillSkipDiagnostic,type SkillSource} from "./discovery.js";

export const SKILL_REGISTRY_RELATIVE_PATH=".asen/skill-registry.md";
export const SKILL_REGISTRY_CACHE_RELATIVE_PATH=".asen/skill-registry.cache.json";

export interface SkillRegistryMirrorPayload {title:"skill-registry";topicKey:"skill-registry";projectId:string;content:string;capturePrompt:false}
export interface SkillRegistryMirror {save(payload:SkillRegistryMirrorPayload):Promise<void>}
export type SkillRegistryPersistence={status:"unavailable"}|{status:"saved"}|{status:"failed";message:string};
export interface RefreshSkillRegistryOptions {
 projectRoot:string;
 projectId:string;
 sources:readonly SkillSource[];
 mirror?:SkillRegistryMirror;
 atomicWrite?:(destination:string,content:string)=>Promise<void>;
}
export interface RefreshSkillRegistryResult {
 path:string;
 count:number;
 cache:"hit"|"regenerated";
 persistence:SkillRegistryPersistence;
 entries:SkillRegistryEntry[];
 skipped:SkillSkipDiagnostic[];
}
interface RegistryCache {schemaVersion:1;sourceFingerprint:string;registrySha256:string;entries:SkillRegistryEntry[];skipped:SkillSkipDiagnostic[]}

const rank={project:0,user:1,global:2} as const;
const sha256=(content:string)=>createHash("sha256").update(content).digest("hex");
const text=(value:unknown):value is string=>typeof value==="string";
const record=(value:unknown):value is Record<string,unknown>=>
 typeof value==="object"&&value!==null&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function exact(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 return record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function entry(value:unknown):value is SkillRegistryEntry {
 return exact(value,["name","description","scope","path","sourceId"])&&text(value.name)&&text(value.description)&&
  (value.scope==="project"||value.scope==="user"||value.scope==="global")&&text(value.path)&&text(value.sourceId);
}
function diagnostic(value:unknown):value is SkillSkipDiagnostic {
 if(!record(value)||!Object.hasOwn(value,"reason"))return false;
 const base=(keys:readonly string[])=>exact(value,keys)&&text(value.sourceId)&&text(value.path);
 if(value.reason==="missing-source"||value.reason==="unreadable-path"||value.reason==="invalid-frontmatter")
  return base(["reason","sourceId","path"]);
 if(value.reason==="excluded-name")
  return base(["reason","sourceId","path","name"])&&(value.name===null||text(value.name));
 if(value.reason==="path-outside-source")
  return base(["reason","sourceId","path","canonicalPath"])&&text(value.canonicalPath);
 return value.reason==="duplicate-name"&&base(["reason","sourceId","path","name","winnerPath","rejectedPath"])&&
  text(value.name)&&text(value.winnerPath)&&text(value.rejectedPath);
}
function cacheValue(value:unknown):value is RegistryCache {
 return exact(value,["schemaVersion","sourceFingerprint","registrySha256","entries","skipped"])&&value.schemaVersion===1&&
  text(value.sourceFingerprint)&&/^[a-f0-9]{64}$/.test(value.sourceFingerprint)&&
  text(value.registrySha256)&&/^[a-f0-9]{64}$/.test(value.registrySha256)&&
  Array.isArray(value.entries)&&value.entries.every(entry)&&Array.isArray(value.skipped)&&value.skipped.every(diagnostic);
}
function orderedSources(sources:readonly SkillSource[]):SkillSource[]{
 return sources.map((source,index)=>({source,index})).sort((a,b)=>rank[a.source.scope]-rank[b.source.scope]||a.index-b.index).map(item=>item.source);
}
function code(value:string):string {
 const escaped=value.replace(/[\u0000-\u001f\u007f]/g,character=>JSON.stringify(character).slice(1,-1));
 const longest=Math.max(0,...([...escaped.matchAll(/`+/g)].map(match=>match[0].length)));
 const delimiter="`".repeat(longest+1),padding=escaped.startsWith("`")||escaped.endsWith("`")?" ":"";
 return `${delimiter}${padding}${escaped}${padding}${delimiter}`;
}

export function renderSkillRegistry(projectId:string,sources:readonly SkillSource[],scan:SkillScanResult):string {
 const sourceLines=orderedSources(sources).map((source,index)=>
  `${index+1}. ${code(source.id)} — ${source.scope} — ${code(path.resolve(source.root))}`);
 const skills=scan.entries.map(item=>
  `### Skill ${code(item.name)}\n\n- Description: ${code(item.description)}\n- Scope: ${item.scope}\n- Source: ${code(item.sourceId)}\n- Path: ${code(item.path)}`);
 const diagnostics=scan.skipped.map(item=>`- ${code(JSON.stringify(item))}`);
 return `# Skill Registry\n\nProject: ${code(projectId)}\n\n## Sources\n\n${sourceLines.join("\n")||"_None._"}\n\n## Registry contract\n\nProject scope precedes user scope, which precedes global scope. Within a scope, configured source order wins. The first accepted skill name wins. Paths are exact canonical paths.\n\n## Skills (${scan.entries.length})\n\n${skills.join("\n\n")||"_None._"}\n\n## Diagnostics (${scan.skipped.length})\n\n${diagnostics.join("\n")||"_None._"}\n`;
}

const inside=(root:string,candidate:string):boolean=>{
 const relative=path.relative(root,candidate);
 return relative===""||(!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative));
};
const hasCode=(error:unknown,code:string):boolean=>
 typeof error==="object"&&error!==null&&"code" in error&&(error as {code?:unknown}).code===code;
async function rejectLink(candidate:string):Promise<void>{
 try{if((await lstat(candidate)).isSymbolicLink())throw new Error("Registry output path must not be a symbolic link or junction");}
 catch(error){if(!hasCode(error,"ENOENT"))throw error;}
}
async function outputPaths(projectRoot:string):Promise<{registryPath:string;cachePath:string}> {
 const root=path.normalize(await realpath(path.resolve(projectRoot))),directory=path.join(root,".asen");
 try{await mkdir(directory);}catch(error){if(!hasCode(error,"EEXIST"))throw error;}
 const metadata=await lstat(directory);
 if(metadata.isSymbolicLink()||!metadata.isDirectory())throw new Error("Registry output directory must be a real directory");
 const canonicalDirectory=path.normalize(await realpath(directory));
 if(!inside(root,canonicalDirectory)||canonicalDirectory!==path.normalize(directory))
  throw new Error("Registry output directory must remain inside the canonical project root");
 const registryPath=path.join(canonicalDirectory,"skill-registry.md"),cachePath=path.join(canonicalDirectory,"skill-registry.cache.json");
 await rejectLink(registryPath);await rejectLink(cachePath);
 return {registryPath,cachePath};
}
async function readCache(cachePath:string):Promise<RegistryCache|null>{
 try{const parsed:unknown=JSON.parse(await readFile(cachePath,"utf8"));return cacheValue(parsed)?parsed:null;}catch{return null;}
}
async function readRegistry(registryPath:string):Promise<string|null>{try{return await readFile(registryPath,"utf8");}catch{return null;}}
async function persist(mirror:SkillRegistryMirror|undefined,projectId:string,content:string):Promise<SkillRegistryPersistence>{
 if(!mirror)return {status:"unavailable"};
 try{await mirror.save({title:"skill-registry",topicKey:"skill-registry",projectId,content,capturePrompt:false});return {status:"saved"};}
 catch{return {status:"failed",message:"Mirror failed"};}
}

export async function refreshSkillRegistry(options:RefreshSkillRegistryOptions):Promise<RefreshSkillRegistryResult>{
 const {registryPath,cachePath}=await outputPaths(options.projectRoot);
 const scan=await discoverSkills(options.sources),rendered=renderSkillRegistry(options.projectId,options.sources,scan);
 const cache=await readCache(cachePath),existing=await readRegistry(registryPath),renderedHash=sha256(rendered);
 const hit=cache!==null&&existing!==null&&cache.sourceFingerprint===scan.fingerprint&&
  cache.registrySha256===sha256(existing)&&cache.registrySha256===renderedHash&&existing===rendered;
 let content=existing,cacheStatus:RefreshSkillRegistryResult["cache"]="hit";
 if(!hit){
  content=rendered;cacheStatus="regenerated";
  const write=options.atomicWrite??atomicWriteText;
  await write(registryPath,content);
  const next:RegistryCache={schemaVersion:1,sourceFingerprint:scan.fingerprint,registrySha256:renderedHash,entries:scan.entries,skipped:scan.skipped};
  await write(cachePath,`${JSON.stringify(next,null,2)}\n`);
 }
 const persistence=await persist(options.mirror,options.projectId,content!);
 return {path:registryPath,count:scan.entries.length,cache:cacheStatus,persistence,entries:scan.entries,skipped:scan.skipped};
}
