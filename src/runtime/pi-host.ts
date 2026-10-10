import {types} from "node:util";
import {checkPiVersion} from "./launcher.js";

const required=["on","registerCommand","registerTool","getCommands","getAllTools"] as const;
export const ASEN_PI_MINIMUM_VERSION="0.85.1";
export const ASEN_PI_MAXIMUM_VERSION_EXCLUSIVE="2.0.0";
export const ASEN_PI_SUPPORTED_MODES=Object.freeze(["tui","rpc","json","print"] as const);
function compareVersion(left:string,right:string):number{
 const a=left.split(".").map(Number),b=right.split(".").map(Number);
 if([...a,...b].some(value=>!Number.isSafeInteger(value)))throw new Error("ASEN Pi version contains an unsafe numeric component");
 for(let index=0;index<3;index++){
  const leftPart=a[index],rightPart=b[index];
  if(leftPart===undefined||rightPart===undefined)throw new Error("ASEN Pi version is missing a numeric component");
  if(leftPart!==rightPart)return leftPart<rightPart?-1:1;
 }
 return 0;
}
/** Validate the public factory boundary without invoking untrusted host getters. */
export function validatePiHost(host:unknown,version:unknown):void{
 if(typeof version!=="string"||!/^\d+\.\d+\.\d+$/.test(version)||version.split(".").some(part=>!Number.isSafeInteger(Number(part)))||!checkPiVersion(version,ASEN_PI_MINIMUM_VERSION).ok||compareVersion(version,ASEN_PI_MAXIMUM_VERSION_EXCLUSIVE)>=0)
  throw new Error("ASEN requires a known Pi version >=0.85.1 and <2.0.0");
 if(typeof host!=="object"||host===null||types.isProxy(host))throw new Error("ASEN requires the public Pi extension API");
 for(const name of required){
  const descriptor=Object.getOwnPropertyDescriptor(host,name);
  if(!descriptor||!("value" in descriptor)||typeof descriptor.value!=="function")
   throw new Error(`ASEN requires callable Pi ${name} before registration`);
 }
}

/** Check public command inventory before registration when the host exposes it. */
function reservationNames(names:readonly string[],label:string):Set<string>{
 if(!Array.isArray(names)||types.isProxy(names)||names.length===0||names.length>100000)throw new Error(`ASEN ${label} reservation list is invalid`);
 const checked:string[]=[],length=Object.getOwnPropertyDescriptor(names,"length");
 const count:unknown=length&&"value" in length?length.value:undefined;
 if(typeof count!=="number"||!Number.isSafeInteger(count)||count<1||count>100000)throw new Error(`ASEN ${label} reservation list is invalid`);
 for(let index=0;index<count;index++){
  const descriptor=Object.getOwnPropertyDescriptor(names,String(index));
  if(!descriptor||!("value" in descriptor)||typeof descriptor.value!=="string"||!descriptor.value||descriptor.value!==descriptor.value.trim()||/[\u0000-\u001f\u007f]/.test(descriptor.value))throw new Error(`ASEN ${label} reservation list is invalid`);
  checked.push(descriptor.value);
 }
 if(new Set(checked).size!==checked.length)throw new Error(`ASEN ${label} reservation list is invalid`);
 return new Set(checked);
}
function readInventory(host:object,methodName:"getCommands"|"getAllTools",label:string):unknown[]{
 const descriptor=Object.getOwnPropertyDescriptor(host,methodName);
 if(!descriptor)throw new Error(`ASEN Pi ${label} inventory is unavailable`);
 if(!("value" in descriptor)||typeof descriptor.value!=="function")throw new Error(`ASEN Pi ${label} inventory must be callable`);
 const inventory=descriptor.value.call(host) as unknown;
 if(!Array.isArray(inventory)||types.isProxy(inventory))throw new Error(`ASEN Pi ${label} inventory is malformed`);
 const length=Object.getOwnPropertyDescriptor(inventory,"length");
 if(!length||!("value" in length)||!Number.isSafeInteger(length.value)||length.value>100000)throw new Error(`ASEN Pi ${label} inventory is malformed`);
 const rows:unknown[]=[];
 for(let index=0;index<length.value;index++){
  const row=Object.getOwnPropertyDescriptor(inventory,String(index));
  if(!row||!("value" in row))throw new Error(`ASEN Pi ${label} inventory is malformed`);
  rows.push(row.value);
 }
 return rows;
}
function validateInventory(host:object,methodName:"getCommands"|"getAllTools",names:readonly string[],label:string):void{
 const reserved=reservationNames(names,label),rows=readInventory(host,methodName,label),seen=new Set<string>();
 for(const row of rows){
  if(typeof row!=="object"||row===null||types.isProxy(row))throw new Error(`ASEN Pi ${label} inventory is malformed`);
  const entry=Object.getOwnPropertyDescriptor(row,"name");
  if(!entry||!("value" in entry)||typeof entry.value!=="string"||!entry.value||entry.value!==entry.value.trim()||/[\u0000-\u001f\u007f]/.test(entry.value))throw new Error(`ASEN Pi ${label} inventory is malformed`);
  if(seen.has(entry.value))throw new Error(`ASEN Pi ${label} inventory is malformed`);
  seen.add(entry.value);
  if(reserved.has(entry.value))throw new Error(`ASEN ${label} registration collision: ${entry.value}`);
 }
}
/** Require complete public inventories and reject all collisions before the first host mutation. */
export function validatePiRegistrationCollisions(host:unknown,commands:readonly string[],tools:readonly string[]):void{
 if(typeof host!=="object"||host===null||types.isProxy(host))throw new Error("ASEN requires the public Pi extension API");
 validateInventory(host,"getCommands",commands,"command");
 validateInventory(host,"getAllTools",tools,"tool");
}

/** Backward-compatible command-only helper; production admission uses both public inventories. */
export function validatePiCommandCollisions(host:unknown,names:readonly string[]):void{
 if(typeof host!=="object"||host===null||types.isProxy(host))throw new Error("ASEN requires the public Pi extension API");
 validateInventory(host,"getCommands",names,"command");
}

export function validatePiExecutionContext(context:unknown):asserts context is {mode:(typeof ASEN_PI_SUPPORTED_MODES)[number];hasUI:boolean}{
 if(typeof context!=="object"||context===null||types.isProxy(context))throw new Error("ASEN requires a public Pi execution context");
 // Pi's public ExtensionContext exposes these properties through trusted getters.
 let mode:unknown,hasUI:unknown;
 try{mode=(context as {mode?:unknown}).mode;hasUI=(context as {hasUI?:unknown}).hasUI;}catch{throw new Error("ASEN does not support this Pi execution mode or context");}
 if(!ASEN_PI_SUPPORTED_MODES.includes(mode as (typeof ASEN_PI_SUPPORTED_MODES)[number])||typeof hasUI!=="boolean")
  throw new Error("ASEN does not support this Pi execution mode or context");
}
