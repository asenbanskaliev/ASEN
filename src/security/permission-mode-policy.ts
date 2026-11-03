import {constants,closeSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,unlinkSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {dirname,join} from "node:path";

export type AsenPermissionMode="normal"|"auto"|"yolo";
export const ASEN_PERMISSION_MODE_SCHEMA="asen.permission-mode/v1";
export function isAsenPermissionMode(value:unknown):value is AsenPermissionMode{
 return value==="normal"||value==="auto"||value==="yolo";
}
export function permissionModeFile(home:string):string{return join(home,".asen","permission-mode.json");}
export function parsePermissionModeDefault(raw:string):AsenPermissionMode|undefined{
 try{
  const data:unknown=JSON.parse(raw);
  if(!data||typeof data!=="object"||Array.isArray(data))return undefined;
  const row=data as Record<string,unknown>;
  if(Object.keys(row).sort().join(",")!=="mode,schema"||row.schema!==ASEN_PERMISSION_MODE_SCHEMA)return undefined;
  return isAsenPermissionMode(row.mode)?row.mode:undefined;
 }catch{return undefined;}
}
function safeFile(file:string):boolean{
 const stat=lstatSync(file);
 return stat.isFile()&&!stat.isSymbolicLink()&&(process.platform==="win32"||(stat.mode&0o077)===0);
}
function safeParent(parent:string):boolean{
 const stat=lstatSync(parent);
 return stat.isDirectory()&&!stat.isSymbolicLink()&&(process.platform==="win32"||(stat.mode&0o077)===0);
}
export function readPermissionModeDefault(home:string):{mode:AsenPermissionMode;malformed:boolean}{
 const file=permissionModeFile(home);
 try{
  if(!safeFile(file)||!safeParent(dirname(file)))return {mode:"normal",malformed:true};
  const mode=parsePermissionModeDefault(readFileSync(file,"utf8"));
  return mode?{mode,malformed:false}:{mode:"normal",malformed:true};
 }catch(error){
  if((error as NodeJS.ErrnoException).code==="ENOENT")return {mode:"normal",malformed:false};
  return {mode:"normal",malformed:true};
 }
}
export function savePermissionModeDefault(home:string,mode:AsenPermissionMode):void{
 if(!isAsenPermissionMode(mode))throw new Error("Invalid ASEN permission mode");
 const parent=dirname(permissionModeFile(home)),file=permissionModeFile(home);
 mkdirSync(parent,{recursive:true,mode:0o700});
 if(!safeParent(parent)||readPermissionModeDefault(home).malformed)
  throw new Error("ASEN permission mode preference is unsafe or malformed");
 const temp=join(parent,".permission-mode-"+randomUUID()+".tmp");
 let fd:number|undefined;
 try{
  fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  writeFileSync(fd,JSON.stringify({schema:ASEN_PERMISSION_MODE_SCHEMA,mode})+"\n");
  fsyncSync(fd);closeSync(fd);fd=undefined;
  if(readPermissionModeDefault(home).malformed)throw new Error("ASEN permission mode preference changed");
  renameSync(temp,file);
 }finally{
  if(fd!==undefined)closeSync(fd);
  try{unlinkSync(temp);}catch{/* Atomic rename consumed it. */}
 }
}
