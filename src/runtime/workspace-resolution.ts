import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {closeSync,constants,fchmodSync,fsyncSync,lstatSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {join,resolve,relative,sep} from "node:path";
import {hasSensitiveName} from "../security/primary-tool-policy.js";
import {acquireWorkspaceWriter} from "./workspace-writer-lease.js";
import {assertWorkspaceRootIdentity,captureWorkspaceRootIdentity,type WorkspaceRootIdentity} from "./workspace-snapshot.js";

const MAX_BYTES=262144;
export interface WorkspaceCorrectionCandidate {
 readonly root:string;readonly relativePath:string;readonly expectedHead:string;
 readonly sha256:string;readonly content:string;readonly identity:WorkspaceRootIdentity;
 readonly device:number;readonly inode:number;
}
const issued=new WeakSet<object>(),consumed=new WeakSet<object>();
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");

function pathParts(root:string,relativePath:string):{target:string;parts:string[]}{
 if(typeof relativePath!=="string"||!relativePath||relativePath.startsWith("/")||relativePath.includes("\\")||relativePath.includes("\0")||/^[A-Za-z]:/u.test(relativePath))throw new Error("Invalid workspace correction path");
 const parts=relativePath.split("/");
 if(parts.some(part=>!part||part==="."||part===".."||/[\u0000-\u001f\u007f]/u.test(part)))throw new Error("Invalid workspace correction path");
 const target=resolve(root,...parts),suffix=relative(root,target);
 if(!suffix||suffix.startsWith(".."+sep)||suffix===".."||hasSensitiveName(target))throw new Error("Workspace correction path is outside its authorized scope");
 let parent=root;
 for(const part of parts.slice(0,-1)){
  parent=join(parent,part);
  const stat=lstatSync(parent);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("Workspace correction parent is not an ordinary directory");
 }
 return {target,parts};
}
function inspected(root:string,relativePath:string):{target:string;data:Buffer;device:number;inode:number;mode:number}{
 const {target}=pathParts(root,relativePath);
 const before=lstatSync(target);
 if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_BYTES)throw new Error("Workspace correction requires an ordinary bounded text file");
 const data=readFileSync(target),after=lstatSync(target);
 if(data.length>MAX_BYTES||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||!Buffer.from(data.toString("utf8"),"utf8").equals(data)||data.includes(0))throw new Error("Workspace correction source is unsafe or changed");
 return {target,data,device:after.dev,inode:after.ino,mode:after.mode};
}
function git(root:string,...args:string[]):string{
 return execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,maxBuffer:1048576,windowsHide:true}).trim();
}

/** Descriptive, immutable candidate; it cannot be applied twice or to a newer HEAD. */
export function prepareWorkspaceCorrection(input:{root:string;relativePath:string}):WorkspaceCorrectionCandidate{
 const identity=captureWorkspaceRootIdentity(input.root),root=identity.canonical;
 assertWorkspaceRootIdentity(input.root,identity);
 const file=inspected(root,input.relativePath);
 git(root,"ls-files","--error-unmatch","--",input.relativePath);
 const expectedHead=git(root,"rev-parse","HEAD");
 assertWorkspaceRootIdentity(input.root,identity);
 const candidate=Object.freeze({root,relativePath:input.relativePath,expectedHead,sha256:hash(file.data),content:file.data.toString("utf8"),identity,device:file.device,inode:file.inode});
 issued.add(candidate);
 return candidate;
}

/** One-use exact-file correction, invoked only after Pi's interactive user consent. */
export function applyWorkspaceCorrection(candidate:WorkspaceCorrectionCandidate,replacement:string,hooks?:{beforePublish?:()=>void;afterPublish?:()=>void}):Readonly<{status:"updated";path:string;beforeSha256:string;afterSha256:string;head:string;postPublicationWarning?:string}>{
 if(!candidate||!issued.has(candidate)||consumed.has(candidate))throw new Error("Workspace correction candidate is not issued or has already been consumed");
 consumed.add(candidate);
 if(typeof replacement!=="string"||replacement.includes("\0")||Buffer.byteLength(replacement,"utf8")>MAX_BYTES)throw new Error("Workspace correction replacement is invalid");
 const root=candidate.root,old=inspected(root,candidate.relativePath);
 if(old.device!==candidate.device||old.inode!==candidate.inode||hash(old.data)!==candidate.sha256)throw new Error("Workspace correction source changed; request a fresh approval");
 assertWorkspaceRootIdentity(root,candidate.identity);
 const tempRelative=join(candidate.relativePath.split("/").slice(0,-1).join("/"),".asen-correction-"+randomUUID()).replace(/\\/g,"/");
 const temp=resolve(root,...tempRelative.split("/"));
 const lease=acquireWorkspaceWriter({root,expectedHead:candidate.expectedHead,authorizationId:"pi-workspace-"+randomUUID(),allowedPaths:[candidate.relativePath,tempRelative]});
 let fd:number|undefined;
 try{
  lease.verify();
  const latest=inspected(root,candidate.relativePath);
  if(latest.device!==candidate.device||latest.inode!==candidate.inode||hash(latest.data)!==candidate.sha256)throw new Error("Workspace correction source changed during admission");
  if(Buffer.from(replacement,"utf8").equals(latest.data))throw new Error("Workspace correction does not change the candidate");
  fd=openSync(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),0o600);
  if(process.platform!=="win32")fchmodSync(fd,old.mode&0o777);
  writeFileSync(fd,replacement,"utf8");fsyncSync(fd);closeSync(fd);fd=undefined;
  hooks?.beforePublish?.();
  lease.verify();assertWorkspaceRootIdentity(root,candidate.identity);
  const final=inspected(root,candidate.relativePath);
  if(final.device!==candidate.device||final.inode!==candidate.inode||hash(final.data)!==candidate.sha256)throw new Error("Workspace correction source changed before publication");
  renameSync(temp,old.target);
  // After rename, reporting failure without acknowledging the write would lose attribution.
  // Post-publication drift is an explicit warning, never a false "no write happened".
  const replacementHash=hash(Buffer.from(replacement,"utf8"));
  let postPublicationWarning:string|undefined;
  try{
   hooks?.afterPublish?.();
   lease.verify();
   const finalPublished=inspected(root,candidate.relativePath);
   if(hash(finalPublished.data)!==replacementHash)throw new Error("Published file changed");
  }catch{
   postPublicationWarning="The file was published, but final workspace verification failed; inspect Git and the file before continuing.";
  }
  return Object.freeze({status:"updated" as const,path:candidate.relativePath,beforeSha256:candidate.sha256,afterSha256:replacementHash,head:candidate.expectedHead,...(postPublicationWarning?{postPublicationWarning}:{})});
 }finally{
  if(fd!==undefined)try{closeSync(fd);}catch{/* preserve the original error */}
  try{unlinkSync(temp);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  lease.release();
 }
}
