/** Preferencias de presentación: no transportan permisos ni modelos. */
import {closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
export type AsenAppearancePreset="light"|"neutral"|"power";
export type AsenAppearanceState=Readonly<{preset:AsenAppearancePreset;source:"default"|"saved"|"invalid"}>;
const DEFAULT:AsenAppearanceState=Object.freeze({preset:"neutral",source:"default"});
const filename=(home:string)=>join(home,".asen","t11-appearance.json");
export function isAsenAppearancePreset(value:unknown):value is AsenAppearancePreset{
 return value==="light"||value==="neutral"||value==="power";
}
export function parseAsenAppearance(value:unknown):AsenAppearancePreset|undefined{
 if(value===null||typeof value!=="object"||Array.isArray(value))return;
 const o=value as Record<string,unknown>;
 if(Object.keys(o).sort().join(",")!=="preset,schema"||o.schema!==1)return;
 return isAsenAppearancePreset(o.preset)?o.preset:undefined;
}
export function readAsenAppearance(home:string):AsenAppearanceState{
 const dir=join(home,".asen"),file=filename(home);
 try{
  if(!existsSync(dir))return DEFAULT;
  const folder=lstatSync(dir);
  if(folder.isSymbolicLink()||!folder.isDirectory())return {preset:"neutral",source:"invalid"};
  if(!existsSync(file))return DEFAULT;
  const info=lstatSync(file);
  if(info.isSymbolicLink()||!info.isFile()||info.size>1024)return {preset:"neutral",source:"invalid"};
  const preset=parseAsenAppearance(JSON.parse(readFileSync(file,"utf8")) as unknown);
  return preset?{preset,source:"saved"}:{preset:"neutral",source:"invalid"};
 }catch{return {preset:"neutral",source:"invalid"};}
}
export function saveAsenAppearance(home:string,preset:AsenAppearancePreset):void{
 if(!isAsenAppearancePreset(preset))throw Error("Invalid ASEN appearance preset");
 const dir=join(home,".asen"),file=filename(home);
 if(existsSync(dir)){const data=lstatSync(dir);if(data.isSymbolicLink()||!data.isDirectory())throw Error("Unsafe ASEN appearance directory");}
 else mkdirSync(dir,{recursive:true,mode:0o700});
 if(existsSync(file)){const data=lstatSync(file);if(data.isSymbolicLink()||!data.isFile())throw Error("Unsafe ASEN appearance file");}
 const temporary=join(dir,".t11-appearance-"+randomUUID()+".tmp");
 let fd:number|undefined;
 try{
  fd=openSync(temporary,"wx",0o600);
  writeFileSync(fd,JSON.stringify({schema:1,preset})+"\n","utf8");
  closeSync(fd);fd=undefined;
  renameSync(temporary,file);
 }finally{
  if(fd!==undefined)closeSync(fd);
  rmSync(temporary,{force:true});
 }
}
