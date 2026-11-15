import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmdirSync} from "node:fs";
import {dirname,isAbsolute,join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {types} from "node:util";
import {validatePortableReviewPaths} from "./review-tree-paths.js";

export type CandidateGitTreeEntryKind="regular"|"symlink"|"gitlink";
export type CandidateGitTreeEntryMode="100644"|"100755"|"120000"|"160000";
export interface CandidateGitTreeEntry{
 readonly path:string;
 readonly kind:CandidateGitTreeEntryKind;
 readonly mode:CandidateGitTreeEntryMode;
 readonly objectId:string;
 readonly size:number|null;
 readonly contentSha256:string|null;
 readonly bytesBase64:string|null;
}
export interface CandidateGitTreeManifest{
 readonly schemaVersion:1;
 readonly repositoryRoot:string;
 readonly gitDirectory:string;
 readonly objectFormat:"sha1"|"sha256";
 readonly treeIdentity:string;
 readonly treeSize:number;
 readonly treeSha256:string;
 readonly entries:readonly CandidateGitTreeEntry[];
}

interface InspectionRequest{repositoryRoot:string;treeIdentity:string;}
interface PhysicalDirectory{path:string;realPath:string;dev:number;ino:number;birthtimeMs:number;}
interface PhysicalFile{path:string;realPath:string;dev:number;ino:number;birthtimeMs:number;size:number;mtimeMs:number;sha256:string;bytes:Buffer;}
interface RepositoryBinding{
 readonly control:PhysicalDirectory|PhysicalFile;
 readonly gitDirectory:PhysicalDirectory;
 readonly commonDirectory:PhysicalDirectory;
 readonly relationshipFiles:readonly PhysicalFile[];
}
interface Deadline{readonly expiresAt:number;}
interface ListedObject{path:string;mode:CandidateGitTreeEntryMode;type:"blob"|"tree"|"commit";objectId:string;}

const commandLimit=16*1024*1024;
const aggregateLimit=16*1024*1024;
const relationshipFileLimit=4096;
const operationLimit=15_000;
const entryLimit=100_000;
const decoder=new TextDecoder("utf-8",{fatal:true});

function exactRequest(input:unknown):InspectionRequest{
 if(typeof input!=="object"||input===null||types.isProxy(input)||Array.isArray(input)||Object.getPrototypeOf(input)!==Object.prototype){
  throw new Error("Candidate tree descriptor must be exact plain data");
 }
 const descriptors=Object.getOwnPropertyDescriptors(input);
 const keys=Reflect.ownKeys(descriptors);
 if(keys.length!==2||keys.some(key=>typeof key!=="string"||(key!=="repositoryRoot"&&key!=="treeIdentity"))){
  throw new Error("Candidate tree descriptor shape is invalid");
 }
 const root=descriptors.repositoryRoot,tree=descriptors.treeIdentity;
 if(!root?.enumerable||!("value" in root)||typeof root.value!=="string"||!root.value||
  !tree?.enumerable||!("value" in tree)||typeof tree.value!=="string"||!tree.value){
  throw new Error("Candidate tree descriptor shape is invalid");
 }
 if(!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(tree.value))throw new Error("Candidate tree identity is invalid");
 return {repositoryRoot:root.value,treeIdentity:tree.value};
}
function observeDirectory(path:string):PhysicalDirectory{
 const info=lstatSync(path);
 if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Repository directory identity is unsafe");
 return {path,realPath:realpathSync(path),dev:info.dev,ino:info.ino,birthtimeMs:info.birthtimeMs};
}
function samePhysicalDirectory(expected:PhysicalDirectory):boolean{
 try{
  const current=observeDirectory(expected.path);
  return current.realPath===expected.realPath&&current.dev===expected.dev&&current.ino===expected.ino&&current.birthtimeMs===expected.birthtimeMs;
 }catch{return false;}
}
function observeFile(path:string):PhysicalFile{
 const info=lstatSync(path);
 if(!info.isFile()||info.isSymbolicLink()||info.size>relationshipFileLimit)throw new Error("Repository relationship file is unsafe");
 const bytes=readFileSync(path);
 if(bytes.length!==info.size)throw new Error("Repository relationship file changed while reading");
 return {path,realPath:realpathSync(path),dev:info.dev,ino:info.ino,birthtimeMs:info.birthtimeMs,size:info.size,mtimeMs:info.mtimeMs,
  sha256:createHash("sha256").update(bytes).digest("hex"),bytes};
}
function samePhysicalFile(expected:PhysicalFile):boolean{
 try{
  const current=observeFile(expected.path);
  return current.realPath===expected.realPath&&current.dev===expected.dev&&current.ino===expected.ino&&
   current.birthtimeMs===expected.birthtimeMs&&current.size===expected.size&&current.mtimeMs===expected.mtimeMs&&current.sha256===expected.sha256;
 }catch{return false;}
}
function monotonicMilliseconds():number{return Number(process.hrtime.bigint()/1_000_000n);}
function remainingMilliseconds(deadline:Deadline):number{
 const remaining=deadline.expiresAt-monotonicMilliseconds();
 if(!Number.isFinite(remaining)||remaining<=0)throw new Error("Candidate tree inspection exceeded its whole-operation time budget");
 return Math.max(1,Math.ceil(remaining));
}
function assertDeadline(deadline:Deadline):void{void remainingMilliseconds(deadline);}
function isolatedEnvironment():NodeJS.ProcessEnv{
 const result:NodeJS.ProcessEnv={};
 for(const key of ["PATH","Path","PATHEXT","SystemRoot","WINDIR","COMSPEC","TEMP","TMP","TMPDIR"]){
  if(process.env[key]!==undefined)result[key]=process.env[key];
 }
 result.GIT_CONFIG_NOSYSTEM="1";
 result.GIT_CONFIG_GLOBAL=process.platform==="win32"?"NUL":"/dev/null";
 result.GIT_TERMINAL_PROMPT="0";
 result.GIT_OPTIONAL_LOCKS="0";
 result.GIT_NO_LAZY_FETCH="1";
 result.GIT_ALLOW_PROTOCOL="";
 result.GIT_PROTOCOL_FROM_USER="0";
 result.NO_COLOR="1";
 result.LC_ALL="C";
 return result;
}
function scratchDirectory():PhysicalDirectory{
 const path=mkdtempSync(join(tmpdir(),"asen-tree-inspection-"));
 return observeDirectory(path);
}
function disposeScratch(scratch:PhysicalDirectory):void{
 if(!samePhysicalDirectory(scratch)||readdirSync(scratch.path).length!==0){
  throw new Error(`Inspection scratch ownership is uncertain; retained at ${scratch.path}`);
 }
 rmdirSync(scratch.path);
}
function gitArguments(root:string,gitDirectory:string|null,hooks:string,args:readonly string[]):string[]{
 const location=gitDirectory?["-c","core.bare=true",`--git-dir=${gitDirectory}`]:["-C",root];
 return ["--no-replace-objects","--no-pager",
  "-c","protocol.allow=never","-c","protocol.file.allow=never","-c","protocol.ext.allow=never",
  "-c","core.fsmonitor=false","-c",`core.hooksPath=${hooks}`,"-c","diff.external=",
  "-c","filter.allow=false","-c","gc.auto=0","-c","maintenance.auto=false",...location,...args];
}
function runGit(root:PhysicalDirectory,gitDirectory:PhysicalDirectory|null,scratch:PhysicalDirectory,
 deadline:Deadline,binding:RepositoryBinding|null,args:readonly string[]):Buffer{
 assertDeadline(deadline);
 if(!samePhysicalDirectory(root)||(gitDirectory&&!samePhysicalDirectory(gitDirectory)))throw new Error("Repository physical identity changed");
 if(binding)assertRepositoryBinding(binding);
 const timeout=Math.min(10_000,remainingMilliseconds(deadline));
 const result=spawnSync("git",gitArguments(root.realPath,gitDirectory?.realPath??null,scratch.path,args),{
  env:isolatedEnvironment(),encoding:null,stdio:["ignore","pipe","pipe"],timeout,maxBuffer:commandLimit,windowsHide:true,
 });
 assertDeadline(deadline);
 if(!samePhysicalDirectory(root)||(gitDirectory&&!samePhysicalDirectory(gitDirectory)))throw new Error("Repository physical identity changed");
 if(binding)assertRepositoryBinding(binding);
 if(result.error)throw new Error(`Git capability failed closed: ${result.error.message}`);
 if(result.signal)throw new Error(`Git command stopped by signal ${result.signal}`);
 if(result.status!==0){
  const detail=Buffer.isBuffer(result.stderr)?result.stderr.toString("utf8").trim():"";
  throw new Error(`Git inspection command failed (${result.status}): ${detail}`);
 }
 if(!Buffer.isBuffer(result.stdout))throw new Error("Git inspection returned no bounded output");
 return result.stdout;
}
function text(value:Buffer):string{return decoder.decode(value).trim();}
function equalPath(left:string,right:string):boolean{return process.platform==="win32"?left.toLowerCase()===right.toLowerCase():left===right;}
function parseRepositoryFacts(value:string):{top:string;git:string;common:string;format:"sha1"|"sha256"}{
 const lines=value.split(/\r?\n/u);
 if(lines.length!==4||(lines[3]!=="sha1"&&lines[3]!=="sha256"))throw new Error("Git repository facts are unsupported");
 return {top:lines[0]!,git:lines[1]!,common:lines[2]!,format:lines[3]};
}
function relationshipTarget(file:PhysicalFile,base:string,label:string):string{
 const value=decoder.decode(file.bytes);
 if(value.includes("\0")||!value.trim()||value.trim()!==value.replace(/\r?\n$/u,""))throw new Error(`${label} relationship is unsupported`);
 const content=value.replace(/\r?\n$/u,"");
 const described=label==="worktree .git pointer"?(/^gitdir: (.+)$/u.exec(content)?.[1]):content;
 if(!described)throw new Error(`${label} relationship is unsupported`);
 return realpathSync(isAbsolute(described)?described:resolve(base,described));
}
function assertRepositoryBinding(binding:RepositoryBinding):void{
 const controlStable="bytes" in binding.control?samePhysicalFile(binding.control):samePhysicalDirectory(binding.control);
 if(!controlStable||!samePhysicalDirectory(binding.gitDirectory)||!samePhysicalDirectory(binding.commonDirectory)||
  binding.relationshipFiles.some(file=>!samePhysicalFile(file)))throw new Error("Repository Git relationship changed during inspection");
}
function repositoryBinding(root:PhysicalDirectory,facts:{git:string;common:string}):RepositoryBinding{
 const gitDirectory=observeDirectory(realpathSync(facts.git));
 const commonDirectory=observeDirectory(realpathSync(facts.common));
 const controlPath=join(root.realPath,".git"),controlInfo=lstatSync(controlPath);
 if(controlInfo.isSymbolicLink())throw new Error("Repository .git relationship is unsafe");
 if(controlInfo.isDirectory()){
  const control=observeDirectory(controlPath);
  if(!equalPath(control.realPath,gitDirectory.realPath)||!equalPath(control.realPath,commonDirectory.realPath)){
   throw new Error("Repository .git directory relationship is unsupported");
  }
  return {control,gitDirectory,commonDirectory,relationshipFiles:Object.freeze([])};
 }
 const control=observeFile(controlPath);
 if(!equalPath(relationshipTarget(control,dirname(controlPath),"worktree .git pointer"),gitDirectory.realPath)){
  throw new Error("Worktree .git pointer does not match Git's resolved directory");
 }
 if(!equalPath(dirname(gitDirectory.realPath),join(commonDirectory.realPath,"worktrees"))){
  throw new Error("Worktree Git directory relationship is unsupported");
 }
 const commonFile=observeFile(join(gitDirectory.realPath,"commondir"));
 const backFile=observeFile(join(gitDirectory.realPath,"gitdir"));
 if(!equalPath(relationshipTarget(commonFile,gitDirectory.realPath,"worktree common directory"),commonDirectory.realPath)||
  !equalPath(relationshipTarget(backFile,gitDirectory.realPath,"worktree backlink"),control.realPath)){
  throw new Error("Worktree Git relationship is inconsistent");
 }
 return {control,gitDirectory,commonDirectory,relationshipFiles:Object.freeze([commonFile,backFile])};
}

const repositoryClaims=new WeakMap<object,{root:PhysicalDirectory;binding:RepositoryBinding}>();
/** Captures the physical Git relationship without granting read or write authority. */
export function captureReviewRepositoryBinding(repositoryRoot:string):Readonly<Record<string,never>>{
 if(typeof repositoryRoot!=="string"||!isAbsolute(repositoryRoot)||resolve(repositoryRoot)!==repositoryRoot)throw new Error("Repository root must be canonical");
 const root=observeDirectory(repositoryRoot),deadline={expiresAt:monotonicMilliseconds()+operationLimit};
 if(!equalPath(root.realPath,repositoryRoot))throw new Error("Repository root must be canonical");
 const scratch=scratchDirectory();let primaryError:unknown;
 try{
  const facts=parseRepositoryFacts(text(runGit(root,null,scratch,deadline,null,["rev-parse","--path-format=absolute","--show-toplevel","--absolute-git-dir","--git-common-dir","--show-object-format"])));
  if(!equalPath(realpathSync(facts.top),root.realPath))throw new Error("Repository root must be the canonical Git toplevel");
  const binding=repositoryBinding(root,facts);assertRepositoryBinding(binding);
  if(!samePhysicalDirectory(root))throw new Error("Repository physical identity changed");
  const claim=Object.freeze({});repositoryClaims.set(claim,{root,binding});return claim;
 }catch(error){primaryError=error;throw error;}
 finally{try{disposeScratch(scratch);}catch(error){if(!primaryError)throw error;}}
}

/** Rejects replaced roots and altered Git relationships for a genuine captured claim. */
export function assertReviewRepositoryBinding(value:unknown):void{
 const claim=typeof value==="object"&&value!==null?repositoryClaims.get(value):undefined;
 if(!claim||!samePhysicalDirectory(claim.root))throw new Error("Repository physical identity changed");
 assertRepositoryBinding(claim.binding);
}
function parseListing(buffer:Buffer,oidLength:number,deadline:Deadline):ListedObject[]{
 const records:ListedObject[]=[];
 let start=0;
 for(let index=0;index<buffer.length;index+=1){
  if(index%4096===0)assertDeadline(deadline);
  if(buffer[index]!==0)continue;
  if(index===start)throw new Error("Git tree listing contains an empty record");
  const record=decoder.decode(buffer.subarray(start,index));
  const match=new RegExp(`^(100644|100755|120000|160000|040000) (blob|tree|commit) ([0-9a-f]{${oidLength}})\\t(.+)$`,`u`).exec(record);
  if(!match)throw new Error("Git tree listing contains unsupported metadata");
  const mode=match[1]==="040000"?"100644":match[1] as CandidateGitTreeEntryMode;
  records.push({mode,type:match[2] as ListedObject["type"],objectId:match[3]!,path:match[4]!});
  if(records.length>entryLimit)throw new Error("Git tree contains too many entries");
  start=index+1;
 }
 if(start!==buffer.length)throw new Error("Git tree listing is unterminated");
 return records;
}
function hashObject(format:"sha1"|"sha256",type:"blob"|"tree",bytes:Buffer):string{
 return createHash(format).update(`${type} ${bytes.length}\0`).update(bytes).digest("hex");
}
function readVerifiedObject(root:PhysicalDirectory,gitDirectory:PhysicalDirectory,scratch:PhysicalDirectory,
 deadline:Deadline,binding:RepositoryBinding,format:"sha1"|"sha256",type:"blob"|"tree",objectId:string):Buffer{
 const header=text(runGit(root,gitDirectory,scratch,deadline,binding,["cat-file","-t",objectId]));
 if(header!==type)throw new Error(`Git object ${objectId} has unexpected type`);
 const sizeText=text(runGit(root,gitDirectory,scratch,deadline,binding,["cat-file","-s",objectId]));
 if(!/^(?:0|[1-9][0-9]*)$/u.test(sizeText))throw new Error(`Git object ${objectId} has invalid size`);
 const size=Number(sizeText);
 if(!Number.isSafeInteger(size)||size>commandLimit)throw new Error(`Git object ${objectId} exceeds inspection bounds`);
 const bytes=runGit(root,gitDirectory,scratch,deadline,binding,["cat-file",type,objectId]);
 if(bytes.length!==size)throw new Error(`Git object ${objectId} size changed`);
 if(hashObject(format,type,bytes)!==objectId)throw new Error(`Git object ${objectId} failed hash verification`);
 return bytes;
}
function freezeEntry(entry:CandidateGitTreeEntry):CandidateGitTreeEntry{return Object.freeze(entry);}

/**
 * Reads and cryptographically verifies an immutable Git tree into frozen data.
 * This performs bounded Git plumbing and transient owned hook-scratch I/O only;
 * it creates no review view, grants no authority, and never traverses gitlinks.
 */
export function inspectCandidateGitTree(input:unknown):CandidateGitTreeManifest{
 const request=exactRequest(input);
 const deadline={expiresAt:monotonicMilliseconds()+operationLimit};
 if(!isAbsolute(request.repositoryRoot))throw new Error("Repository root must be canonical");
 const requested=resolve(request.repositoryRoot);
 assertDeadline(deadline);
 const root=observeDirectory(requested);
 if(!equalPath(requested,root.realPath)||request.repositoryRoot!==requested)throw new Error("Repository root must be canonical");
 const scratch=scratchDirectory();
 let primaryError:unknown;
 try{
  const facts=parseRepositoryFacts(text(runGit(root,null,scratch,deadline,null,["rev-parse","--path-format=absolute",
   "--show-toplevel","--absolute-git-dir","--git-common-dir","--show-object-format"])));
  const canonicalTop=realpathSync(facts.top);
  if(!equalPath(canonicalTop,root.realPath))throw new Error("Repository root must be the canonical Git toplevel");
  const binding=repositoryBinding(root,facts),gitDirectory=binding.gitDirectory;
  assertRepositoryBinding(binding);
  if(request.treeIdentity.length!==(facts.format==="sha1"?40:64))throw new Error("Candidate tree identity does not match repository object format");
  const rootBytes=readVerifiedObject(root,gitDirectory,scratch,deadline,binding,facts.format,"tree",request.treeIdentity);
  let retained=rootBytes.length;
  const listed=parseListing(runGit(root,gitDirectory,scratch,deadline,binding,["ls-tree","-r","-t","-z","--full-tree",request.treeIdentity]),request.treeIdentity.length,deadline);
  const nonemptyDirectories=new Set<string>();
  for(const item of listed){
   assertDeadline(deadline);
   const separator=item.path.lastIndexOf("/");
   if(separator>=0)nonemptyDirectories.add(item.path.slice(0,separator));
  }
  const portablePaths:string[]=[];
  for(const item of listed){
   assertDeadline(deadline);
   if(item.type!=="tree"||!nonemptyDirectories.has(item.path))portablePaths.push(item.path);
  }
  validatePortableReviewPaths(portablePaths);
  assertDeadline(deadline);
  const entries:CandidateGitTreeEntry[]=[];
  for(const item of listed){
   assertDeadline(deadline);
   if(item.type==="tree"){
    const bytes=readVerifiedObject(root,gitDirectory,scratch,deadline,binding,facts.format,"tree",item.objectId);
    retained+=bytes.length;
    if(retained>aggregateLimit)throw new Error("Candidate tree exceeds aggregate inspection bounds");
    continue;
   }
   if(item.type==="commit"){
    if(item.mode!=="160000")throw new Error("Git tree contains an unsupported commit entry");
    entries.push(freezeEntry({path:item.path,kind:"gitlink",mode:"160000",objectId:item.objectId,size:null,contentSha256:null,bytesBase64:null}));
    continue;
   }
   if(item.mode!=="100644"&&item.mode!=="100755"&&item.mode!=="120000")throw new Error("Git tree contains an unsupported blob mode");
   const bytes=readVerifiedObject(root,gitDirectory,scratch,deadline,binding,facts.format,"blob",item.objectId);
   retained+=bytes.length+Math.ceil(bytes.length/3)*4;
   if(retained>aggregateLimit)throw new Error("Candidate tree exceeds aggregate inspection bounds");
   entries.push(freezeEntry({path:item.path,kind:item.mode==="120000"?"symlink":"regular",mode:item.mode,objectId:item.objectId,
    size:bytes.length,contentSha256:createHash("sha256").update(bytes).digest("hex"),bytesBase64:bytes.toString("base64")}));
  }
  assertDeadline(deadline);
  entries.sort((left,right)=>left.path<right.path?-1:left.path>right.path?1:0);
  assertDeadline(deadline);
  if(!samePhysicalDirectory(root)||!samePhysicalDirectory(gitDirectory))throw new Error("Repository physical identity changed");
  assertRepositoryBinding(binding);
  return Object.freeze({schemaVersion:1,repositoryRoot:root.realPath,gitDirectory:gitDirectory.realPath,objectFormat:facts.format,
   treeIdentity:request.treeIdentity,treeSize:rootBytes.length,treeSha256:createHash("sha256").update(rootBytes).digest("hex"),entries:Object.freeze(entries)});
 }catch(error){primaryError=error;throw error;}
 finally{
  try{disposeScratch(scratch);}catch(cleanupError){
   if(primaryError===undefined)throw cleanupError;
   throw new AggregateError([primaryError,cleanupError],"Inspection failed and scratch ownership is uncertain");
  }
 }
}
