import {createHash} from "node:crypto";
import {lstat,readdir,readFile,realpath,stat} from "node:fs/promises";
import path from "node:path";
import {parseSkillIndexMetadata} from "./document.js";

export type SkillScope="project"|"user"|"global";
export interface SkillSource {id:string;scope:SkillScope;root:string}
export interface SkillRegistryEntry {name:string;description:string;scope:SkillScope;path:string;sourceId:string}
interface SkipBase {sourceId:string;path:string}
export type SkillSkipDiagnostic=
 |(SkipBase&{reason:"missing-source"})
 |(SkipBase&{reason:"unreadable-path"})
 |(SkipBase&{reason:"invalid-frontmatter"})
 |(SkipBase&{reason:"excluded-name";name:string|null})
 |(SkipBase&{reason:"duplicate-name";name:string;winnerPath:string;rejectedPath:string})
 |(SkipBase&{reason:"path-outside-source";canonicalPath:string});
export interface SkillScanResult {entries:SkillRegistryEntry[];skipped:SkillSkipDiagnostic[];fingerprint:string}
export interface SkillDiscoveryOptions {
 realpath?:(value:string)=>Promise<string>;
 readFile?:(value:string)=>Promise<Buffer>;
}

const scopeRank:Record<SkillScope,number>={project:0,user:1,global:2};
const normalized=(value:string):string=>path.normalize(path.resolve(value));
const portable=(value:string):string=>normalized(value).replaceAll(path.sep,"/");
const compareText=(a:string,b:string):number=>a.localeCompare(b,"en")||(a<b?-1:a>b?1:0);
const inside=(root:string,candidate:string):boolean=>{const relative=path.relative(root,candidate);return relative===""||(!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative));};
const frame=(hash:ReturnType<typeof createHash>,label:string,value:string|Buffer):void=>{
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
 hash.update(`${label}:${bytes.length}:`);hash.update(bytes);hash.update("\n");
};
interface Candidate {source:SkillSource;root:string;path:string;canonicalPath:string;bytes:Buffer}
interface SkillDiscoveryIO {
 realpath:(value:string)=>Promise<string>;
 readFile:(value:string)=>Promise<Buffer>;
}

async function candidatesFor(source:SkillSource,root:string,skipped:SkillSkipDiagnostic[],observe:(label:string,value:string|Buffer)=>void,io:SkillDiscoveryIO):Promise<Candidate[]> {
 const found:Candidate[]=[],visited=new Set<string>();
 const unreadable=(visiblePath:string):void=>{skipped.push({reason:"unreadable-path",sourceId:source.id,path:normalized(visiblePath)});};
 const walk=async(directory:string):Promise<void>=>{
  let canonicalDirectory:string;
  try{canonicalDirectory=normalized(await io.realpath(directory));}catch{unreadable(directory);return;}
  if(!inside(root,canonicalDirectory)){skipped.push({reason:"path-outside-source",sourceId:source.id,path:normalized(directory),canonicalPath:canonicalDirectory});return;}
  if(visited.has(canonicalDirectory))return;
  visited.add(canonicalDirectory);observe("directory",portable(canonicalDirectory));
  let children;
  try{children=(await readdir(canonicalDirectory,{withFileTypes:true})).sort((a,b)=>compareText(a.name,b.name));}
  catch{unreadable(directory);return;}
  for(const child of children){
   const visiblePath=path.join(canonicalDirectory,child.name);
   let link;
   try{link=await lstat(visiblePath);}catch{unreadable(visiblePath);continue;}
   observe("entry",JSON.stringify({path:portable(visiblePath),kind:link.isSymbolicLink()?"link":link.isDirectory()?"directory":link.isFile()?"file":"other"}));
   if(child.name==="SKILL.md"&&(link.isFile()||link.isSymbolicLink())){
    try{
     const canonicalPath=normalized(await io.realpath(visiblePath));
     observe("target",portable(canonicalPath));
     if(!inside(root,canonicalPath)){
      skipped.push({reason:"path-outside-source",sourceId:source.id,path:normalized(visiblePath),canonicalPath});
      continue;
     }
     found.push({source,root,path:visiblePath,canonicalPath,bytes:await io.readFile(canonicalPath)});
    }catch{unreadable(visiblePath);}
    continue;
   }
   if(link.isDirectory()){await walk(visiblePath);continue;}
   if(link.isSymbolicLink()){
    try{
     const canonicalPath=normalized(await io.realpath(visiblePath)),target=await stat(canonicalPath);
     observe("target",portable(canonicalPath));
     if(target.isDirectory()){
      if(inside(root,canonicalPath))await walk(canonicalPath);
      else skipped.push({reason:"path-outside-source",sourceId:source.id,path:normalized(visiblePath),canonicalPath});
     }
    }catch{unreadable(visiblePath);}
   }
  }
 };
 await walk(root);
 return found.sort((a,b)=>compareText(portable(a.canonicalPath),portable(b.canonicalPath)));
}

function excluded(candidate:Candidate,name:string):boolean {
 const directories=path.relative(candidate.root,path.dirname(candidate.canonicalPath)).split(path.sep);
 return name==="_shared"||name==="asen-skill-registry"||name.startsWith("sdd-")||directories.some(directory=>directory==="_shared"||directory.startsWith("sdd-"));
}

export async function discoverSkills(sources:readonly SkillSource[],options:SkillDiscoveryOptions={}):Promise<SkillScanResult> {
 const counts=new Map<string,number>();for(const source of sources)counts.set(source.id,(counts.get(source.id)??0)+1);
 const duplicateIds=[...counts].filter(([,count])=>count>1).map(([id])=>id).sort(compareText);
 if(duplicateIds.length)throw new Error(`Duplicate skill source ids: ${duplicateIds.join(", ")}`);
 const hash=createHash("sha256"),skipped:SkillSkipDiagnostic[]=[],entries:SkillRegistryEntry[]=[],winners=new Map<string,SkillRegistryEntry>();
 const io:SkillDiscoveryIO={realpath:options.realpath??(value=>realpath(value)),readFile:options.readFile??(value=>readFile(value))};
 const ordered=sources.map((source,index)=>({source,index})).sort((a,b)=>scopeRank[a.source.scope]-scopeRank[b.source.scope]||a.index-b.index);
 const sourceOrder=new Map(ordered.map(({source},index)=>[source.id,index]));
 for(const {source} of ordered){
  const configuredRoot=normalized(source.root);
  frame(hash,"source",JSON.stringify({id:source.id,scope:source.scope,root:portable(configuredRoot)}));
  let root:string;
  try{root=normalized(await io.realpath(configuredRoot));}
  catch{skipped.push({reason:"missing-source",sourceId:source.id,path:configuredRoot});continue;}
  frame(hash,"root",portable(root));
  for(const candidate of await candidatesFor(source,root,skipped,(label,value)=>frame(hash,label,value),io)){
   frame(hash,"candidate-path",portable(candidate.canonicalPath));frame(hash,"candidate-bytes",candidate.bytes);
   const metadata=parseSkillIndexMetadata(candidate.bytes.toString("utf8"));
   if(!metadata){skipped.push({reason:"invalid-frontmatter",sourceId:source.id,path:candidate.canonicalPath});continue;}
   if(excluded(candidate,metadata.name)){skipped.push({reason:"excluded-name",sourceId:source.id,path:candidate.canonicalPath,name:metadata.name});continue;}
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)){skipped.push({reason:"invalid-frontmatter",sourceId:source.id,path:candidate.canonicalPath});continue;}
   const winner=winners.get(metadata.name);
   if(winner){skipped.push({reason:"duplicate-name",sourceId:source.id,path:candidate.canonicalPath,name:metadata.name,winnerPath:winner.path,rejectedPath:candidate.canonicalPath});continue;}
   const entry={name:metadata.name,description:metadata.description,scope:source.scope,path:candidate.canonicalPath,sourceId:source.id};
   winners.set(entry.name,entry);entries.push(entry);
  }
 }
 skipped.sort((a,b)=>(sourceOrder.get(a.sourceId)??-1)-(sourceOrder.get(b.sourceId)??-1)||compareText(portable(a.path),portable(b.path))||compareText(a.reason,b.reason)||compareText(JSON.stringify(a),JSON.stringify(b)));
 for(const diagnostic of skipped)frame(hash,"diagnostic",JSON.stringify(diagnostic));
 return {entries,skipped,fingerprint:hash.digest("hex")};
}

export function resolveRegistryPaths(scan:SkillScanResult,names:readonly string[]):string[] {
 const requested=new Set<string>(),byName=new Map(scan.entries.map(entry=>[entry.name,entry.path]));
 return names.map(name=>{
  if(requested.has(name))throw new Error(`Duplicate requested skill: ${name}`);
  requested.add(name);
  const resolved=byName.get(name);if(!resolved)throw new Error(`Unknown requested skill: ${name}`);
  return resolved;
 });
}
