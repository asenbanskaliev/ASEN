import {types} from "node:util";
import {checkPiVersion} from "./launcher.js";

const required=["on","registerCommand","registerTool","registerFlag","getFlag"] as const;
export const ASEN_PI_MINIMUM_VERSION="0.85.1";
/** Validate the public factory boundary without invoking untrusted host getters. */
export function validatePiHost(host:unknown,version:unknown):void{
 if(typeof version!=="string"||!/^\d+\.\d+\.\d+$/.test(version)||!checkPiVersion(version,ASEN_PI_MINIMUM_VERSION).ok)
  throw new Error("ASEN requires a known Pi version >=0.85.1");
 if(typeof host!=="object"||host===null||types.isProxy(host))throw new Error("ASEN requires the public Pi extension API");
 for(const name of required){
  const descriptor=Object.getOwnPropertyDescriptor(host,name);
  if(!descriptor||!("value" in descriptor)||typeof descriptor.value!=="function")
   throw new Error(`ASEN requires callable Pi ${name} before registration`);
 }
}

/** Check public command inventory before registration when the host exposes it. */
export function validatePiCommandCollisions(host:unknown,names:readonly string[]):void{
 if(typeof host!=="object"||host===null||types.isProxy(host))throw new Error("ASEN requires the public Pi extension API");
 const descriptor=Object.getOwnPropertyDescriptor(host,"getCommands");
 if(!descriptor)return; // Older hosts have no pre-registration inventory; do not claim collision evidence.
 if(!("value" in descriptor)||typeof descriptor.value!=="function")throw new Error("ASEN host command inventory must be callable");
 const inventory=descriptor.value.call(host) as unknown;
 if(!Array.isArray(inventory)||types.isProxy(inventory))throw new Error("ASEN host command inventory is malformed");
 const reserved=new Set(names);
 if(reserved.size!==names.length||names.some(name=>typeof name!=="string"||!name))throw new Error("ASEN command reservation list is invalid");
 for(const item of inventory){
  if(typeof item!=="object"||item===null||types.isProxy(item))throw new Error("ASEN host command inventory is malformed");
  const entry=Object.getOwnPropertyDescriptor(item,"name");
  if(!entry||!("value" in entry)||typeof entry.value!=="string")throw new Error("ASEN host command inventory is malformed");
  if(reserved.has(entry.value))throw new Error("ASEN command registration collision: "+entry.value);
 }
}
