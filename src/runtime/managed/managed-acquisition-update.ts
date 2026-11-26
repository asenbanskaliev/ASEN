import {randomUUID} from "node:crypto";
import {open,lstat,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import {createManagedUpdatePreview} from "./managed-update-preview.js";
import {ManagedInstallError,inspectManagedInstall,selectManagedVersion,stageAdditionalManagedVersion,type ManagedInstallFile} from "./managed-install.js";

export interface ManagedAcquisitionUpdateRequest{
 readonly manifestPath:string;
 readonly packageRoot:string;
 readonly prefix:string;
 readonly protectedPaths:readonly string[];
 readonly confirmed:boolean;
}
export interface ManagedAcquisitionUpdateReport{
 readonly schema:"asen.managed-acquisition-update/v1";
 readonly operation:"managed-acquisition-update";
 readonly status:"staged"|"unchanged";
 readonly prefix:string;
 readonly version:string;
 readonly files:readonly ManagedInstallFile[];
 readonly selection:"not-run";
 readonly activation:"not-run";
 readonly producerAuthenticity:"not-established";
 readonly runtimeReady:false;
}
function installError(code:"CONFIRMATION_REQUIRED"|"INVALID_ABSOLUTE_PATH"|"FOREIGN_MANAGED_ROOT"|"VERSION_CONFLICT",message:string):never{throw new ManagedInstallError(code,message);}
class ManagedAcquisitionRecoveryError extends Error{readonly code="RECOVERY_REQUIRED";constructor(message:string){super(message);this.name="ManagedAcquisitionRecoveryError";}}

/** Freshly previews then stages declared local bytes; it never selects, activates, or executes them. */
export async function stageManagedAcquisitionUpdate(request:ManagedAcquisitionUpdateRequest):Promise<ManagedAcquisitionUpdateReport>{
 if(request.confirmed!==true)installError("CONFIRMATION_REQUIRED","Managed acquisition update requires explicit confirmation");
 const recovery=await recoverManagedAcquisitionUpdate({prefix:request.prefix,confirmed:true});
 if(recovery.status==="ambiguous")(()=>{throw new ManagedAcquisitionRecoveryError("Managed acquisition recovery is unresolved; update was not staged");})();
 for(const [noun,value] of [["manifest",request.manifestPath],["package root",request.packageRoot],["installation prefix",request.prefix],...request.protectedPaths.map(value=>["protected path",value] as const)] as const)if(typeof value!=="string"||!path.isAbsolute(value))installError("INVALID_ABSOLUTE_PATH",`Managed ${noun} must be absolute`);
 const preview=await createManagedUpdatePreview({manifestPath:request.manifestPath,packageRoot:request.packageRoot,prefix:request.prefix});
 if(preview.managed.status!=="owned")installError("FOREIGN_MANAGED_ROOT","Managed acquisition update requires an existing owned installation");
 if(preview.managed.targetVersionState==="conflicting-retained")installError("VERSION_CONFLICT",`Managed version ${preview.acquisition.version} already exists with different data`);
 const expected={schema:"asen.managed-acquisition/v1" as const,version:preview.acquisition.version,files:preview.acquisition.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath,size:file.size,sha256:file.sha256}))};
 const staged=await stageAdditionalManagedVersion({prefix:request.prefix,packageRoot:request.packageRoot,version:expected.version,files:expected.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath})),protectedPaths:request.protectedPaths,confirmed:true,expectedAcquisition:expected});
 return Object.freeze({schema:"asen.managed-acquisition-update/v1",operation:"managed-acquisition-update",status:staged.status as "staged"|"unchanged",prefix:path.resolve(request.prefix),version:expected.version,files:staged.files,selection:"not-run",activation:"not-run",producerAuthenticity:"not-established",runtimeReady:false});
}


export interface ManagedAcquisitionActivationReport{
 readonly schema:"asen.managed-acquisition-update/v1";
 readonly operation:"managed-acquisition-update";
 readonly status:"staged"|"activated"|"rolled-back"|"ambiguous";
 readonly prefix:string;
 readonly version:string;
 readonly previousVersion:string;
 readonly selection:"not-run"|"selected"|"restored"|"uncertain";
 readonly activation:"not-run"|"verified"|"failed";
 readonly runtimeReady:boolean;
 readonly error:"CANCELLED_BEFORE_SELECTION"|"CANCELLED_DURING_ACTIVATION"|"ACTIVATION_FAILED"|"ROLLBACK_UNCERTAIN"|null;
}
const freezeActivation=(report:ManagedAcquisitionActivationReport)=>Object.freeze({...report});
type PendingManagedUpdate=Readonly<{schema:"asen.managed-acquisition-update-pending/v1";pid:number;previousVersion:string;targetVersion:string}>;
const pendingPath=(prefix:string)=>path.join(path.resolve(prefix),"install",".asen-acquisition-update.pending");
async function writePendingManagedUpdate(prefix:string,previousVersion:string,targetVersion:string):Promise<string>{
 const file=pendingPath(prefix),bytes=JSON.stringify({schema:"asen.managed-acquisition-update-pending/v1",token:randomUUID(),pid:process.pid,previousVersion,targetVersion})+"\n";
 const handle=await open(file,"wx",0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 return bytes;
}
async function removePendingManagedUpdate(prefix:string,expected:string):Promise<void>{
 const file=pendingPath(prefix),info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||await readFile(file,"utf8")!==expected)throw new Error("PENDING_JOURNAL_CHANGED");
 await unlink(file);
}
export async function recoverManagedAcquisitionUpdate(request:Readonly<{prefix:string;confirmed:boolean}>):Promise<Readonly<{status:"none"|"restored"|"already-previous"|"ambiguous";previousVersion?:string;targetVersion?:string}>>{
 if(request.confirmed!==true)installError("CONFIRMATION_REQUIRED","Managed acquisition recovery requires explicit confirmation");
 const prefix=path.resolve(request.prefix),file=pendingPath(prefix);
 let bytes:string;
 try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4096)return Object.freeze({status:"ambiguous"});bytes=await readFile(file,"utf8");}
 catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return Object.freeze({status:"none"});return Object.freeze({status:"ambiguous"});}
 let journal:PendingManagedUpdate;
 try{const parsed=JSON.parse(bytes) as Record<string,unknown>;if(parsed.schema!=="asen.managed-acquisition-update-pending/v1"||!Number.isSafeInteger(parsed.pid)||typeof parsed.previousVersion!=="string"||typeof parsed.targetVersion!=="string")return Object.freeze({status:"ambiguous"});journal=parsed as PendingManagedUpdate;}
 catch{return Object.freeze({status:"ambiguous"});}
 try{process.kill(journal.pid,0);return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ESRCH")return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});}
 const inventory=await inspectManagedInstall({prefix}).catch(()=>undefined);
 if(inventory?.status!=="owned"||!inventory.versions.some(item=>item.version===journal.previousVersion)||!inventory.versions.some(item=>item.version===journal.targetVersion))return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});
 if(inventory.activeVersion===journal.targetVersion){
  const restored=await selectManagedVersion({prefix,version:journal.previousVersion,expectedCurrentVersion:journal.targetVersion,confirmed:true}).catch(()=>undefined);
  if(restored?.status!=="selected"&&restored?.status!=="unchanged")return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});
 }else if(inventory.activeVersion!==journal.previousVersion)return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});
 try{await removePendingManagedUpdate(prefix,bytes);}catch{return Object.freeze({status:"ambiguous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});}
 return Object.freeze({status:inventory.activeVersion===journal.targetVersion?"restored":"already-previous",previousVersion:journal.previousVersion,targetVersion:journal.targetVersion});
}

/**
 * Selecciona una versión ya validada, ejecuta la comprobación del lanzador y
 * restaura la anterior si la activación falla o se cancela. Nunca elimina la
 * versión nueva ni modifica datos fuera del inventario administrado.
 */
export async function activateManagedAcquisitionUpdate(
 request:ManagedAcquisitionUpdateRequest,
 activate:(version:string,signal?:AbortSignal)=>Promise<void>,
 signal?:AbortSignal
):Promise<ManagedAcquisitionActivationReport>{
 if(typeof activate!=="function")throw new TypeError("Managed acquisition update requires an activation verifier");
 const prefix=path.resolve(request.prefix);
 const recovery=await recoverManagedAcquisitionUpdate({prefix,confirmed:request.confirmed});
 if(recovery.status==="ambiguous")(()=>{throw new ManagedAcquisitionRecoveryError("Managed acquisition recovery is unresolved; activation was not started");})();
 const before=await createManagedUpdatePreview({manifestPath:request.manifestPath,packageRoot:request.packageRoot,prefix});
 if(before.managed.status!=="owned")installError("FOREIGN_MANAGED_ROOT","Managed acquisition update requires an existing owned installation");
 const previousVersion=before.managed.selectedVersion;
 if(!previousVersion)throw new ManagedInstallError("SOURCE_DRIFT","Recoverable update requires a currently selected managed version");
 const staged=await stageManagedAcquisitionUpdate(request);
 const base={schema:"asen.managed-acquisition-update/v1" as const,operation:"managed-acquisition-update" as const,
  prefix,version:staged.version,previousVersion,selection:"not-run" as const,activation:"not-run" as const,
  runtimeReady:false,error:null};
 if(staged.version===previousVersion)return freezeActivation({...base,status:"staged"});
 if(signal?.aborted)return freezeActivation({...base,status:"staged",error:"CANCELLED_BEFORE_SELECTION"});
 const journal=await writePendingManagedUpdate(prefix,previousVersion,staged.version);
 try{
  const selected=await selectManagedVersion({prefix,version:staged.version,expectedCurrentVersion:previousVersion,confirmed:true});
  if(selected.status!=="selected"&&selected.status!=="unchanged")throw new Error("SELECTOR_UNCERTAIN");
 }catch{
  const current=await inspectManagedInstall({prefix}).catch(()=>undefined);
  if(current?.status==="owned"&&current.activeVersion===previousVersion){
   try{await removePendingManagedUpdate(prefix,journal);return freezeActivation({...base,status:"staged"});}catch{/* La recuperación posterior conserva el selector anterior. */}
  }
  return freezeActivation({...base,status:"ambiguous",selection:"uncertain",error:"ROLLBACK_UNCERTAIN"});
 }
 try{
  if(signal?.aborted)throw Error("CANCELLED_DURING_ACTIVATION");
  await activate(staged.version,signal);
  if(signal?.aborted)throw Error("CANCELLED_DURING_ACTIVATION");
  const current=await inspectManagedInstall({prefix});
  if(signal?.aborted)throw Error("CANCELLED_DURING_ACTIVATION");
  if(current.status!=="owned"||current.activeVersion!==staged.version)throw Error("ACTIVATION_FAILED");
  await removePendingManagedUpdate(prefix,journal);
  return freezeActivation({...base,status:"activated",selection:"selected",activation:"verified",runtimeReady:true});
 }catch(error){
  const cancelled=signal?.aborted===true||(error instanceof Error&&error.message==="CANCELLED_DURING_ACTIVATION");
  try{
   const observed=await inspectManagedInstall({prefix});
   if(observed.status!=="owned")throw Error("OWNERSHIP_UNCERTAIN");
   if(observed.activeVersion!==previousVersion){
    if(observed.activeVersion!==staged.version)throw Error("SELECTION_CHANGED");
    const restored=await selectManagedVersion({prefix,version:previousVersion,expectedCurrentVersion:staged.version,confirmed:true});
    if(restored.status!=="selected"&&restored.status!=="unchanged")throw Error("ROLLBACK_UNCERTAIN");
   }
   const final=await inspectManagedInstall({prefix});
   if(final.status!=="owned"||final.activeVersion!==previousVersion)throw Error("ROLLBACK_UNCERTAIN");
   try{await removePendingManagedUpdate(prefix,journal);}
   catch{return freezeActivation({...base,status:"ambiguous",selection:"uncertain",activation:"failed",error:"ROLLBACK_UNCERTAIN"});}
   return freezeActivation({...base,status:"rolled-back",selection:"restored",activation:"failed",
    error:cancelled?"CANCELLED_DURING_ACTIVATION":"ACTIVATION_FAILED"});
  }catch{
   return freezeActivation({...base,status:"ambiguous",selection:"uncertain",activation:"failed",error:"ROLLBACK_UNCERTAIN"});
  }
 }
}