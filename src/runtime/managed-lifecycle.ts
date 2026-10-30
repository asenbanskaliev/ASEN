import {randomUUID} from "node:crypto";
import {access,constants,lstat,mkdir,open,readFile,rmdir,unlink,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {
 inspectManagedInstall,readManagedOwnershipRecords,selectManagedVersion,stageAdditionalManagedVersion,stageManagedInstall,
 ManagedAdditionalStageError,ManagedVersionSelectionError,type ManagedInstallFile,type ManagedVersionInventory,
} from "./managed-install.js";
import {probeManagedCliVersion} from "./managed-cli-version-probe.js";
import {withManagedMaintenanceLock} from "./managed-maintenance-lock.js";
import {verifyManagedAcquisitionPackage} from "./managed-acquisition-verification.js";
import {fetchManagedAcquisition} from "./managed-fetch.js";
import {readManagedTrustAnchor,verifyManagedManifestSignature,type ManagedManifestAuthenticity} from "./managed-trust.js";
import {readBoundedOrdinaryFile} from "../io/bounded-file.js";
import type {ManagedAcquisitionManifest} from "./managed-install.js";
import type {AsenLauncherConfig} from "./launcher.js";

export const MANAGED_MIN_NODE="22.19.0";
export const MANAGED_JOURNAL_NAME="managed-update-journal.json";
const JOURNAL_SCHEMA="asen.managed-update-journal/v1";

export type ManagedLifecycleErrorCode="CONFIRMATION_REQUIRED"|"PREREQUISITES_FAILED"|"FOREIGN_ROOT"|"UPGRADE_REQUIRED"|"NOT_INSTALLED"|"DOWNGRADE_REFUSED"|"RECOVERY_REQUIRED"|"ACQUISITION_FAILED"|"STAGED_BYTES_MISMATCH"|"INVALID_REQUEST";
export class ManagedLifecycleError extends Error{
 constructor(readonly code:ManagedLifecycleErrorCode,message:string,readonly report?:unknown,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name="ManagedLifecycleError";}
}
const fail=(code:ManagedLifecycleErrorCode,message:string,report?:unknown,cause?:unknown):never=>{throw new ManagedLifecycleError(code,message,report,cause===undefined?undefined:{cause});};
const text=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,1024);

export type ManagedAcquisitionSource=
 |Readonly<{kind:"local";manifestPath:string;signaturePath:string;packageRoot:string}>
 |Readonly<{kind:"https";baseUrl:string;fetchImpl?:typeof fetch}>;

/** Test seams for deterministic interruption; production callers omit them. */
export interface ManagedLifecycleHooks{
 readonly afterStage?:()=>Promise<void>;
 readonly beforeActivation?:()=>Promise<void>;
 readonly afterActivation?:()=>Promise<void>;
}
interface CommonRequest{
 readonly prefix:string;
 readonly confirmed:boolean;
 readonly hooks?:ManagedLifecycleHooks;
}
export interface PrerequisiteCheck{readonly id:string;readonly status:"pass"|"fail";readonly detail:string}
export interface ManagedPrerequisiteReport{readonly ok:boolean;readonly checks:readonly PrerequisiteCheck[]}

const versionParts=(value:string)=>value.split(".").map(Number);
function compareVersions(left:string,right:string):number{
 const a=versionParts(left),b=versionParts(right);
 for(let index=0;index<3;index++){const delta=(a[index]??0)-(b[index]??0);if(delta)return delta;}
 return 0;
}

// Root-owned macOS aliases that every temporary and user path legitimately crosses.
const MACOS_SYSTEM_LINKS=new Set(["/tmp","/var","/etc"]);

export async function checkManagedPrerequisites(input:Readonly<{prefix:string;nodeVersion?:string;platform?:NodeJS.Platform}>):Promise<ManagedPrerequisiteReport>{
 const checks:PrerequisiteCheck[]=[],node=input.nodeVersion??process.versions.node,platform=input.platform??process.platform;
 checks.push({id:"node-version",status:compareVersions(node,MANAGED_MIN_NODE)>=0?"pass":"fail",detail:`Node ${node}; requires >=${MANAGED_MIN_NODE}`});
 checks.push({id:"platform",status:["linux","darwin","win32"].includes(platform)?"pass":"fail",detail:`Platform ${platform}`});
 if(!path.isAbsolute(input.prefix))checks.push({id:"prefix",status:"fail",detail:"Installation prefix must be absolute"});
 else{
  let ancestor=path.resolve(input.prefix),detail="";let status:"pass"|"fail"="pass";
  for(;;){
   try{
    const info=await lstat(ancestor);
    if(info.isSymbolicLink()&&!(platform==="darwin"&&MACOS_SYSTEM_LINKS.has(ancestor))){status="fail";detail=`Installation path crosses a symbolic link: ${ancestor}`;}
    else if(!info.isDirectory()&&!info.isSymbolicLink()){status="fail";detail="Installation prefix ancestor is not a directory";}
    else{
     try{await access(ancestor,constants.W_OK);detail=`Writable ancestor ${ancestor}`;}
     catch{status="fail";detail=`No write permission for ${ancestor}`;}
    }
    break;
   }catch(error){
    if((error as NodeJS.ErrnoException).code!=="ENOENT"){status="fail";detail=text(error);break;}
    const parent=path.dirname(ancestor);if(parent===ancestor){status="fail";detail="No existing ancestor";break;}ancestor=parent;
   }
  }
  for(let parent=path.dirname(ancestor);status==="pass"&&parent!==path.dirname(parent);parent=path.dirname(parent)){
   const info=await lstat(parent).catch(()=>undefined);
   if(info?.isSymbolicLink()&&!(platform==="darwin"&&MACOS_SYSTEM_LINKS.has(parent))){status="fail";detail=`Installation path crosses a symbolic link: ${parent}`;}
  }
  checks.push({id:"prefix-writable",status,detail});
 }
 return Object.freeze({ok:checks.every(check=>check.status==="pass"),checks:Object.freeze(checks)});
}

interface Acquired{
 readonly manifest:ManagedAcquisitionManifest;
 readonly packageRoot:string;
 readonly authenticity:Pick<ManagedManifestAuthenticity,"keyId">;
 cleanup():Promise<void>;
}
async function acquire(source:ManagedAcquisitionSource,trustedKeyPath:string,prefix:string):Promise<Acquired>{
 if(typeof trustedKeyPath!=="string"||!path.isAbsolute(trustedKeyPath))fail("INVALID_REQUEST","A trusted key file (absolute path) is required");
 const trustedKeys=await readManagedTrustAnchor(trustedKeyPath);
 try{
  if(source.kind==="https"){
   const fetched=await fetchManagedAcquisition({baseUrl:source.baseUrl,downloadsRoot:path.join(prefix,"downloads"),trustedKeys,...source.fetchImpl?{fetchImpl:source.fetchImpl}:{}});
   try{await verifyManagedAcquisitionPackage(fetched.packageRoot,fetched.manifest);}catch(error){await fetched.cleanup();throw error;}
   return {manifest:fetched.manifest,packageRoot:fetched.packageRoot,authenticity:{keyId:fetched.keyId},cleanup:fetched.cleanup};
  }
  for(const value of [source.manifestPath,source.signaturePath,source.packageRoot])if(!path.isAbsolute(value))fail("INVALID_REQUEST","Local acquisition paths must be absolute");
  const manifestBytes=await readBoundedOrdinaryFile(source.manifestPath,1024*1024),signatureText=(await readBoundedOrdinaryFile(source.signaturePath,64*1024)).toString("utf8");
  const authentic=verifyManagedManifestSignature({manifestBytes,signatureText,trustedKeys});
  await verifyManagedAcquisitionPackage(source.packageRoot,authentic.manifest);
  return {manifest:authentic.manifest,packageRoot:path.resolve(source.packageRoot),authenticity:authentic,cleanup:async()=>{}};
 }catch(error){
  if(error instanceof ManagedLifecycleError)throw error;
  throw new ManagedLifecycleError("ACQUISITION_FAILED","Package acquisition or authentication refused: "+text(error),undefined,{cause:error});
 }
}
const fileMap=(manifest:ManagedAcquisitionManifest)=>manifest.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath}));
const sameFiles=(left:readonly ManagedInstallFile[],manifest:ManagedAcquisitionManifest)=>left.length===manifest.files.length
 &&left.every((file,index)=>{const declared=manifest.files[index]!;return file.path===declared.destinationPath&&file.size===declared.size&&file.sha256===declared.sha256;});
const inventoryMatches=(item:ManagedVersionInventory|undefined,manifest:ManagedAcquisitionManifest)=>!!item&&sameFiles(item.files,manifest);

async function probe(prefix:string,version:string):Promise<{ok:boolean;reason:string|null}>{
 const observation=await probeManagedCliVersion({prefix,version,confirmed:true});
 return {ok:observation.cliVersion==="observed",reason:observation.cliVersion==="observed"?null:`${observation.cliVersion}: ${observation.reason??observation.error??"unknown"}`};
}

// ---------------------------------------------------------------- uninstall

export interface ManagedUninstallReport{
 readonly schema:"asen.managed-uninstall-report/v1";
 readonly operation:"uninstall";
 readonly status:"removed"|"partial"|"absent";
 readonly managedRoot:string;
 readonly removedFiles:number;
 readonly retained:readonly string[];
 readonly userDataTouched:false;
}
export interface ManagedUninstallHooks{
 /** Deterministic test seam: simulate another same-user process changing a path after inspection. */
 readonly beforeOwnedFileRemoval?:(target:string)=>Promise<void>;
}
function sameUninstallIdentity(left:{dev:number;ino:number;birthtimeMs:number},right:{dev:number;ino:number;birthtimeMs:number}):boolean{
 return left.dev===right.dev&&left.ino===right.ino&&left.birthtimeMs===right.birthtimeMs;
}
async function removeOwnedFile(versionRoot:string,relative:string,file:Pick<ManagedInstallFile,"size"|"sha256">,hooks?:ManagedUninstallHooks):Promise<"removed"|"absent"|"retained">{
 const parts=relative.split("/"),directories=[versionRoot];
 for(const part of parts.slice(0,-1))directories.push(path.join(directories.at(-1)!,part));
 const observedDirs=[];
 for(const directory of directories){
  const info=await lstat(directory).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
  if(!info)return "retained";
  if(!info.isDirectory()||info.isSymbolicLink())return "retained";
  observedDirs.push(info);
 }
 const target=path.join(directories.at(-1)!,parts.at(-1)!);
 const before=await lstat(target).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
 if(!before)return "absent";
 if(!before.isFile()||before.isSymbolicLink()||before.size!==file.size)return "retained";
 let handle;
 try{handle=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));}
 catch(error){if(["ENOENT","ELOOP","EPERM"].includes((error as NodeJS.ErrnoException).code??""))return "retained";throw error;}
 try{
  const held=await handle.stat();
  if(!held.isFile()||!sameUninstallIdentity(before,held))return "retained";
  const bytes=await handle.readFile();
  if(bytes.length!==file.size||createHash("sha256").update(bytes).digest("hex")!==file.sha256)return "retained";
  await hooks?.beforeOwnedFileRemoval?.(target);
  // An ordinary maintenance lock does not exclude hostile same-user path changes.
  // Recheck the complete path chain, object identity and bytes immediately before unlink.
  for(let i=0;i<directories.length;i++){
   const current=await lstat(directories[i]!).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
   if(!current||!current.isDirectory()||current.isSymbolicLink()||!sameUninstallIdentity(observedDirs[i]!,current))return "retained";
  }
  const after=await lstat(target).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
  const heldAfter=await handle.stat();
  if(!after||!after.isFile()||after.isSymbolicLink()||!sameUninstallIdentity(before,after)||!sameUninstallIdentity(held,heldAfter)||after.mtimeMs!==before.mtimeMs||after.size!==before.size)return "retained";
  const currentBytes=await readFile(target);
  if(currentBytes.length!==file.size||createHash("sha256").update(currentBytes).digest("hex")!==file.sha256)return "retained";
  const finalStat=await lstat(target).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
  if(!finalStat||!finalStat.isFile()||finalStat.isSymbolicLink()||!sameUninstallIdentity(before,finalStat))return "retained";
  await unlink(target);return "removed";
 }finally{await handle.close();}
}
async function rmdirIfEmpty(directory:string,retained:string[]):Promise<void>{
 try{
  const info=await lstat(directory);
  if(info.isSymbolicLink()||!info.isDirectory()){retained.push(directory);return;}
  await rmdir(directory);
 }catch(error){
  const code=(error as NodeJS.ErrnoException).code;
  if(code==="ENOENT")return;
  if(code==="ENOTEMPTY"||code==="EEXIST"){retained.push(directory);return;}
  throw error;
 }
}

/**
 * Removes only ASEN-owned managed software: files listed in the ownership receipt/catalog whose bytes still
 * match, the selector, and receipts. User data, launcher config, sessions and Pi installations are never touched.
 */
export async function uninstallManaged(request:Readonly<{prefix:string;confirmed:boolean;hooks?:ManagedUninstallHooks}>):Promise<ManagedUninstallReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed uninstall requires explicit confirmation");
 if(!path.isAbsolute(request.prefix))fail("INVALID_REQUEST","Installation prefix must be absolute");
 const prefix=path.resolve(request.prefix),managedRoot=path.join(prefix,"install");
 const rootInfo=await lstat(managedRoot).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;});
 if(!rootInfo)return Object.freeze({schema:"asen.managed-uninstall-report/v1",operation:"uninstall",status:"absent",managedRoot,removedFiles:0,retained:Object.freeze([]),userDataTouched:false});
 if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())return fail("FOREIGN_ROOT","Managed root is not an ordinary directory; nothing was removed");
 const records=await readManagedOwnershipRecords(managedRoot);
 if(!records)return fail("FOREIGN_ROOT","Managed root has no valid ASEN ownership record; nothing was removed");
 const retained:string[]=[];let removedFiles=0;
 const body=async()=>{
  const records=await readManagedOwnershipRecords(managedRoot);
  if(!records)return fail("FOREIGN_ROOT","Managed ownership records changed before uninstall; nothing further was removed");
  for(const version of records.versions){
   const versionRoot=path.join(managedRoot,"versions",version.version),info=await lstat(versionRoot).catch(()=>undefined);
   if(!info)continue;
   if(info.isSymbolicLink()||!info.isDirectory()){retained.push(versionRoot);continue;}
   for(const file of version.files){
    const outcome=await removeOwnedFile(versionRoot,file.path,file,request.hooks);
    if(outcome==="removed")removedFiles++;
    else if(outcome==="retained")retained.push(path.join(versionRoot,...file.path.split("/")));
   }
   const directories=new Set<string>();
   for(const file of version.files){let dir=path.posix.dirname(file.path);while(dir!=="."){directories.add(dir);dir=path.posix.dirname(dir);}}
   for(const dir of [...directories].sort((a,b)=>b.length-a.length))await rmdirIfEmpty(path.join(versionRoot,...dir.split("/")),retained);
   await rmdirIfEmpty(versionRoot,retained);
  }
  await rmdirIfEmpty(path.join(managedRoot,"versions"),retained);
  const selector=path.join(managedRoot,"current"),selectorBytes=await readFile(selector).catch(()=>undefined);
  if(selectorBytes&&records.versions.some(item=>selectorBytes.equals(Buffer.from(item.version+"\n"))))await unlink(selector);
  else if(selectorBytes)retained.push(selector);
  await rmdirIfEmpty(path.join(managedRoot,"staging"),retained);
  // Ownership records are the only proof needed to resume, so they stay while anything remains.
  if(retained.length===0)for(const name of ["managed-versions.json","managed-install.json"])await unlink(path.join(managedRoot,name)).catch(error=>{if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;});
  if(retained.length===0)await clearJournal(prefix);
 };
 await withManagedMaintenanceLock({prefix,confirmed:true,allowPartialInventory:true},body);
 await rmdirIfEmpty(managedRoot,retained);
 const unique=[...new Set(retained)];
 return Object.freeze({schema:"asen.managed-uninstall-report/v1",operation:"uninstall",status:unique.length?"partial":"removed",managedRoot,removedFiles,retained:Object.freeze(unique),userDataTouched:false});
}

// ------------------------------------------------------------------ install

export interface ManagedInstallOperationRequest extends CommonRequest{
 readonly source:ManagedAcquisitionSource;
 readonly trustedKeyPath:string;
 readonly protectedPaths:readonly string[];
 readonly dataHome?:string;
 readonly launcherConfig?:AsenLauncherConfig;
}
export interface ManagedLifecycleReport{
 readonly schema:"asen.managed-lifecycle-report/v1";
 readonly operation:"install"|"upgrade"|"rollback";
 readonly status:"installed"|"unchanged"|"upgraded"|"rolled-back"|"not-activated"|"ambiguous";
 readonly version:string;
 readonly previousVersion:string|null;
 readonly activeVersion:string|null;
 readonly signerKeyId:string|null;
 readonly reason:string|null;
 readonly prerequisites?:ManagedPrerequisiteReport;
 readonly dataPreserved:true;
}
const report=(value:Omit<ManagedLifecycleReport,"schema"|"dataPreserved">):ManagedLifecycleReport=>Object.freeze({schema:"asen.managed-lifecycle-report/v1",...value,dataPreserved:true});

async function initializeDirectories(request:ManagedInstallOperationRequest):Promise<string[]>{
 const created:string[]=[];
 const ensure=async(directory:string)=>{
  const existed=await lstat(directory).then(()=>true,()=>false);
  await mkdir(directory,{recursive:true,mode:0o700});
  if(!existed)created.push(directory);
 };
 await ensure(request.prefix);
 if(request.dataHome)await ensure(request.dataHome);
 if(request.launcherConfig){
  const config=path.join(request.prefix,"config.json");
  try{await writeFile(config,JSON.stringify({home:request.launcherConfig.mode==="path"?request.launcherConfig.dir:request.launcherConfig.mode},null,2)+"\n",{flag:"wx",mode:0o600});created.push(config);}
  catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
 }
 return created;
}
async function undoInitialization(created:readonly string[]):Promise<void>{
 for(const target of [...created].reverse()){
  const info=await lstat(target).catch(()=>undefined);
  if(!info)continue;
  if(info.isFile())await unlink(target).catch(()=>undefined);
  else await rmdir(target).catch(()=>undefined);
 }
}

/** Clean install: authenticate, stage, probe, then select. A fresh failed install is removed again. */
export async function installManaged(request:ManagedInstallOperationRequest):Promise<ManagedLifecycleReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed install requires explicit confirmation");
 const prerequisites=await checkManagedPrerequisites({prefix:request.prefix});
 if(!prerequisites.ok)return fail("PREREQUISITES_FAILED","Installation prerequisites failed",prerequisites);
 const prefix=path.resolve(request.prefix),acquired=await acquire(request.source,request.trustedKeyPath,prefix);
 try{
  const {manifest}=acquired,signerKeyId=acquired.authenticity.keyId,inspection=await inspectManagedInstall({prefix});
  if(inspection.status==="foreign")return fail("FOREIGN_ROOT","Refusing to install over a foreign managed root");
  if(inspection.status==="owned"){
   const retained=inspection.versions.find(item=>item.version===manifest.version);
   if(inspection.activeVersion===manifest.version&&inventoryMatches(retained,manifest)){
    const health=await probe(prefix,manifest.version);
    return report({operation:"install",status:health.ok?"unchanged":"ambiguous",version:manifest.version,previousVersion:manifest.version,activeVersion:inspection.activeVersion,signerKeyId,reason:health.reason,prerequisites});
   }
   return fail("UPGRADE_REQUIRED","An ASEN installation already exists; use managed upgrade");
  }
  const created=await initializeDirectories(request);
  try{
   const staged=await stageManagedInstall({prefix,packageRoot:acquired.packageRoot,version:manifest.version,files:fileMap(manifest),protectedPaths:request.protectedPaths,confirmed:true});
   if(!sameFiles(staged.files,manifest))return fail("STAGED_BYTES_MISMATCH","Staged bytes differ from the authenticated manifest");
   await request.hooks?.afterStage?.();
   const health=await probe(prefix,manifest.version);
   if(!health.ok)return fail("ACQUISITION_FAILED",`Installed candidate failed its version probe (${health.reason})`);
   await request.hooks?.beforeActivation?.();
   await selectManagedVersion({prefix,version:manifest.version,expectedCurrentVersion:null,confirmed:true});
   const after=await inspectManagedInstall({prefix});
   if(after.status!=="owned"||after.activeVersion!==manifest.version)return fail("STAGED_BYTES_MISMATCH","Selection could not be read back");
   return report({operation:"install",status:"installed",version:manifest.version,previousVersion:null,activeVersion:manifest.version,signerKeyId,reason:null,prerequisites});
  }catch(error){
   // Partial first install: remove only what this run created and what ownership records verify.
   let cleanup="";
   try{
    const removal=await uninstallManaged({prefix,confirmed:true});
    if(removal.status==="partial")cleanup=` (retained for inspection: ${removal.retained.join(", ")})`;
    await undoInitialization(created);
   }catch(cleanupError){cleanup=` (cleanup uncertain: ${text(cleanupError)})`;}
   if(error instanceof ManagedLifecycleError)throw new ManagedLifecycleError(error.code,error.message+cleanup,error.report,{cause:error});
   throw new ManagedLifecycleError("ACQUISITION_FAILED","Installation failed and was rolled back: "+text(error)+cleanup,undefined,{cause:error});
  }
 }finally{await acquired.cleanup();}
}

// ------------------------------------------------------------------ upgrade

interface Journal{schema:typeof JOURNAL_SCHEMA;from:string;to:string;startedAt:string}
const journalPath=(prefix:string)=>path.join(prefix,MANAGED_JOURNAL_NAME);
async function readJournal(prefix:string):Promise<Journal|undefined>{
 try{
  const value=JSON.parse((await readBoundedOrdinaryFile(journalPath(prefix),4096)).toString("utf8")) as Journal;
  if(value.schema!==JOURNAL_SCHEMA||typeof value.from!=="string"||typeof value.to!=="string")throw new Error("Update journal is malformed");
  return value;
 }catch(error){
  if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;
  throw new ManagedLifecycleError("RECOVERY_REQUIRED","Update journal is unreadable; inspect it before retrying",undefined,{cause:error});
 }
}
async function writeJournal(prefix:string,journal:Journal):Promise<void>{
 const handle=await open(journalPath(prefix),"wx",0o600);
 try{await handle.writeFile(JSON.stringify(journal)+"\n");await handle.sync();}finally{await handle.close();}
}
const clearJournal=(prefix:string)=>unlink(journalPath(prefix)).catch(error=>{if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;});

export interface ManagedUpgradeRequest extends CommonRequest{
 readonly source:ManagedAcquisitionSource;
 readonly trustedKeyPath:string;
 readonly protectedPaths:readonly string[];
 readonly allowDowngrade?:boolean;
}
async function selectOrReconcile(prefix:string,to:string,from:string):Promise<{ok:boolean;reason:string|null}>{
 try{await selectManagedVersion({prefix,version:to,expectedCurrentVersion:from,confirmed:true});return {ok:true,reason:null};}
 catch(error){
  const inspection=await inspectManagedInstall({prefix}).catch(()=>undefined);
  const active=inspection?.status==="owned"?inspection.activeVersion:undefined;
  if(error instanceof ManagedVersionSelectionError&&active===from&&error.report.publication==="not-started")return {ok:false,reason:text(error)};
  if(active===to)return {ok:true,reason:null};
  return {ok:false,reason:text(error)};
 }
}

/** Upgrade: stage beside the active version, probe, activate by compare-and-set, re-probe, roll back on failure. */
export async function upgradeManaged(request:ManagedUpgradeRequest):Promise<ManagedLifecycleReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed upgrade requires explicit confirmation");
 if(!path.isAbsolute(request.prefix))fail("INVALID_REQUEST","Installation prefix must be absolute");
 const prefix=path.resolve(request.prefix);
 if(await readJournal(prefix))fail("RECOVERY_REQUIRED","An interrupted upgrade left a journal; run managed rollback first");
 const inspection=await inspectManagedInstall({prefix});
 if(inspection.status!=="owned")return fail(inspection.status==="absent"?"NOT_INSTALLED":"FOREIGN_ROOT","No owned ASEN installation to upgrade");
 const from=inspection.activeVersion;
 if(!from)return fail("NOT_INSTALLED","The installation has no active version; use managed install");
 const acquired=await acquire(request.source,request.trustedKeyPath,prefix);
 try{
  const {manifest}=acquired,to=manifest.version,signerKeyId=acquired.authenticity.keyId;
  if(to===from){
   const health=await probe(prefix,to);
   return report({operation:"upgrade",status:health.ok?"unchanged":"ambiguous",version:to,previousVersion:from,activeVersion:from,signerKeyId,reason:health.reason});
  }
  if(compareVersions(to,from)<0&&request.allowDowngrade!==true)return fail("DOWNGRADE_REFUSED",`Refusing to replace ${from} with older ${to}`);
  const notActivated=(reason:string)=>report({operation:"upgrade",status:"not-activated",version:to,previousVersion:from,activeVersion:from,signerKeyId,reason});
  try{
   await stageAdditionalManagedVersion({prefix,packageRoot:acquired.packageRoot,version:to,files:fileMap(manifest),protectedPaths:request.protectedPaths,confirmed:true,expectedAcquisition:manifest});
  }catch(error){return notActivated("Staging failed: "+text(error instanceof ManagedAdditionalStageError?error:error));}
  await request.hooks?.afterStage?.();
  const pre=await probe(prefix,to);
  if(!pre.ok)return notActivated(`Candidate failed its pre-activation probe (${pre.reason})`);
  await request.hooks?.beforeActivation?.();
  await writeJournal(prefix,{schema:JOURNAL_SCHEMA,from,to,startedAt:new Date().toISOString()});
  const selected=await selectOrReconcile(prefix,to,from);
  if(!selected.ok){await clearJournal(prefix);return notActivated(`Activation refused: ${selected.reason}`);}
  let postReason:string|null=null;
  try{
   await request.hooks?.afterActivation?.();
   const post=await probe(prefix,to),current=await inspectManagedInstall({prefix});
   if(!post.ok)postReason=`Post-activation probe failed (${post.reason})`;
   else if(current.status!=="owned"||current.activeVersion!==to)postReason="Active version could not be read back";
  }catch(error){postReason=`Post-activation check interrupted: ${text(error)}`;}
  if(!postReason){await clearJournal(prefix);return report({operation:"upgrade",status:"upgraded",version:to,previousVersion:from,activeVersion:to,signerKeyId,reason:null});}
  try{
   await selectManagedVersion({prefix,version:from,expectedCurrentVersion:to,confirmed:true});
   const restored=await probe(prefix,from);
   await clearJournal(prefix);
   return report({operation:"upgrade",status:"rolled-back",version:to,previousVersion:from,activeVersion:from,signerKeyId,reason:postReason+(restored.ok?"":`; previous version probe: ${restored.reason}`)});
  }catch(error){
   return report({operation:"upgrade",status:"ambiguous",version:to,previousVersion:from,activeVersion:to,signerKeyId,reason:`${postReason}; automatic rollback failed: ${text(error)}; journal retained`});
  }
 }finally{await acquired.cleanup();}
}

export interface ManagedRollbackRequest extends CommonRequest{
 readonly expectedCurrentVersion:string;
 readonly toVersion?:string;
}
/** Version rollback (not data restore). Without --to it recovers from an interrupted upgrade journal. */
export async function rollbackManaged(request:ManagedRollbackRequest):Promise<ManagedLifecycleReport>{
 if(request.confirmed!==true)fail("CONFIRMATION_REQUIRED","Managed rollback requires explicit confirmation");
 if(!path.isAbsolute(request.prefix))fail("INVALID_REQUEST","Installation prefix must be absolute");
 const prefix=path.resolve(request.prefix),journal=await readJournal(prefix);
 const inspection=await inspectManagedInstall({prefix});
 if(inspection.status!=="owned")return fail(inspection.status==="absent"?"NOT_INSTALLED":"FOREIGN_ROOT","No owned ASEN installation to roll back");
 const current=inspection.activeVersion;
 const target=request.toVersion??journal?.from;
 if(!target)return fail("INVALID_REQUEST","Rollback needs --to or an interrupted upgrade journal");
 if(current!==request.expectedCurrentVersion)return fail("INVALID_REQUEST",`Active version is ${current??"none"}, not ${request.expectedCurrentVersion}`);
 if(current===target){
  if(journal)await clearJournal(prefix);
  return report({operation:"rollback",status:"unchanged",version:target,previousVersion:current,activeVersion:current,signerKeyId:null,reason:null});
 }
 if(!inspection.versions.some(item=>item.version===target))return fail("INVALID_REQUEST",`Version ${target} is not retained`);
 await selectManagedVersion({prefix,version:target,expectedCurrentVersion:current,confirmed:true});
 const health=await probe(prefix,target);
 if(journal)await clearJournal(prefix);
 return report({operation:"rollback",status:health.ok?"rolled-back":"ambiguous",version:target,previousVersion:current,activeVersion:target,signerKeyId:null,reason:health.reason});
}
