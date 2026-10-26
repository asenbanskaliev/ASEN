import {createHash} from "node:crypto";
import {lstat,mkdir,mkdtemp,realpath,rmdir} from "node:fs/promises";
import path from "node:path";
import {spawnContainedWithInheritedPolicy} from "../evidence/spawn-contained.js";
import {resolveManagedCliCandidate} from "./managed-version-verification.js";
import {ManagedMaintenanceLockError,withManagedMaintenanceLock} from "./managed-maintenance-lock.js";

export interface ManagedCliProbeRequest {
 readonly prefix:string;readonly version:string;readonly confirmed:boolean;
 readonly signal?:AbortSignal;readonly timeoutMs?:number;readonly maxOutputBytes?:number;
}
export interface ManagedCliVersionObservation {
 readonly schema:"asen.managed-cli-version-observation/v1";
 readonly version:string;readonly cliVersion:"not-run"|"observed"|"failed"|"ambiguous";
 readonly reason:string|null;readonly runtimeReady:false;
 readonly stdout:string;readonly stderr:string;readonly exitCode:number|null;readonly signal:NodeJS.Signals|null;
 readonly launchAttempts:0|1;readonly launcherPid:number|null;
 readonly termination:"not-started"|"closed"|"uncertain";readonly error:string|null;
 readonly temporaryData:Readonly<{path:string;disposition:"removed"|"retained"|"uncertain"}>|null;
}
interface DirectoryClaim {path:string;identity:string;canonical:string}
/** @internal Shared immutable execution target; metadata never grants execution authority. */
export interface ManagedCliCandidateBinding {managed:DirectoryClaim;versionRoot:string;entryPoint:string;fingerprint:string}
type Execution=Pick<ManagedCliVersionObservation,"stdout"|"stderr"|"exitCode"|"signal"|"launcherPid"|"termination"|"error"|"reason">;
const identity=(stat:Awaited<ReturnType<typeof lstat>>)=>String(stat.dev)+":"+String(stat.ino);
const errorText=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,4096);
function empty(version:string):ManagedCliVersionObservation {
 return {schema:"asen.managed-cli-version-observation/v1",version,cliVersion:"not-run",reason:null,runtimeReady:false,
  stdout:"",stderr:"",exitCode:null,signal:null,launchAttempts:0,launcherPid:null,termination:"not-started",error:null,temporaryData:null};
}
async function directoryClaim(file:string):Promise<DirectoryClaim>{
 const entry=await lstat(file);
 if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error("CLI directory identity is not ordinary");
 return {path:file,identity:identity(entry),canonical:await realpath(file)};
}
async function sameDirectory(claim:DirectoryClaim):Promise<boolean>{
 try{const current=await directoryClaim(claim.path);return current.identity===claim.identity&&current.canonical===claim.canonical;}
 catch{return false;}
}
/** @internal Bind the fully verified owned inventory and canonical CLI target. */
export async function bindCandidate(input:Pick<ManagedCliProbeRequest,"prefix"|"version">):Promise<ManagedCliCandidateBinding>{
 const resolved=await resolveManagedCliCandidate(input),candidate=resolved.candidate;
 if(!candidate)throw new Error(resolved.verification.reason??"Managed CLI metadata is unverified");
 const managed=await directoryClaim(candidate.managedRoot),version=await directoryClaim(candidate.versionRoot);
 const expectedVersion=path.join(managed.canonical,"versions",input.version);
 if(version.canonical!==expectedVersion)throw new Error("Managed CLI version directory escaped its owned root");
 const entryPoint=path.join(version.canonical,...candidate.bin.split("/")),entry=await lstat(entryPoint);
 if(!entry.isFile()||entry.isSymbolicLink()||await realpath(entryPoint)!==entryPoint)throw new Error("Managed CLI entry is not the canonical listed regular file");
 const fingerprint=createHash("sha256").update(JSON.stringify({managed,version,entryPoint,entryIdentity:identity(entry),files:candidate.files})).digest("hex");
 return {managed,versionRoot:version.canonical,entryPoint,fingerprint};
}
/** @internal Re-run the full verifier and compare the physical/source binding. */
export async function stableCandidate(input:Pick<ManagedCliProbeRequest,"prefix"|"version">,bound:ManagedCliCandidateBinding):Promise<boolean>{
 try{return (await bindCandidate(input)).fingerprint===bound.fingerprint;}catch{return false;}
}
async function privateEnvironment(root:string,known:DirectoryClaim[]):Promise<NodeJS.ProcessEnv>{
 const home=path.join(root,"h"),temp=path.join(root,"t"),roaming=path.join(home,"appdata"),local=path.join(home,"localdata");
 const config=path.join(home,"xdg-config"),cache=path.join(home,"xdg-cache"),data=path.join(home,"xdg-data");
 for(const file of [home,temp,roaming,local,config,cache,data,path.join(root,"payload")]){
  await mkdir(file);known.push(await directoryClaim(file));
 }
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 // Windows PowerShell's Add-Type bridge needs the native command interpreter and
 // system tools to start its compiler. Keep that small runtime bootstrap while
 // continuing to exclude credentials, NODE_OPTIONS and provider configuration.
 const windowsPath=systemRoot&&process.platform==="win32"
  ? [path.dirname(process.execPath),path.join(systemRoot,"System32"),systemRoot,path.join(systemRoot,"System32","Wbem")].join(path.delimiter)
  : path.dirname(process.execPath);
 const env:NodeJS.ProcessEnv={PATH:windowsPath,HOME:home,USERPROFILE:home,
  TEMP:temp,TMP:temp,TMPDIR:temp,APPDATA:roaming,LOCALAPPDATA:local,
  XDG_CONFIG_HOME:config,XDG_CACHE_HOME:cache,XDG_DATA_HOME:data};
 if(systemRoot){env.SystemRoot=systemRoot;env.WINDIR=systemRoot;env.ComSpec=process.env.ComSpec??process.env.COMSPEC??path.join(systemRoot,"System32","cmd.exe");env.COMSPEC=env.ComSpec;}
 if(process.env.OS)env.OS=process.env.OS;
 if(process.env.PATHEXT)env.PATHEXT=process.env.PATHEXT;
 return env;
}
async function disposeTemporary(root:string,known:DirectoryClaim[],managed:DirectoryClaim,uncertain:boolean):Promise<NonNullable<ManagedCliVersionObservation["temporaryData"]>>{
 const report=(disposition:"removed"|"retained"|"uncertain")=>Object.freeze({path:root,disposition});
 if(uncertain||!await sameDirectory(managed))return report("uncertain");
 const original=known[0];
 if(!original||!await sameDirectory(original))return report("uncertain");
 let unconfirmed=false;
 for(const claim of [...known].reverse()){
  if(!await sameDirectory(managed)||!await sameDirectory(claim)){unconfirmed=true;continue;}
  try{await rmdir(claim.path);}catch(error){
   const code=(error as NodeJS.ErrnoException).code;
   if(code!=="ENOTEMPTY"&&code!=="EEXIST")unconfirmed=true;
  }
 }
 try{await lstat(root);return report(unconfirmed?"uncertain":"retained");}
 catch(error){return report((error as NodeJS.ErrnoException).code==="ENOENT"&&!unconfirmed?"removed":"uncertain");}
}
function observe(candidate:ManagedCliCandidateBinding,root:string,env:NodeJS.ProcessEnv,input:ManagedCliProbeRequest,timeoutMs:number,maxOutputBytes:number):Promise<Execution>{
 let child:ReturnType<typeof spawnContainedWithInheritedPolicy>;
 try{child=spawnContainedWithInheritedPolicy(process.execPath,[candidate.entryPoint,"--version"],{
  cwd:candidate.versionRoot,env,shell:false,stdio:["ignore","pipe","pipe"],
 },path.join(root,"payload"));}
 catch(error){return Promise.resolve({stdout:"",stderr:"",exitCode:null,signal:null,launcherPid:null,termination:"not-started",error:errorText(error),reason:"launch-failed"});}
 return new Promise(resolve=>{
  let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),done=false,stopReason:string|null=null,failure:string|null=null;
  let deadline:ReturnType<typeof setTimeout>|undefined,grace:ReturnType<typeof setTimeout>|undefined;
  const finish=(termination:"closed"|"uncertain",exitCode:number|null,signal:NodeJS.Signals|null)=>{
   if(done)return;done=true;if(deadline)clearTimeout(deadline);if(grace)clearTimeout(grace);
   input.signal?.removeEventListener("abort",abort);
   resolve({stdout:stdout.toString("utf8"),stderr:stderr.toString("utf8"),exitCode,signal,launcherPid:child.pid??null,
    termination,error:failure,reason:stopReason??(termination==="uncertain"?"termination-uncertain":null)});
  };
  const stop=(reason:string)=>{
   if(done||stopReason)return;stopReason=reason;
   try{child.kill("SIGKILL");}catch(error){failure=errorText(error);}
   grace=setTimeout(()=>finish("uncertain",child.exitCode,child.signalCode),1000);
  };
  const abort=()=>stop("cancelled");
  const collect=(stream:"stdout"|"stderr",chunk:Buffer|string)=>{
   if(done||stopReason)return;
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk),remaining=Math.max(0,maxOutputBytes-stdout.length-stderr.length);
   const retained=bytes.subarray(0,remaining);
   if(stream==="stdout")stdout=Buffer.concat([stdout,retained]);else stderr=Buffer.concat([stderr,retained]);
   if(bytes.length>remaining)stop("output-limit");
  };
  child.stdout?.on("data",(chunk:Buffer|string)=>collect("stdout",chunk));
  child.stderr?.on("data",(chunk:Buffer|string)=>collect("stderr",chunk));
  child.once("error",error=>{failure=errorText(error);stop("launch-failed");});
  child.once("close",(code,signal)=>finish("closed",code,signal));
  deadline=setTimeout(()=>stop("timeout"),timeoutMs);
  input.signal?.addEventListener("abort",abort,{once:true});
  if(input.signal?.aborted)abort();
 });
}

/** Executes a package with current-user permissions. Caller intent is not native human consent or publisher trust. */
export async function probeManagedCliVersion(input:ManagedCliProbeRequest):Promise<ManagedCliVersionObservation>{
 const base=empty(input.version),refuse=(reason:string,error:string|null=null)=>Object.freeze({...base,reason,error});
 if(input.confirmed!==true)return refuse("confirmation-required");
 if(input.signal?.aborted)return refuse("cancelled-before-launch");
 const timeoutMs=input.timeoutMs??10000,maxOutputBytes=input.maxOutputBytes??65536;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000||!Number.isInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>65536)return refuse("invalid-bounds");
 let bound:ManagedCliCandidateBinding;
 try{bound=await bindCandidate(input);}catch(error){return refuse("metadata-unverified",errorText(error));}
 if(input.signal?.aborted)return refuse("cancelled-before-launch");
 if(!await sameDirectory(bound.managed))return refuse("candidate-drift");
 let root:string|null=null,result=base,attempts:0|1=0;
 const known:DirectoryClaim[]=[];
 try{
  await withManagedMaintenanceLock({prefix:input.prefix,confirmed:true,...(input.signal?{signal:input.signal}:{})},async()=>{
   if(input.signal?.aborted){result=refuse("cancelled-before-launch");return;}
   if(!await stableCandidate(input,bound)){result=refuse("candidate-drift");return;}
   if(input.signal?.aborted){result=refuse("cancelled-before-launch");return;}
   try{
  root=await mkdtemp(path.join(bound.managed.canonical,".cli-probe-"));known.push(await directoryClaim(root));
  if(!await sameDirectory(bound.managed))throw new Error("Managed root changed during temporary preparation");
  const environment=await privateEnvironment(root,known);
  if(input.signal?.aborted)result={...base,reason:"cancelled-before-launch"};
  else if(!await stableCandidate(input,bound))result={...base,reason:"candidate-drift"};
  else if(input.signal?.aborted)result={...base,reason:"cancelled-before-launch"};
  else{
   attempts=1;const execution=await observe(bound,root,environment,input,timeoutMs,maxOutputBytes);
   result={...base,...execution,launchAttempts:1};
   if(execution.reason||execution.error||execution.termination!=="closed")result={...result,cliVersion:"ambiguous"};
   else if(execution.signal)result={...result,cliVersion:"ambiguous",reason:"interrupted"};
   else if(execution.exitCode!==0)result={...result,cliVersion:"failed",reason:"exit-mismatch"};
   else if(execution.stderr!=="")result={...result,cliVersion:"failed",reason:"stderr-not-empty"};
   else if(execution.stdout!==input.version+"\n")result={...result,cliVersion:"failed",reason:"version-mismatch"};
   else result={...result,cliVersion:"observed",reason:null};
   if(!await stableCandidate(input,bound))result={...result,cliVersion:"ambiguous",reason:"candidate-drift"};
  }
   }catch(error){result={...result,launchAttempts:attempts,cliVersion:attempts?"ambiguous":"not-run",reason:attempts?"launch-failed":"preparation-failed",error:errorText(error)};}
   const temporaryData=root?await disposeTemporary(root,known,bound.managed,result.cliVersion==="ambiguous"):null;
   result={...result,temporaryData};
  });
 }catch(error){
  let reason="maintenance-unavailable";
  if(!attempts&&error instanceof ManagedMaintenanceLockError){
   if(error.code==="LOCK_CANCELLED")reason="cancelled-before-launch";
   else if(error.code==="ROOT_CHANGED"||error.code==="OWNED_ROOT_REQUIRED")reason="candidate-drift";
  }
  const detail=errorText(error)+(attempts?`; prior reason: ${result.reason??"none"}; prior error: ${result.error??"none"}`:"");
  result={...result,launchAttempts:attempts,cliVersion:attempts?"ambiguous":"not-run",reason,error:errorText(detail),
   temporaryData:result.temporaryData??(root?{path:root,disposition:"uncertain"}:null)};
 }
 return Object.freeze(result);
}
