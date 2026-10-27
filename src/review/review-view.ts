import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chmodSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,rmdirSync,unlinkSync,writeFileSync} from "node:fs";
import {dirname,isAbsolute,join,relative,resolve} from "node:path";
import {tmpdir} from "node:os";
import type {CandidateGitTreeManifest,CandidateGitTreeEntry} from "./review-tree-inspection.js";
import {validatePortableReviewPaths} from "./review-tree-paths.js";

export interface ReviewView {
 readonly schemaVersion:1;
 readonly root:string;
 readonly candidateTree:string;
 readonly manifestDigest:string;
 readonly viewIdentity:string;
 readonly entryCount:number;
 readonly platform:"posix"|"windows";
 readonly rootDev:number;
 readonly rootIno:number;
 readonly paths:readonly string[];
 readonly entries:readonly Readonly<{path:string;size:number;contentSha256:string;mode:"100644"|"100755"}>[];
}

interface ViewClaim {readonly root:string;readonly realRoot:string;readonly dev:number;readonly ino:number;readonly manifestDigest:string;}
// Public view fields are descriptive, not an ownership capability. Keeping the
// claim out of the serializable object prevents forged/cloned views from being
// used to remove arbitrary files through disposeReviewView.
const liveViewClaims=new WeakMap<ReviewView,ViewClaim>();

function requireLiveClaim(view:ReviewView):ViewClaim {
 const claim=liveViewClaims.get(view);
 if(!claim||claim.root!==view.root||claim.dev!==view.rootDev||claim.ino!==view.rootIno||claim.manifestDigest!==view.manifestDigest)
  throw new Error("Review view ownership is uncertain");
 return claim;
}

function assertDirectory(path:string,label:string):{realPath:string;dev:number;ino:number} {
 const requested=resolve(path),info=lstatSync(requested);
 if(!info.isDirectory()||info.isSymbolicLink())throw new Error(`${label} must be an owned non-symlink directory`);
 const realPath=realpathSync(requested);
 if(realPath!==requested)throw new Error(`${label} must be canonical`);
 return {realPath,dev:info.dev,ino:info.ino};
}

function digestManifest(manifest:CandidateGitTreeManifest):string {
 return createHash("sha256").update("asen.review-view.manifest.v1\0").update(JSON.stringify({
  treeIdentity:manifest.treeIdentity,objectFormat:manifest.objectFormat,
  entries:manifest.entries.map(entry=>[entry.path,entry.kind,entry.mode,entry.objectId,entry.size,entry.contentSha256,entry.bytesBase64]),
 })).digest("hex");
}

function validateEntry(entry:CandidateGitTreeEntry):void {
 if(entry.kind!=="regular"||entry.mode!=="100644"&&entry.mode!=="100755")throw new Error("Review view refuses links and gitlinks");
 if(typeof entry.bytesBase64!=="string"||entry.bytesBase64.length>16*1024*1024)throw new Error("Review view entry bytes are invalid");
 const bytes=Buffer.from(entry.bytesBase64,"base64");
 if(!Number.isSafeInteger(entry.size)||entry.size!==bytes.length)throw new Error("Review view entry size is invalid");
 if(createHash("sha256").update(bytes).digest("hex")!==entry.contentSha256)throw new Error("Review view entry hash is invalid");
}

function applyWindowsReadOnlyAcl(root:string):void {
 const username=process.env.USERNAME;
 if(!username)throw new Error("review-unavailable: Windows owner identity is unavailable");
 try {
  execFileSync("icacls",[root,"/inheritance:r","/grant:r",`${username}:(OI)(CI)RX`],{stdio:"ignore",windowsHide:true,timeout:10_000});
 } catch { throw new Error("review-unavailable: private-view-not-provable"); }
}

function verifyMaterializedEntries(view:ReviewView,entries:readonly CandidateGitTreeEntry[]):void {
 const expected=new Map(entries.map(entry=>[entry.path,entry]));
 if(expected.size!==view.entryCount||view.paths.length!==expected.size)throw new Error("Review view entry inventory is inconsistent");
 for(const [path,expectedEntry] of expected){
  assertOrdinaryReviewParents(view.root,path);
  const target=join(view.root,...path.split("/")),info=lstatSync(target);
  if(!info.isFile()||info.isSymbolicLink())throw new Error("Review view entry ownership is uncertain");
  const bytes=readFileSync(target);
  if(bytes.length!==expectedEntry.size||createHash("sha256").update(bytes).digest("hex")!==expectedEntry.contentSha256)throw new Error("Review view contents drifted from the candidate");
 }
}

function assertOrdinaryReviewParents(root:string,path:string):void {
 let current=root;
 for(const part of path.split("/").slice(0,-1)){
  current=join(current,part);
  const info=lstatSync(current);
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Review view parent directory is unsafe");
 }
}

/** Materializes one frozen Git tree as a private, read-only reviewer view. */
export function materializeReviewView(manifest:CandidateGitTreeManifest,parent:string):ReviewView {
 if(typeof manifest!=="object"||manifest===null||manifest.schemaVersion!==1)throw new Error("Review tree manifest is invalid");
 if(!isAbsolute(parent))throw new Error("Review view parent must be absolute");
 const parentClaim=assertDirectory(parent,"Review view parent");
 const repositoryRoot=realpathSync(manifest.repositoryRoot);
 const parentRelative=relative(repositoryRoot,parentClaim.realPath);
 if(!parentRelative||(!parentRelative.startsWith("..")&&!isAbsolute(parentRelative)))throw new Error("Review view parent must be outside the repository");
 const paths=manifest.entries.map(entry=>entry.path);
 validatePortableReviewPaths(paths);
 for(const entry of manifest.entries)validateEntry(entry);
 const manifestDigest=digestManifest(manifest);
 const root=mkdtempSync(join(parentClaim.realPath,"asen-review-view-"));
 let committed=false;
 try {
  for(const entry of manifest.entries){
   const target=join(root,...entry.path.split("/"));
   const rootRelative=relative(root,target);
   if(!rootRelative||rootRelative.startsWith("..")||isAbsolute(rootRelative))throw new Error("Review view path escaped its root");
   const directory=dirname(target);
   if(directory!==root)mkdirSync(directory,{recursive:true,mode:0o700});
   writeFileSync(target,Buffer.from(entry.bytesBase64!,"base64"),{flag:"wx",mode:entry.mode==="100755"?0o500:0o400});
   if(process.platform!=="win32")chmodSync(target,entry.mode==="100755"?0o500:0o400);
  }
  if(process.platform==="win32")applyWindowsReadOnlyAcl(root);else chmodSync(root,0o500);
  const info=lstatSync(root);
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error("Review view root changed during materialization");
  committed=true;
  const view=Object.freeze({schemaVersion:1 as const,root,candidateTree:manifest.treeIdentity,manifestDigest,
   viewIdentity:createHash("sha256").update(`${root}\0${info.dev}\0${info.ino}\0${manifestDigest}`).digest("hex"),
   entryCount:manifest.entries.length,platform:process.platform==="win32"?"windows" as const:"posix" as const,rootDev:info.dev,rootIno:info.ino,
   paths:Object.freeze(manifest.entries.map(entry=>entry.path)),
   entries:Object.freeze(manifest.entries.map(entry=>Object.freeze({path:entry.path,size:entry.size!,contentSha256:entry.contentSha256!,mode:entry.mode as "100644"|"100755"})))});
  liveViewClaims.set(view,{root,realRoot:realpathSync(root),dev:info.dev,ino:info.ino,manifestDigest});
  return view;
 } finally {
  if(!committed)rmSync(root,{recursive:true,force:true});
 }
}

/** Closes a view only if its root still belongs to this materialization. */
export function disposeReviewView(view:ReviewView):void {
 const claim=requireLiveClaim(view);
 const info=lstatSync(view.root,{throwIfNoEntry:false});
 if(!info||!info.isDirectory()||info.isSymbolicLink()||info.dev!==claim.dev||info.ino!==claim.ino||realpathSync(view.root)!==claim.realRoot)throw new Error("Review view ownership is uncertain");
 chmodSync(view.root,0o700);
 const directories=new Set<string>();
 for(const path of view.paths){
  const target=join(view.root,...path.split("/")),entry=lstatSync(target,{throwIfNoEntry:false});
  if(!entry||!entry.isFile()||entry.isSymbolicLink())throw new Error("Review view entry ownership is uncertain");
  unlinkSync(target);
  let directory=dirname(target);
  while(directory!==view.root){directories.add(directory);directory=dirname(directory);}
 }
 for(const directory of [...directories].sort((a,b)=>b.length-a.length))rmdirSync(directory);
 if(readdirSync(view.root).length!==0)throw new Error("Review view contains unowned data");
 rmdirSync(view.root);
 liveViewClaims.delete(view);
}

export function readReviewViewFile(view:ReviewView,path:string):Buffer {
 requireLiveClaim(view);
 const rootInfo=lstatSync(view.root,{throwIfNoEntry:false});
 if(!rootInfo||!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||rootInfo.dev!==view.rootDev||rootInfo.ino!==view.rootIno)throw new Error("Review view ownership is uncertain");
 validatePortableReviewPaths([path]);
 const target=join(view.root,...path.split("/"));
 assertOrdinaryReviewParents(view.root,path);
 const rootRelative=relative(view.root,target);
 if(!rootRelative||rootRelative.startsWith("..")||isAbsolute(rootRelative))throw new Error("Review view path escaped its root");
 const info=lstatSync(target);
 if(!info.isFile()||info.isSymbolicLink())throw new Error("Review view file is unsafe");
 const expected=view.entries.find(entry=>entry.path===path);
 if(!expected)throw new Error("Review view path is not part of the candidate");
 const bytes=readFileSync(target);
 if(bytes.length!==expected.size||createHash("sha256").update(bytes).digest("hex")!==expected.contentSha256)throw new Error("Review view contents drifted from the candidate");
 return bytes;
}

/** Rejects a stale view before a new review or correction can consume it. */
export function revalidateReviewView(view:ReviewView,manifest:CandidateGitTreeManifest):ReviewView {
 requireLiveClaim(view);
 const rootInfo=lstatSync(view.root,{throwIfNoEntry:false});
 if(!rootInfo||!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||rootInfo.dev!==view.rootDev||rootInfo.ino!==view.rootIno)throw new Error("Review view ownership is uncertain");
 if(manifest.treeIdentity!==view.candidateTree||digestManifest(manifest)!==view.manifestDigest)throw new Error("Review view candidate drifted");
 verifyMaterializedEntries(view,manifest.entries);
 return view;
}
