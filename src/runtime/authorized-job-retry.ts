import {acquireWorkspaceWriter} from "./workspace-writer-lease.js";
import {BackgroundJobJournal} from "./background-job-journal.js";
import {BackgroundJobRegistry,type BackgroundProcessOptions,type BackgroundJobSnapshot} from "./background-jobs.js";

/** Explicit, single-use retry of a crashed job. Never automatically replay persisted commands. */
export async function retryInterruptedAuthorized(input:{
 readonly journal:BackgroundJobJournal;
 readonly registry:BackgroundJobRegistry;
 readonly interruptedJobId:string;
 readonly newJobId:string;
 readonly authorizationId:string;
 readonly expectedHead:string;
 readonly allowedPaths:readonly string[];
 readonly options:BackgroundProcessOptions;
}):Promise<BackgroundJobSnapshot>{
 const {journal,registry,interruptedJobId,newJobId,authorizationId,expectedHead,allowedPaths,options}=input;
 if(!options.projectId||!options.sessionId||!options.cwd||options.cwd!==options.projectId)throw new Error("Retry requires an exact authorized project root");
 // Acquire workspace ownership BEFORE consuming the persisted retry entitlement.
 const lease=acquireWorkspaceWriter({root:options.projectId,expectedHead,authorizationId,allowedPaths});
 try{
  lease.verify();
  const prior=journal.load(options.sessionId,options.projectId).find(row=>row.id===interruptedJobId);
  if(!prior||prior.state!=="interrupted"||prior.command!==options.command)throw new Error("Retry must match the interrupted command and project");
  journal.claimInterruptedForRetry({sessionId:options.sessionId,projectId:options.projectId,interruptedJobId,newJobId,authorizedCommand:options.command,authorizationId});
  lease.verify();
  const {done}=registry.run(options);
  const result=await done;
  lease.verify();
  return result;
 }finally{lease.release();}
}
