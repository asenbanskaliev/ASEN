import {realpathSync} from "node:fs";
import {isAbsolute} from "node:path";

export interface ExecFileRequest{
 readonly file:string;readonly arguments:readonly string[];readonly cwd:string;
 readonly timeoutMs:number;readonly maxBufferBytes:number;readonly signal?:AbortSignal;
}
export interface ExecFileResult{stdout:string;stderr:string;exitCode:number|null;signal:string|null;timedOut:boolean;outputLimitExceeded:boolean}
export type ExecFileAdapter=(request:ExecFileRequest)=>Promise<ExecFileResult>;
export interface NativeRddOptions{executable:string|(()=>string);execute:ExecFileAdapter}
type Operation="status"|"assess";
export type NativeRddObservation=Readonly<{operation:Operation;reviewAuthority:false;deliveryAuthority:false}&(
 {status:"available";data:Record<string,unknown>}|{status:"unavailable";reason:string})>;
interface ObservationContext{
 cwd:string;signal?:AbortSignal;sessionManager:{getSessionId():string};
 ui:{notify(message:string,level:"info"|"error"):void};
}
export interface NativeRddControl{observe(operation:Operation,context:ObservationContext):Promise<NativeRddObservation>}
const maxBufferBytes=16*1024*1024;
function requireValue(valid:unknown):asserts valid{if(!valid)throw new Error("incompatible_wire");}
function record(value:unknown):Record<string,unknown>{
 requireValue(typeof value==="object"&&value!==null&&!Array.isArray(value));return value as Record<string,unknown>;
}
function nonempty(value:unknown):boolean{return typeof value==="string"&&value.length>0;}
function oneOf(value:unknown,allowed:readonly unknown[]):boolean{return allowed.includes(value);}
function keys(value:Record<string,unknown>,allowed:readonly string[]):void{requireValue(Object.keys(value).every(key=>allowed.includes(key)));}
function exact(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 const object=record(value);keys(object,[...required,...optional]);requireValue(required.every(key=>Object.hasOwn(object,key)));return object;
}
function validateMode(value:Record<string,unknown>):void{
 const body=exact(value,["schema","operation","scope","status"]);
 requireValue(body.schema==="gentle-ai.review-mode/v1"&&body.operation==="status"&&oneOf(body.scope,["global","clone","both"]));
 const status=exact(body.status,["schema","global","clone_local","effective","source"],["revision","reach"]);
 requireValue(status.schema==="gentle-ai.rdd-mode-status/v1"&&oneOf(status.global,["","on","off"])&&oneOf(status.clone_local,["","on","off"]));
 requireValue(oneOf(status.effective,["on","off"])&&oneOf(status.source,["default","global","clone_local"]));
 requireValue(status.revision===undefined||nonempty(status.revision));
 requireValue(status.reach===undefined||oneOf(status.reach,["machine","this_build"]));
}
// Reference review-risk-assessment.ts: permissive assessment/reason/candidate keys,
// exact transition/argument keys. Validate raw wire, never reconstruct continuations.
function validateAssessment(body:Record<string,unknown>):void{
 requireValue(body.schema==="gentle-ai.review-assessment/v1"&&oneOf(body.risk,["passive","medium","high"]));
 for(const count of [body.changed_paths,body.changed_lines])requireValue(typeof count==="number"&&Number.isSafeInteger(count)&&count>=0);
 requireValue(Array.isArray(body.reasons));
 for(const value of body.reasons){
  const reason=record(value);requireValue(nonempty(reason.code));
  for(const field of [reason.path,reason.detail])requireValue(field===undefined||nonempty(field));
 }
 const candidate=record(body.candidate);
 requireValue(oneOf(candidate.kind,["current-changes","base-diff"]));
 requireValue(candidate.base_ref===undefined||nonempty(candidate.base_ref));
 requireValue(candidate.consumed===undefined||typeof candidate.consumed==="boolean");
 const due=body.review_due,reason=body.review_due_reason;
 requireValue((due===undefined)===(reason===undefined));
 if(due!==undefined){
  requireValue(typeof due==="boolean"&&oneOf(reason,["high_risk","slice_budget_reached","passive","under_budget","already_reviewed"]));
  requireValue(due===oneOf(reason,["high_risk","slice_budget_reached"]));
  requireValue(candidate.consumed!==true||reason==="already_reviewed");
  requireValue(reason!=="already_reviewed"||candidate.consumed!==undefined);
 }
 if(body.next_transition!==undefined){
  requireValue(due===true);
  const next=exact(body.next_transition,["operation","command","arguments"]);
  requireValue(next.operation==="review.status"&&nonempty(next.command)&&Array.isArray(next.arguments));
  for(const value of next.arguments){
   const argument=exact(value,["name","value"],["token"]);
   requireValue(nonempty(argument.name)&&typeof argument.value==="string"&&(argument.token===undefined||nonempty(argument.token)));
  }
 }
}
function validProcess(value:unknown):value is ExecFileResult{
 if(typeof value!=="object"||value===null||Array.isArray(value))return false;
 const result=value as Record<string,unknown>;
 return typeof result.stdout==="string"&&typeof result.stderr==="string"&&
  typeof result.timedOut==="boolean"&&typeof result.outputLimitExceeded==="boolean"&&
  (result.signal===null||typeof result.signal==="string")&&
  (result.exitCode===null||Number.isInteger(result.exitCode));
}
/** Host-injected read-only transport only: no binary lookup, spawning or local mode. */
export function createNativeRddControl(options?:NativeRddOptions):NativeRddControl{
 return Object.freeze({async observe(operation:Operation,context:ObservationContext):Promise<NativeRddObservation>{
  const unavailable=(reason:string):NativeRddObservation=>Object.freeze({operation,status:"unavailable",reason,reviewAuthority:false,deliveryAuthority:false});
  const manager=context.sessionManager,signal=context.signal,originalCwd=context.cwd;
  let cwd:string,sessionId:string;
  try{cwd=realpathSync(originalCwd);sessionId=manager.getSessionId();requireValue(nonempty(sessionId));}
  catch{return unavailable("invalid_context");}
  const current=()=>{
   try{return context.sessionManager===manager&&manager.getSessionId()===sessionId&&context.cwd===originalCwd&&
    realpathSync(context.cwd)===cwd&&context.signal===signal&&!signal?.aborted;}
   catch{return false;}
  };
  const publish=(result:NativeRddObservation)=>{
   if(!current())return unavailable("stale_context");
   context.ui.notify(JSON.stringify(result,null,2),result.status==="available"?"info":"error");return result;
  };
  if(!current())return unavailable(signal?.aborted?"cancelled":"stale_context");
  if(!options)return publish(unavailable("unconfigured"));
  let result:ExecFileResult;
  try{
   const file=typeof options.executable==="function"?options.executable():options.executable;
   if(typeof file!=="string"||!isAbsolute(file)||file.includes("\0"))return publish(unavailable("invalid_executable"));
   const args=operation==="status"?["review","mode","status","--cwd",cwd,"--json"]:["review","assess","--cwd",cwd,"--json"];
   if(!current())return unavailable("stale_context");
   result=await options.execute(Object.freeze({file,arguments:Object.freeze(args),cwd,timeoutMs:30_000,maxBufferBytes,...(signal?{signal}:{})}));
  }catch{return publish(unavailable("transport_unavailable"));}
  if(!current())return unavailable("stale_context");
  if(!validProcess(result))return publish(unavailable("invalid_transport"));
  if(result.outputLimitExceeded||Buffer.byteLength(result.stdout)>maxBufferBytes||Buffer.byteLength(result.stderr)>maxBufferBytes)return publish(unavailable("output_limit"));
  if(result.timedOut)return publish(unavailable("timeout"));
  if(result.signal!==null)return publish(unavailable("signal"));
  if(result.exitCode!==0)return publish(unavailable("nonzero_exit"));
  if(result.stderr.trim())return publish(unavailable("unexpected_stderr"));
  let data:Record<string,unknown>;
  try{data=record(JSON.parse(result.stdout));if(operation==="status")validateMode(data);else validateAssessment(data);}
  catch{return publish(unavailable("incompatible_wire"));}
  return publish(Object.freeze({operation,status:"available",data,reviewAuthority:false,deliveryAuthority:false}));
 }});
}
