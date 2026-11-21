/** T11: cabecera y superficie, solo preferencias visuales del usuario. */
import {closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";

export type T11HeaderPlacement="top"|"below-input"|"split";
export type T11Surface="transparent"|"tinted";
export type T11Chrome=Readonly<{header:T11HeaderPlacement;surface:T11Surface}>;
export type T11ChromeState=T11Chrome&Readonly<{source:"default"|"saved"|"invalid"}>;
const DEFAULT:T11Chrome=Object.freeze({header:"top",surface:"transparent"});
const file=(home:string)=>join(home,".asen","t11-chrome.json");

export function validT11Header(value:unknown):value is T11HeaderPlacement{
 return value==="top"||value==="below-input"||value==="split";
}
export function validT11Surface(value:unknown):value is T11Surface{
 return value==="transparent"||value==="tinted";
}
export function parseT11Chrome(raw:unknown):T11Chrome|undefined{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return;
 const obj=raw as Record<string,unknown>;
 if(Object.keys(obj).sort().join(",")!=="header,schema,surface"||obj.schema!==1)return;
 if(!validT11Header(obj.header)||!validT11Surface(obj.surface))return;
 return {header:obj.header,surface:obj.surface};
}
export function readT11Chrome(home:string):T11ChromeState{
 const dir=join(home,".asen"),target=file(home);
 try{
  if(!existsSync(dir))return {...DEFAULT,source:"default"};
  const folder=lstatSync(dir);
  if(folder.isSymbolicLink()||!folder.isDirectory())return {...DEFAULT,source:"invalid"};
  if(!existsSync(target))return {...DEFAULT,source:"default"};
  const stat=lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024)return {...DEFAULT,source:"invalid"};
  const result=parseT11Chrome(JSON.parse(readFileSync(target,"utf8")) as unknown);
  return result?{...result,source:"saved"}:{...DEFAULT,source:"invalid"};
 }catch{return {...DEFAULT,source:"invalid"};}
}
export function writeT11Chrome(home:string,prefs:T11Chrome):void{
 if(!validT11Header(prefs.header)||!validT11Surface(prefs.surface))throw Error("Preferencias visuales T11 no válidas");
 const dir=join(home,".asen"),target=file(home);
 if(existsSync(dir)){
  const stat=lstatSync(dir);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error("Carpeta visual T11 no segura");
 }else mkdirSync(dir,{recursive:true,mode:0o700});
 if(existsSync(target)){
  const stat=lstatSync(target);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error("Archivo visual T11 no seguro");
 }
 const temporary=join(dir,".t11-chrome-"+randomUUID()+".tmp");
 let handle:number|undefined;
 try{
  handle=openSync(temporary,"wx",0o600);
  writeFileSync(handle,JSON.stringify({schema:1,header:prefs.header,surface:prefs.surface})+"\n","utf8");
  closeSync(handle);handle=undefined;
  renameSync(temporary,target);
 }finally{
  if(handle!==undefined)closeSync(handle);
  rmSync(temporary,{force:true});
 }
}
