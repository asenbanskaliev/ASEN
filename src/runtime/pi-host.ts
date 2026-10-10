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
