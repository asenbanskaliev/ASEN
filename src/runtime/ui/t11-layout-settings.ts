/** T11: preferencias de distribución y densidad; nunca permisos ni modelos. */
import {closeSync,existsSync,lstatSync,mkdirSync,openSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {join} from "node:path";
export type T11Position="auto"|"right"|"bottom"|"hidden";
export type T11Density="comfortable"|"compact"|"minimal";
export type T11Layout=Readonly<{position:T11Position;density:T11Density}>;
export type T11LayoutState=T11Layout&Readonly<{source:"default"|"saved"|"invalid"}>;
const DEFAULT:T11Layout={position:"auto",density:"comfortable"};
const location=(home:string)=>join(home,".asen","t11-layout.json");
export function validT11Position(value:unknown):value is T11Position{
 return value==="auto"||value==="right"||value==="bottom"||value==="hidden";
}
export function validT11Density(value:unknown):value is T11Density{
 return value==="comfortable"||value==="compact"||value==="minimal";
}
export function parseT11Layout(value:unknown):T11Layout|undefined{
 if(value===null||typeof value!=="object"||Array.isArray(value))return;
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(",")!=="density,position,schema"||row.schema!==1)return;
 return validT11Position(row.position)&&validT11Density(row.density)?
  {position:row.position,density:row.density}:undefined;
}
/** Ante datos corruptos o enlaces vuelve a valores seguros y avisa de la anomalía. */
export function readT11Layout(home:string):T11LayoutState{
 const dir=join(home,".asen"),file=location(home);
 try{
  if(!existsSync(dir))return {...DEFAULT,source:"default"};
  const folder=lstatSync(dir);
  if(folder.isSymbolicLink()||!folder.isDirectory())return {...DEFAULT,source:"invalid"};
  if(!existsSync(file))return {...DEFAULT,source:"default"};
  const info=lstatSync(file);
  if(info.isSymbolicLink()||!info.isFile()||info.size>1024)return {...DEFAULT,source:"invalid"};
  const prefs=parseT11Layout(JSON.parse(readFileSync(file,"utf8")) as unknown);
  return prefs?{...prefs,source:"saved"}:{...DEFAULT,source:"invalid"};
 }catch{return {...DEFAULT,source:"invalid"};}
}
/** Solo se escriben dos propiedades visuales y un número de versión fijo. */
export function writeT11Layout(home:string,prefs:T11Layout):void{
 if(!validT11Position(prefs.position)||!validT11Density(prefs.density))throw Error("Invalid T11 visual preference");
 const dir=join(home,".asen"),file=location(home);
 if(existsSync(dir)){const stat=lstatSync(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error("Unsafe T11 layout directory");}
 else mkdirSync(dir,{recursive:true,mode:0o700});
 if(existsSync(file)){const stat=lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile())throw Error("Unsafe T11 layout file");}
 const temp=join(dir,".t11-layout-"+randomUUID()+".tmp");
 let fd:number|undefined;
 try{
  fd=openSync(temp,"wx",0o600);
  writeFileSync(fd,JSON.stringify({schema:1,position:prefs.position,density:prefs.density})+"\n","utf8");
  closeSync(fd);fd=undefined;
  renameSync(temp,file);
 }finally{if(fd!==undefined)closeSync(fd);rmSync(temp,{force:true});}
}
