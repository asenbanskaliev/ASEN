import {execFileSync} from "node:child_process";
import {constants,closeSync,fsyncSync,fstatSync,lstatSync,openSync,readSync,realpathSync,writeSync} from "node:fs";
import {dirname,isAbsolute,join,relative,resolve} from "node:path";

const PATTERN=".codegraph/";
const EQUIVALENT=new Set([".codegraph",".codegraph/","/.codegraph","/.codegraph/"]);
const MAX_BYTES=128*1024;

export type CodeGraphLocalExclude=Readonly<{status:"added"|"present"|"failed";path?:string;reason?:string}>;

function git(root:string,argument:string):string{
 const env={...process.env};
 for(const key of Object.keys(env))if(key.startsWith("GIT_"))delete env[key];
 return execFileSync("git",["-C",root,"rev-parse","--path-format=absolute",argument==="common"?"--git-common-dir":"--git-path",...(argument==="common"?[]:["info/exclude"])],{
  env,encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000,maxBuffer:16384,windowsHide:true,
 }).trim();
}
function sameFile(a:{dev:number;ino:number},b:{dev:number;ino:number}):boolean{
 return a.dev===b.dev&&a.ino===b.ino;
}
function failure(reason:string):CodeGraphLocalExclude{
 return {status:"failed",reason:reason.slice(0,400)};
}

/** A local, post-approval Git exclusion; never called for read-only CodeGraph queries. */
export function excludeCodeGraphIndexLocally(root:string):CodeGraphLocalExclude{
 let fd:number|undefined;
 try{
  const common=realpathSync.native(git(root,"common"));
  const raw=git(root,"path"),file=isAbsolute(raw)?resolve(raw):resolve(root,raw);
  const parent=dirname(file),canonicalParent=realpathSync.native(parent);
  const commonInfo=join(common,"info"),ordinary=lstatSync(parent);
  if(canonicalParent!==commonInfo||!ordinary.isDirectory()||ordinary.isSymbolicLink()||relative(common,file)!=="info"+(process.platform==="win32"?"\\":"/")+"exclude")
   return failure("Git exclusion path is not the ordinary repository-local info/exclude file");
  let info;
  try{info=lstatSync(file);}
  catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(info&&(!info.isFile()||info.isSymbolicLink()||info.size>MAX_BYTES))return failure("Git exclusion is not a bounded ordinary file");
  if(!info){
   try{
    fd=openSync(file,constants.O_RDWR|constants.O_APPEND|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    writeSync(fd,PATTERN+"\n");fsyncSync(fd);return {status:"added",path:file};
   }catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
   finally{if(fd!==undefined){closeSync(fd);fd=undefined;}}
   info=lstatSync(file);
  }
  if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_BYTES)return failure("Git exclusion changed during admission");
  fd=openSync(file,constants.O_RDWR|constants.O_APPEND|(constants.O_NOFOLLOW??0));
  const held=fstatSync(fd),current=lstatSync(file);
  if(!held.isFile()||!current.isFile()||current.isSymbolicLink()||!sameFile(held,current)||held.size>MAX_BYTES)return failure("Git exclusion file identity changed");
  const buffer=Buffer.alloc(MAX_BYTES+1);
  const count=readSync(fd,buffer,0,buffer.length,0);
  if(count>MAX_BYTES||buffer.subarray(0,count).includes(0))return failure("Git exclusion file is oversized or malformed");
  const original=buffer.subarray(0,count).toString("utf8");
  if(original.split(/\r?\n/u).some(line=>EQUIVALENT.has(line.trim())))return {status:"present",path:file};
  const latest=fstatSync(fd),pathname=lstatSync(file);
  if(!sameFile(held,latest)||!sameFile(held,pathname)||latest.size!==held.size)return failure("Git exclusion file changed before writing");
  writeSync(fd,(original&&!original.endsWith("\n")?"\n":"")+PATTERN+"\n");
  fsyncSync(fd);
  return {status:"added",path:file};
 }catch(error){
  return failure(error instanceof Error?error.message:"Git exclusion unavailable");
 }finally{if(fd!==undefined)closeSync(fd);}
}
