import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {inspectManagedInstall,type ManagedInstallFile} from "./managed-install.js";

export interface ManagedVersionVerification {
 readonly schema: "asen.managed-version-verification/v1";
 readonly version: string;
 readonly integrity: "verified" | "unverified";
 readonly packageMetadata: "verified" | "unverified";
 readonly nodeCompatibility: "compatible" | "incompatible" | "unverified";
 readonly runtimeProbe: "not-run";
 readonly runtimeReady: false;
 readonly reason: string | null;
}

export interface ManagedCliCandidateResolution {
 readonly verification:ManagedVersionVerification;
 readonly candidate:Readonly<{managedRoot:string;versionRoot:string;bin:string;files:readonly ManagedInstallFile[]}>|null;
}

type Observations=Pick<ManagedVersionVerification,"integrity"|"packageMetadata"|"nodeCompatibility">;
function report(version:string,reason:string|null,observations:Partial<Observations>={}):ManagedCliCandidateResolution {
 const verification:ManagedVersionVerification=Object.freeze({schema:"asen.managed-version-verification/v1",version,
  integrity:"unverified",packageMetadata:"unverified",nodeCompatibility:"unverified",
  ...observations,runtimeProbe:"not-run",runtimeReady:false,reason});
 return Object.freeze({verification,candidate:null});
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function canonicalBin(value:unknown):string|undefined {
 if(typeof value!=="string"||value!==value.trim()||!value)return undefined;
 const relative=value.startsWith("./")?value.slice(2):value;
 if(path.isAbsolute(relative)||relative.includes("\\")||relative.includes(":"))return undefined;
 if(relative.split("/").some(part=>!part||part==="."||part===".."))return undefined;
 return relative;
}
function canonicalVersion(value:string):number[]|undefined {
 if(!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value))return undefined;
 const parts=value.split(".").map(Number);
 return parts.every(Number.isSafeInteger)?parts:undefined;
}
function nodeCompatibility(engine:string):ManagedVersionVerification["nodeCompatibility"] {
 if(!engine.startsWith(">="))return "unverified";
 const minimum=canonicalVersion(engine.slice(2)),current=canonicalVersion(process.versions.node);
 if(!minimum||!current)return "unverified";
 for(const [index,found] of current.entries()){
  const wanted=minimum[index];
  if(wanted===undefined)return "unverified";
  if(found<wanted)return "incompatible";
  if(found>wanted)return "compatible";
 }
 return "compatible";
}

/** Read-only metadata target, never execution consent, publisher trust, or runtime proof. */
export async function resolveManagedCliCandidate(input:Readonly<{prefix:string;version:string}>):Promise<ManagedCliCandidateResolution>{
 const inventory=await inspectManagedInstall({prefix:input.prefix});
 const owned=inventory.status==="owned"?inventory.versions.find(item=>item.version===input.version):undefined;
 if(!owned)return report(input.version,"Requested managed version is not owned or failed integrity validation");
 const integrity={integrity:"verified"} as const;
 const packageFile=owned.files.find(file=>file.path==="package.json");
 if(!packageFile)return report(input.version,"Managed package.json is not listed",integrity);
 const versionRoot=path.join(inventory.managedRoot,"versions",owned.version);
 let bytes:Buffer;
 try{bytes=await readFile(path.join(versionRoot,"package.json"));}
 catch(error){
  if(["ENOENT","ENOTDIR","EISDIR"].includes((error as NodeJS.ErrnoException).code??"")){
   return report(input.version,"Managed version changed during verification");
  }
  throw error;
 }
 if(bytes.length!==packageFile.size||createHash("sha256").update(bytes).digest("hex")!==packageFile.sha256){
  return report(input.version,"Managed version changed during verification");
 }
 let metadata:unknown;
 try{metadata=JSON.parse(bytes.toString("utf8"));}
 catch(error){if(error instanceof SyntaxError)return report(input.version,"Managed package metadata is invalid",integrity);throw error;}
 if(!record(metadata)||metadata.name!=="asen"||metadata.version!==owned.version
  ||!record(metadata.engines)||typeof metadata.engines.node!=="string"){
  return report(input.version,"Managed package metadata is invalid",integrity);
 }
 const bin=record(metadata.bin)?canonicalBin(metadata.bin.asen):undefined;
 if(!bin||!owned.files.some(file=>file.path===bin)){
  return report(input.version,"Managed bin.asen must identify a listed canonical file",integrity);
 }
 const compatibility=nodeCompatibility(metadata.engines.node);
 const observations={...integrity,packageMetadata:"verified",nodeCompatibility:compatibility} as const;
 const after=await inspectManagedInstall({prefix:input.prefix});
 if(after.status!=="owned"||after.managedRoot!==inventory.managedRoot||JSON.stringify(after.versions)!==JSON.stringify(inventory.versions)){
  return report(input.version,"Managed version changed during verification");
 }
 if(compatibility==="unverified")return report(input.version,"Managed Node engine range is unsupported",observations);
 if(compatibility==="incompatible")return report(input.version,"Current Node version does not satisfy managed package engine",observations);
 const verified=report(input.version,null,observations);
 return Object.freeze({verification:verified.verification,candidate:Object.freeze({
  managedRoot:inventory.managedRoot,versionRoot,bin,
  files:Object.freeze(owned.files.map(file=>Object.freeze({...file}))),
 })});
}

/** Preserve the metadata-only public report; no process is launched. */
export async function verifyManagedVersion(input:Readonly<{prefix:string;version:string}>):Promise<ManagedVersionVerification>{
 return (await resolveManagedCliCandidate(input)).verification;
}
