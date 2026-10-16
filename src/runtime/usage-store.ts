import {readFile,rm} from "node:fs/promises";
import {atomicWriteText} from "../io/atomic-write.js";
import {withExclusiveFileLock} from "../io/exclusive-file-lock.js";
import {preparePrivateFile} from "../io/private-file.js";
import {emptyUsage,incrementUsage,type TelemetryConsent,type UsageSnapshot} from "./usage.js";

export interface UsageFile{schema:"asen.usage/v1";revision:number;snapshot:UsageSnapshot;telemetryConsent?:TelemetryConsent}
const SCHEMA="asen.usage/v1" as const,KEYS=["sessions","commands","agentRuns","blockedToolAttempts"] as const;
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function snapshot(value:unknown):value is UsageSnapshot{return exact(value,KEYS)&&KEYS.every(key=>Number.isSafeInteger(value[key])&&Number(value[key])>=0);}
export function emptyUsageFile():UsageFile{return {schema:SCHEMA,revision:0,snapshot:emptyUsage()};}
export function parseUsageFile(raw:string):UsageFile{
 const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid usage store");const v=value as Record<string,unknown>;
 const base=exact(v,["schema","revision","snapshot"]),consented=exact(v,["schema","revision","snapshot","telemetryConsent"]);
 if((!base&&!consented)||v.schema!==SCHEMA||!Number.isSafeInteger(v.revision)||Number(v.revision)<0||!snapshot(v.snapshot))throw new Error("Invalid usage store");
 let telemetryConsent:TelemetryConsent|undefined;if("telemetryConsent" in v){const consent=v.telemetryConsent;if(!exact(consent,["enabled","previewRequired"])||typeof consent.enabled!=="boolean"||consent.previewRequired!==true)throw new Error("Invalid telemetry consent");telemetryConsent={enabled:consent.enabled,previewRequired:true};}
 return {schema:SCHEMA,revision:Number(v.revision),snapshot:{...v.snapshot},...(telemetryConsent?{telemetryConsent}:{})};
}
export async function readUsageFile(file:string):Promise<UsageFile>{if(!await preparePrivateFile(file))return emptyUsageFile();return parseUsageFile(await readFile(file,"utf8"));}
async function write(file:string,value:UsageFile):Promise<void>{await preparePrivateFile(file,true);await atomicWriteText(file,`${JSON.stringify(value,null,2)}\n`);}
export async function updateUsageFile(file:string,change:(current:UsageFile)=>UsageFile):Promise<UsageFile>{
 await preparePrivateFile(file,true);return withExclusiveFileLock(file,async()=>{
  const current=await readUsageFile(file),next=change(structuredClone(current));if(next.revision!==current.revision+1)throw new Error("Usage revision must advance once");const checked=parseUsageFile(JSON.stringify(next));await write(file,checked);return checked;
 });
}
export async function incrementUsageFile(file:string,key:keyof UsageSnapshot):Promise<UsageFile>{return updateUsageFile(file,current=>({...current,revision:current.revision+1,snapshot:incrementUsage(current.snapshot,key)}));}
export async function clearUsageFile(file:string):Promise<void>{await preparePrivateFile(file,true);await withExclusiveFileLock(file,()=>rm(file,{force:true}));}
