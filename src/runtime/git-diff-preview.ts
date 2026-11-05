import {execFileSync} from "node:child_process";
import {constants,lstatSync,openSync,fstatSync,readFileSync,closeSync,realpathSync} from "node:fs";
import nodePath from "node:path";
import {captureWorkspaceRootIdentity,assertWorkspaceRootIdentity,snapshotWorkspaceRoots,type WorkspaceRootSnapshot} from "./workspace-snapshot.js";
import {sanitizeTerminalText,truncateForTerminal} from "./responsive-layout.js";

export interface GitDiffPreview{
 readonly root:string;readonly branch:string;readonly path:string;
 readonly status:string;readonly lines:readonly string[];readonly truncated:boolean;
}
const MAX_DIFF_BYTES=256*1024,MAX_LINES=150;
const text=(value:string)=>sanitizeTerminalText(value).replace(/\t/gu,"  ");
function safePath(value:string):boolean{
 if(!value||value.length>4096||nodePath.isAbsolute(value)||nodePath.win32.isAbsolute(value)||value.includes("\0"))return false;
 const elements=value.replace(/\\/gu,"/").split("/");
 return elements.every(element=>element!==""&&element!=="."&&element!=="..");
}
/** Read current Git state, not tool attribution. This has no write or editor capability. */
export function previewWorkspaceFileDiff(root:string,filename:string):GitDiffPreview{
 if(!safePath(filename))throw new Error("Git diff path must be a safe, repository-relative path");
 const rootId=captureWorkspaceRootIdentity(root);
 const snapshot=snapshotWorkspaceRoots([rootId.canonical])[0];
 if(!snapshot||snapshot.error)throw new Error("Git root is not available");
 const file=snapshot.files.find(entry=>entry.path===filename);
 if(!file)throw new Error("Git file was not in the current status snapshot");
 let raw:string;
 if(file.status==="??"){
  // Untracked files are absent from HEAD. Only read regular in-root files
  // through a no-follow descriptor; cap bytes *before* decoding.
  const absolute=nodePath.resolve(rootId.canonical,filename);
  const real=realpathSync(absolute);
  if(real!==absolute&&process.platform!=="win32")throw new Error("Untracked file path was redirected");
  if(real!==rootId.canonical&&!real.startsWith(rootId.canonical+nodePath.sep))throw new Error("Untracked file escapes the repository");
  if(lstatSync(absolute).isSymbolicLink())throw new Error("Symlink previews are not allowed");
  const fd=openSync(absolute,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const stat=fstatSync(fd);
   if(!stat.isFile()||stat.size>MAX_DIFF_BYTES)throw new Error("Git diff preview exceeds byte limit or is not a file");
   const buffer=readFileSync(fd);
   if(buffer.includes(0))throw new Error("Binary changes are not previewed");
   raw="--- /dev/null\n+++ b/"+filename+"\n"+buffer.toString("utf8").split(/\r?\n/u).map(line=>"+"+line).join("\n");
  }finally{closeSync(fd);}
 }else{
  try{
   raw=execFileSync("git",["-C",rootId.canonical,"--no-pager","diff","--no-ext-diff","--no-textconv","--no-color","--unified=3","HEAD","--",filename],{
    encoding:"utf8",timeout:5000,maxBuffer:MAX_DIFF_BYTES,windowsHide:true,
    stdio:["ignore","pipe","ignore"],
   });
  }catch{throw new Error("Git diff could not be read within its bound");}
 }
 assertWorkspaceRootIdentity(root,rootId);
 const lines=raw.split(/\r?\n/u),truncated=lines.length>MAX_LINES;
 return Object.freeze({
  root:rootId.canonical,branch:snapshot.branch,path:filename,status:file.status,
  lines:Object.freeze(lines.slice(0,MAX_LINES).map(line=>text(line))),
  truncated,
 });
}
export function renderGitDiffPreview(preview:GitDiffPreview,width=100):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid Git preview width");
 const lines=[
  "CHANGES · "+preview.branch+" · "+preview.status+" "+preview.path,
  "Read-only diff against HEAD; no editor or commit is opened",
  ...preview.lines,
  ...(preview.truncated?["… diff preview truncated at "+MAX_LINES+" lines"]:[]),
 ];
 return Object.freeze(lines.map(line=>truncateForTerminal(line,width)));
}
export function gitChangesIndex(snapshot:WorkspaceRootSnapshot,width=90):readonly string[]{
 if(!Number.isSafeInteger(width)||width<12||width>1000)throw new Error("Invalid changes width");
 if(snapshot.error)return Object.freeze([truncateForTerminal("Git changes unavailable",width)]);
 const lines=["Git "+snapshot.branch+" · "+snapshot.files.length+" changes"];
 for(const file of snapshot.files.slice(0,50))lines.push(file.status+" "+file.path);
 if(snapshot.files.length>50)lines.push("… "+(snapshot.files.length-50)+" more changes");
 return Object.freeze(lines.map(line=>truncateForTerminal(text(line),width)));
}
