import {lstat,readFile} from "node:fs/promises";
import path from "node:path";
import {inspectManagedInstall,type ManagedInstallInspection} from "./managed-install.js";
import {verifyManagedVersion,type ManagedVersionVerification} from "./managed-version-verification.js";
import {asenLauncherConfigPath,parseAsenLauncherConfig,resolveAsenHome,resolvePiRuntime,type ParsedAsenArgs} from "./launcher.js";

export type InstallationDoctorIssueCode=
 |"CONFIG_UNREADABLE"
 |"MANAGED_INSPECTION_UNAVAILABLE"
 |"MANAGED_VERSION_VERIFICATION_UNAVAILABLE"
 |"MANAGED_STATE_CHANGED"
 |"MAINTENANCE_OBSERVATION_UNAVAILABLE"
 |"PI_OBSERVATION_UNAVAILABLE"
 |"COLLECTION_HOOK_FAILED";

export interface InstallationDoctorHooks {
 /** Test-only observation seam. The doctor never supplies or derives this hook from CLI input or environment. */
 readonly beforeFinalInspection?:()=>Promise<void>;
}

export interface InstallationDoctorRequest {
 readonly executingPackageRoot:string;
 readonly effectivePackageRoot:string;
 readonly homeDirectory:string;
 readonly args:ParsedAsenArgs;
 readonly env:Record<string,string|undefined>;
 readonly hooks?:InstallationDoctorHooks;
}

type ConfigObservation=Readonly<{
 path:string;
 status:"absent"|"valid"|"invalid"|"unreadable";
 resolvedHome:ReturnType<typeof resolveAsenHome>|null;
}>;
type PiObservation=Readonly<{
 kind:"env"|"bundled"|"configured-path"|"unavailable"|"unknown";
 confidence:"configured-only";
}>;
type MaintenanceObservation=Readonly<{
 status:"missing"|"present"|"unknown";
 observedType:"file"|"directory"|"link"|"other"|null;
 confidence:"presence-only";
}>;
type ManagedSelection=Readonly<{
 status:"current"|"current-absent"|"not-inspected";
 version:string|null;
}>;
type VersionObservation=Readonly<{version:string;verification:ManagedVersionVerification|null}>;

export interface InstallationDoctorReport {
 readonly schema:"asen.installation-doctor/v1";
 readonly collection:Readonly<{
  status:"complete"|"incomplete";
  confidence:"metadata-only";
  atomic:false;
  issueCodes:readonly InstallationDoctorIssueCode[];
 }>;
 readonly packageRoots:Readonly<{executing:string;effective:string}>;
 readonly managed:Readonly<{
  prefix:string;
  inspection:ManagedInstallInspection|null;
  selection:ManagedSelection;
  versions:readonly VersionObservation[];
 }>;
 readonly config:ConfigObservation;
 readonly pi:PiObservation;
 readonly maintenance:MaintenanceObservation;
 readonly runtimeProbe:"not-run";
 readonly runtimeReady:false;
 readonly publisherAuthenticity:"unknown";
 readonly nativeAuthority:"unknown";
 readonly processHealth:"unknown";
}

const safePath=(value:string)=>path.resolve(value);
const errorCode=(error:unknown)=>(error as NodeJS.ErrnoException).code;

async function observeConfig(homeDirectory:string,args:ParsedAsenArgs,env:Record<string,string|undefined>,issues:InstallationDoctorIssueCode[]):Promise<ConfigObservation>{
 const configPath=asenLauncherConfigPath(homeDirectory);
 let bytes:string;
 try{bytes=await readFile(configPath,"utf8");}
 catch(error){
  if(errorCode(error)==="ENOENT")return {path:configPath,status:"absent",resolvedHome:resolveAsenHome({args,env,homedir:homeDirectory})};
  issues.push("CONFIG_UNREADABLE");return {path:configPath,status:"unreadable",resolvedHome:null};
 }
 const config=parseAsenLauncherConfig(bytes);
 if(!config)return {path:configPath,status:"invalid",resolvedHome:resolveAsenHome({args,env,homedir:homeDirectory})};
 return {path:configPath,status:"valid",resolvedHome:resolveAsenHome({args,env,homedir:homeDirectory,config})};
}

async function bundledCandidate(packageRoot:string):Promise<"present"|"absent"|"unknown">{
 const candidate=path.join(packageRoot,"node_modules","@earendil-works","pi-coding-agent","dist","cli.js");
 try{const metadata=await lstat(candidate);return metadata.isFile()?"present":"absent";}
 catch(error){return errorCode(error)==="ENOENT"||errorCode(error)==="ENOTDIR"?"absent":"unknown";}
}

async function observePi(packageRoot:string,env:Record<string,string|undefined>,issues:InstallationDoctorIssueCode[]):Promise<PiObservation>{
 if(env.ASEN_PI)return {kind:"env",confidence:"configured-only"};
 const bundled=await bundledCandidate(packageRoot);
 if(bundled==="unknown"){issues.push("PI_OBSERVATION_UNAVAILABLE");return {kind:"unknown",confidence:"configured-only"};}
 const runtime=resolvePiRuntime({env,...(bundled==="present"?{bundled:"configured"}:{}),...(env.ASEN_PI_ON_PATH?{onPath:"configured"}:{}),nodeExecPath:process.execPath});
 return {kind:runtime?.kind==="path"?"configured-path":runtime?.kind??"unavailable",confidence:"configured-only"};
}

function selectionFor(inspection:ManagedInstallInspection|null):ManagedSelection{
 if(inspection?.status!=="owned")return {status:"not-inspected",version:null};
 return inspection.activeVersion===null?{status:"current-absent",version:null}:{status:"current",version:inspection.activeVersion};
}

async function observeMaintenance(inspection:ManagedInstallInspection|null,stable:boolean,issues:InstallationDoctorIssueCode[]):Promise<MaintenanceObservation>{
 const confidence="presence-only" as const,unknown=():MaintenanceObservation=>({status:"unknown",observedType:null,confidence});
 if(!stable||inspection?.status==="foreign")return unknown();
 if(inspection?.status==="absent")return {status:"missing",observedType:null,confidence};
 if(!inspection)return unknown();
 const marker=path.join(inspection.managedRoot,".asen-maintenance.lock");
 try{
  const rootBefore=await lstat(inspection.managedRoot);
  if(!rootBefore.isDirectory()||rootBefore.isSymbolicLink()){
   issues.push("MANAGED_STATE_CHANGED");return unknown();
  }
  let metadata:Awaited<ReturnType<typeof lstat>>|undefined;
  try{metadata=await lstat(marker);}
  catch(error){if(errorCode(error)!=="ENOENT"&&errorCode(error)!=="ENOTDIR")throw error;}
  const rootAfter=await lstat(inspection.managedRoot),sameRoot=rootAfter.isDirectory()&&!rootAfter.isSymbolicLink()&&rootAfter.dev===rootBefore.dev&&rootAfter.ino===rootBefore.ino;
  if(!sameRoot){issues.push("MANAGED_STATE_CHANGED");return unknown();}
  if(!metadata)return {status:"missing",observedType:null,confidence};
  const observedType=metadata.isSymbolicLink()?"link":metadata.isFile()?"file":metadata.isDirectory()?"directory":"other";
  return {status:"present",observedType,confidence};
 }catch(error){
  if(errorCode(error)==="ENOENT"||errorCode(error)==="ENOTDIR"){issues.push("MANAGED_STATE_CHANGED");return unknown();}
  issues.push("MAINTENANCE_OBSERVATION_UNAVAILABLE");return unknown();
 }
}

async function inspect(prefix:string,issues:InstallationDoctorIssueCode[]):Promise<ManagedInstallInspection|null>{
 try{return await inspectManagedInstall({prefix});}
 catch{issues.push("MANAGED_INSPECTION_UNAVAILABLE");return null;}
}

function sameInspection(left:ManagedInstallInspection|null,right:ManagedInstallInspection|null):boolean{
 return JSON.stringify(left)===JSON.stringify(right);
}

/** Compose bounded read-only installation metadata. This is neither a health check nor runtime readiness proof. */
export async function composeInstallationDoctor(request:InstallationDoctorRequest):Promise<InstallationDoctorReport>{
 const issues:InstallationDoctorIssueCode[]=[],homeDirectory=safePath(request.homeDirectory),prefix=path.join(homeDirectory,".asen");
 const executing=safePath(request.executingPackageRoot),effective=safePath(request.effectivePackageRoot);
 const initial=await inspect(prefix,issues),versions:VersionObservation[]=[];
 if(initial?.status==="owned")for(const item of initial.versions){
  try{versions.push({version:item.version,verification:await verifyManagedVersion({prefix,version:item.version})});}
  catch{issues.push("MANAGED_VERSION_VERIFICATION_UNAVAILABLE");versions.push({version:item.version,verification:null});}
 }
 const config=await observeConfig(homeDirectory,request.args,request.env,issues);
 const pi=await observePi(effective,request.env,issues);
 try{await request.hooks?.beforeFinalInspection?.();}catch{issues.push("COLLECTION_HOOK_FAILED");}
 const final=await inspect(prefix,issues),stable=sameInspection(initial,final);
 if(!stable)issues.push("MANAGED_STATE_CHANGED");
 const maintenance=await observeMaintenance(initial,stable,issues);
 return Object.freeze({
  schema:"asen.installation-doctor/v1",
  collection:Object.freeze({status:issues.length?"incomplete":"complete",confidence:"metadata-only",atomic:false,issueCodes:Object.freeze([...new Set(issues)])}),
  packageRoots:Object.freeze({executing,effective}),
  managed:Object.freeze({prefix,inspection:initial,selection:Object.freeze(selectionFor(initial)),versions:Object.freeze(versions.map(item=>Object.freeze(item)))}),
  config:Object.freeze(config),pi:Object.freeze(pi),maintenance:Object.freeze(maintenance),
  runtimeProbe:"not-run",runtimeReady:false,publisherAuthenticity:"unknown",nativeAuthority:"unknown",processHealth:"unknown",
 });
}
