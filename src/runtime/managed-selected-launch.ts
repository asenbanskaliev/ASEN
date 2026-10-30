import type {ChildProcess} from "node:child_process";
import {lstat,mkdtemp,readFile,realpath,rmdir} from "node:fs/promises";
import path from "node:path";
import {spawnContainedWithInheritedPolicy} from "../evidence/spawn-contained.js";
import {bindCandidate,stableCandidate,type ManagedCliCandidateBinding} from "./managed-cli-version-probe.js";
import {withManagedMaintenanceLock} from "./managed-maintenance-lock.js";

export interface ManagedSelectedLaunchRequest {
 readonly prefix:string;
 readonly version:string;
 readonly home:string;
 readonly args:readonly string[];
 readonly confirmed:boolean;
 readonly cwd:string;
 readonly env:Readonly<Record<string,string|undefined>>;
 readonly hooks?:Readonly<{beforeLaunch?:()=>void|Promise<void>}>;
}
export interface ManagedSelectedLaunchReport {
 readonly schema:"asen.managed-selected-launch/v1";
 readonly status:"refused"|"closed"|"ambiguous";
 readonly reason:string|null;
 readonly launchAttempts:0|1;
 readonly termination:"not-started"|"closed"|"uncertain";
 readonly exitCode:number|null;
 readonly signal:NodeJS.Signals|null;
 readonly error:string|null;
}
interface CurrentClaim {path:string;canonical:string;identity:string;size:number;bytes:Buffer}
interface DirectoryClaim {path:string;canonical:string;identity:string}
interface PayloadClaim {managed:DirectoryClaim;payload:DirectoryClaim}
type Execution=Pick<ManagedSelectedLaunchReport,"status"|"reason"|"termination"|"exitCode"|"signal"|"error">;

const normalized=(value:string)=>process.platform==="win32"?path.resolve(value).toLowerCase():path.resolve(value);
const identity=(entry:Awaited<ReturnType<typeof lstat>>)=>`${entry.dev}:${entry.ino}:${entry.birthtimeMs}`;
const errorText=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,4096);
function base(status:ManagedSelectedLaunchReport["status"],reason:string|null,launchAttempts:0|1=0):ManagedSelectedLaunchReport{
 return Object.freeze({schema:"asen.managed-selected-launch/v1",status,reason,launchAttempts,
  termination:"not-started",exitCode:null,signal:null,error:null});
}
async function bindCurrent(candidate:ManagedCliCandidateBinding,version:string):Promise<CurrentClaim>{
 const file=path.join(candidate.managed.canonical,"current"),entry=await lstat(file);
 if(!entry.isFile()||entry.isSymbolicLink())throw new Error("Managed current selector is not an ordinary file");
 const canonical=await realpath(file),bytes=await readFile(file);
 if(normalized(canonical)!==normalized(file)||!bytes.equals(Buffer.from(version+"\n")))throw new Error("Managed current selector does not name the requested version");
 return{path:file,canonical,identity:identity(entry),size:entry.size,bytes};
}
async function stableCurrent(claim:CurrentClaim):Promise<boolean>{
 try{
  const entry=await lstat(claim.path);
  if(!entry.isFile()||entry.isSymbolicLink()||identity(entry)!==claim.identity||entry.size!==claim.size)return false;
  if(normalized(await realpath(claim.path))!==normalized(claim.canonical))return false;
  const bytes=await readFile(claim.path);if(!bytes.equals(claim.bytes))return false;
  const after=await lstat(claim.path);
  return after.isFile()&&!after.isSymbolicLink()&&identity(after)===claim.identity&&after.size===claim.size;
 }catch{return false;}
}
async function claimDirectory(file:string):Promise<DirectoryClaim>{
 const entry=await lstat(file);
 if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error("Selected-launch payload claim is not an ordinary directory");
 return{path:file,canonical:await realpath(file),identity:identity(entry)};
}
async function bindPayload(candidate:ManagedCliCandidateBinding,payload:string):Promise<PayloadClaim>{
 const managed=await claimDirectory(candidate.managed.path);
 if(normalized(managed.canonical)!==normalized(candidate.managed.canonical)
  ||managed.identity.split(":",2).join(":")!==candidate.managed.identity)throw new Error("Managed root changed before payload binding");
 const claimed=await claimDirectory(payload);
 if(normalized(claimed.canonical)!==normalized(payload)
  ||normalized(path.dirname(claimed.canonical))!==normalized(managed.canonical))throw new Error("Selected-launch payload escaped its original managed root");
 return{managed,payload:claimed};
}
async function sameDirectory(claim:DirectoryClaim):Promise<boolean>{
 try{const current=await claimDirectory(claim.path);return current.identity===claim.identity&&normalized(current.canonical)===normalized(claim.canonical);}
 catch{return false;}
}
async function removeOwnedEmptyPayload(candidate:ManagedCliCandidateBinding,claim:PayloadClaim):Promise<boolean>{
 if(!await sameDirectory(claim.managed)||!await sameDirectory(claim.payload))return false;
 if(claim.managed.identity.split(":",2).join(":")!==candidate.managed.identity
  ||normalized(claim.managed.canonical)!==normalized(candidate.managed.canonical))return false;
 try{await rmdir(claim.payload.path);return true;}catch{return false;}
}
function observe(child:ChildProcess):Promise<Execution>{
 return new Promise(resolve=>{
  let done=false;
  const finish=(result:Execution)=>{if(done)return;done=true;resolve(result);};
  child.once("error",error=>finish({status:"ambiguous",reason:"launch-failed",termination:"uncertain",exitCode:null,signal:null,error:errorText(error)}));
  child.once("close",(code,signal)=>finish({status:"closed",reason:signal?"interrupted":null,termination:"closed",exitCode:code,signal,error:null}));
 });
}

/**
 * Execute one explicitly selected owned CLI with current-user permissions.
 * Caller intent is not native human consent, publisher authenticity, or an OS sandbox.
 */
export async function launchManagedSelectedVersion(input:ManagedSelectedLaunchRequest):Promise<ManagedSelectedLaunchReport>{
 const refuse=(reason:string,error:string|null=null)=>Object.freeze({...base("refused",reason),error});
 if(input.confirmed!==true)return refuse("confirmation-required");
 if(!path.isAbsolute(input.prefix)||!path.isAbsolute(input.home)||!path.isAbsolute(input.cwd)
  ||!Array.isArray(input.args)||input.args.some(argument=>typeof argument!=="string"))return refuse("invalid-request");
 const request={prefix:path.resolve(input.prefix),version:input.version};
 let candidate:ManagedCliCandidateBinding,current:CurrentClaim;
 try{candidate=await bindCandidate(request);current=await bindCurrent(candidate,input.version);}
 catch(error){return refuse("candidate-drift",errorText(error));}
 let attempts:0|1=0,result:ManagedSelectedLaunchReport=base("refused","candidate-drift"),payload:PayloadClaim|null=null;
 try{
  await withManagedMaintenanceLock({prefix:request.prefix,confirmed:true},async()=>{
   if(!await stableCandidate(request,candidate)||!await stableCurrent(current)){result=base("refused","candidate-drift");return;}
   await input.hooks?.beforeLaunch?.();
   if(!await stableCandidate(request,candidate)||!await stableCurrent(current)){result=base("refused","candidate-drift");return;}
   try{
    const payloadPath=await mkdtemp(path.join(candidate.managed.canonical,".selected-launch-"));
    payload=await bindPayload(candidate,payloadPath);
    if(!await stableCandidate(request,candidate)||!await stableCurrent(current)){result=base("refused","candidate-drift");return;}
    const home=path.resolve(input.home),cwd=path.resolve(input.cwd);
    const childArgs=[candidate.entryPoint,"--home",home,"--package-root",candidate.versionRoot,"--",...input.args];
    let child:ChildProcess;
    try{
     child=spawnContainedWithInheritedPolicy(process.execPath,childArgs,{cwd,env:{...input.env,PI_CODING_AGENT_DIR:home,ASEN_PACKAGE_ROOT:candidate.versionRoot},stdio:"inherit",shell:false},payload.payload.path);
     attempts=1;
    }catch(error){result=refuse("launch-failed",errorText(error));return;}
    const execution=await observe(child);
    result=Object.freeze({...base(execution.status,execution.reason,1),...execution,launchAttempts:1});
    if(!await stableCandidate(request,candidate)||!await stableCurrent(current))result=Object.freeze({...result,status:"ambiguous",reason:"candidate-drift"});
   }finally{
    if(payload&&!await removeOwnedEmptyPayload(candidate,payload)&&attempts){
     const cleanupError="Selected-launch payload ownership changed or cleanup was uncertain; retained";
     result=Object.freeze({...result,status:"ambiguous",reason:"cleanup-uncertain",error:result.error?result.error+"; "+cleanupError:cleanupError});
    }
   }
  });
 }catch(error){
  result=attempts
   ?Object.freeze({...result,status:"ambiguous",reason:"maintenance-unavailable",launchAttempts:1,error:errorText(error)})
   :refuse("maintenance-unavailable",errorText(error));
 }
 return Object.freeze({...result,launchAttempts:attempts});
}
