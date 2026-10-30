import {acquireWorkspaceWriter} from "./workspace-writer-lease.js";
import {BackgroundJobJournal} from "./background-job-journal.js";
import {BackgroundJobRegistry,type BackgroundProcessOptions,type BackgroundJobSnapshot} from "./background-jobs.js";
import {createHash} from "node:crypto";

/** Explicit, single-use retry of a crashed job. Never automatically replay persisted commands. */
export async function retryInterruptedAuthorized(input:{
 readonly journal:BackgroundJobJournal;
 readonly registry:BackgroundJobRegistry;
 readonly interruptedJobId:string;
 readonly newJobId:string;
 readonly authorizationId:string;
 readonly expectedHead:string;
 readonly allowedPaths:readonly string[];
 readonly authorizationExpiresAt:string;
 readonly options:BackgroundProcessOptions;
}):Promise<BackgroundJobSnapshot>{
 const {journal,registry,interruptedJobId,newJobId,authorizationId,expectedHead,allowedPaths,authorizationExpiresAt,options}=input;
 if(!options.projectId||!options.sessionId||!options.cwd||options.cwd!==options.projectId)throw new Error("Retry requires an exact authorized project root");
 if(!/^[a-f0-9-]{36}$/iu.test(newJobId)||!authorizationId||!Number.isFinite(Date.parse(authorizationExpiresAt))||Date.parse(authorizationExpiresAt)<=Date.now())throw new Error("Retry requires a fresh, unexpired authorization");
 const operationDigest=createHash("sha256").update(JSON.stringify({sessionId:options.sessionId,projectId:options.projectId,cwd:options.cwd,command:options.command,args:[...(options.args??[])],mode:options.mode??"background",env:Object.entries(options.env??{}).filter((entry):entry is [string,string]=>typeof entry[1]==="string").sort(([a],[b])=>a.localeCompare(b)),expectedHead,allowedPaths:[...allowedPaths].sort(),interruptedJobId})).digest("hex");
 // Acquire workspace ownership BEFORE consuming the persisted retry entitlement.
 const lease=acquireWorkspaceWriter({root:options.projectId,expectedHead,authorizationId,allowedPaths});
 try{
  lease.verify();
  const prior=journal.load(options.sessionId,options.projectId).find(row=>row.id===interruptedJobId);
  if(!prior||prior.state!=="interrupted"||prior.command!==options.command||JSON.stringify(prior.args??[])!==JSON.stringify(options.args??[])||(prior.cwd??prior.projectId)!==(options.cwd??options.projectId))throw new Error("Retry must match the interrupted operation, arguments, working directory and project");
  journal.claimInterruptedForRetry({sessionId:options.sessionId,projectId:options.projectId,interruptedJobId,newJobId,authorizedCommand:options.command,authorizationId,operationDigest,expectedHead,allowedPaths,authorizationExpiresAt});
  lease.verify();
  const {done}=registry.runAuthorizedRetry(options,{jobId:newJobId,authorizationId,operationDigest,originalJobId:interruptedJobId,expectedHead,allowedPaths,authorizationExpiresAt});
  const result=await done;
  lease.verify();
  return result;
 }finally{lease.release();}
}
