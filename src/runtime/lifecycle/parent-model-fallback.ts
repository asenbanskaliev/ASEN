import type {Thinking} from "./profiles.js";
import {
 ModelFallbackEpisode,
 getProcessModelFallbackCooldown,
 classifyLastAssistantFailure,
 shouldFallback,
 type ModelFallbackCooldown,
 type ModelFallbackStep,
} from "./model-fallback-policy.js";
import {
 formatModelFallbackContinuation,
 type ModelCatalogRates,
 type ModelFallbackChange,
} from "./model-fallback-notice.js";

export interface ParentFallbackScope{sessionId:string;projectId:string}
export interface ParentFallbackIdentity extends ParentFallbackScope{profile:string|undefined}
export interface ParentCatalogModel{provider:string;id:string;cost?:ModelCatalogRates|undefined}
export interface ParentModelFallbackHost{
 identity(context?:unknown):ParentFallbackIdentity|undefined|Promise<ParentFallbackIdentity|undefined>;
 loadChain(profile:string|undefined,context?:unknown):readonly ModelFallbackStep[]|Promise<readonly ModelFallbackStep[]>;
 currentModel(context?:unknown):string|undefined;
 findModel?(model:string,context?:unknown):ParentCatalogModel|undefined;
 setModel?(model:ParentCatalogModel,context?:unknown):boolean|Promise<boolean>;
 getThinking?():Thinking|undefined;
 setThinking?(level:Thinking):void;
 notify?(change:ModelFallbackChange,pricing:{from?:ModelCatalogRates;to?:ModelCatalogRates},context?:unknown):void;
 followUp?(message:string,context?:unknown):void;
 cooldown?:ModelFallbackCooldown;
 clock?:()=>number;
}
export interface ParentModelFallbackAdapter{
 activate(scope:ParentFallbackScope|undefined):void;
 onAgentEnd(event:{messages?:readonly unknown[]}|undefined,scope?:ParentFallbackScope):void;
 onAgentSettled(event?:{aborted?:boolean},context?:unknown,scope?:ParentFallbackScope):Promise<boolean>;
 clear():void;
}

function sameScope(left:ParentFallbackScope|undefined,right:ParentFallbackScope|undefined):boolean{
 return !!left&&!!right&&left.sessionId===right.sessionId&&left.projectId===right.projectId;
}
function sameIdentity(left:ParentFallbackIdentity|undefined,right:ParentFallbackIdentity):boolean{
 return sameScope(left,right)&&left?.profile===right.profile;
}
function validScope(value:ParentFallbackScope|undefined):value is ParentFallbackScope{
 return !!value&&typeof value.sessionId==="string"&&value.sessionId.length>0&&typeof value.projectId==="string"&&value.projectId.length>0;
}
function validIdentity(value:ParentFallbackIdentity|undefined):value is ParentFallbackIdentity{
 return validScope(value)&&(value.profile===undefined||typeof value.profile==="string");
}
function modelRef(model:ParentCatalogModel|undefined):string|undefined{return model?`${model.provider}/${model.id}`:undefined;}

/** Parent-only adapter for Pi's agent_end -> agent_settled lifecycle. */
export function createParentModelFallback(host:ParentModelFallbackHost):ParentModelFallbackAdapter{
 const cooldown=host.cooldown??getProcessModelFallbackCooldown();
 let activeScope:ParentFallbackScope|undefined,bindingRequired=false,lastScope:ParentFallbackScope|undefined;
 let lastMessages:readonly unknown[]=[];
 let episode:ModelFallbackEpisode|undefined;
 let episodeIdentity:ParentFallbackIdentity|undefined;
 let episodeThinking:Thinking|undefined;
 let inFlight:Promise<boolean>|undefined;
 let epoch=0;
 const accepts=(scope:ParentFallbackScope|undefined)=>!bindingRequired||sameScope(activeScope,scope);
 const currentIdentity=async(context?:unknown)=>{const value=await host.identity(context);return validIdentity(value)?value:undefined;};
 const invalidate=(outcome:"success"|"aborted")=>{
  epoch+=1;episode?.clear(outcome);episode=undefined;episodeIdentity=undefined;episodeThinking=undefined;lastMessages=[];lastScope=undefined;
 };
 const run=async(messages:readonly unknown[],settled:{aborted?:boolean},context:unknown,operation:number,origin:ParentFallbackScope|undefined):Promise<boolean>=>{
  const current=()=>operation===epoch&&accepts(origin);
  const wait=async<T>(promise:Promise<T>):Promise<{valid:true;value:T}|{valid:false}>=>{
   try{const value=await promise;return current()?{valid:true,value}:{valid:false};}
   catch(error){if(!current())return {valid:false};throw error;}
  };
  if(settled.aborted){invalidate("aborted");return false;}
  const category=classifyLastAssistantFailure(messages);
  if(category===undefined){invalidate("success");return false;}
  if(!shouldFallback(category)||!current())return false;
  const identityResult=await wait(currentIdentity(context));if(!identityResult.valid||!identityResult.value)return false;
  const identity=identityResult.value;if(bindingRequired&&!sameScope(identity,origin))return false;
  const activeModel=host.currentModel(context);if(!current())return false;
  let activeEpisode=episode,activeEpisodeIdentity=episodeIdentity,activeEpisodeThinking=episodeThinking;
  if(!activeEpisode){
   const chainResult=await wait(Promise.resolve(host.loadChain(identity.profile,context)));if(!chainResult.valid||chainResult.value.length===0)return false;
   activeEpisode=new ModelFallbackEpisode(identity.profile,activeModel,chainResult.value,{cooldown,...(host.clock?{clock:host.clock}:{})});
   activeEpisodeIdentity={...identity};activeEpisodeThinking=host.getThinking?.();if(!current())return false;
   episode=activeEpisode;episodeIdentity=activeEpisodeIdentity;episodeThinking=activeEpisodeThinking;
  }
  if(!activeEpisodeIdentity||!sameIdentity(identity,activeEpisodeIdentity)){invalidate("aborted");return false;}
  if(activeModel){if(!current())return false;activeEpisode.markTried(activeModel);cooldown.mark(activeModel,category,host.clock?.());}
  for(;;){
   if(!current())return false;
   const pick=activeEpisode.pick();if(!pick?.fallback||!pick.model)return false;
   activeEpisode.markTried(pick.model);if(!current())return false;
   const found=host.findModel?.(pick.model,context);if(!current())return false;
   if(!found||modelRef(found)!==pick.model)continue;
   const source=activeModel?host.findModel?.(activeModel,context):undefined;if(!current())return false;
   const beforeResult=await wait(currentIdentity(context));if(!beforeResult.valid)return false;
   if(!sameIdentity(beforeResult.value,activeEpisodeIdentity)){invalidate("aborted");return false;}
   const switchedResult=await wait(Promise.resolve(host.setModel?.(found,context)).catch(()=>false));if(!switchedResult.valid)return false;
   if(!switchedResult.value)continue;
   const afterResult=await wait(currentIdentity(context));if(!afterResult.valid)return false;
   if(!sameIdentity(afterResult.value,activeEpisodeIdentity)){invalidate("aborted");return false;}
   const level=pick.thinking??activeEpisodeThinking;if(!current())return false;
   if(level)try{host.setThinking?.(level);}catch{/* The successful model switch remains authoritative. */}
   if(!current())return false;
   const change:ModelFallbackChange={agent:"ASEN",from:activeModel??"default",to:pick.model,category};
   const pricing={...(source?.cost?{from:source.cost}:{}),...(found.cost?{to:found.cost}:{})};
   host.notify?.(change,pricing,context);if(!current())return false;
   const continuationResult=await wait(currentIdentity(context));if(!continuationResult.valid)return false;
   if(!sameIdentity(continuationResult.value,activeEpisodeIdentity)){invalidate("aborted");return false;}
   host.followUp?.(formatModelFallbackContinuation(change),context);
   return true;
  }
 };
 return Object.freeze({
  activate(scope:ParentFallbackScope|undefined){bindingRequired=true;invalidate("aborted");activeScope=validScope(scope)?{...scope}:undefined;},
  onAgentEnd(event:{messages?:readonly unknown[]}|undefined,scope?:ParentFallbackScope){
   if(!accepts(scope))return;lastScope=scope?{...scope}:undefined;lastMessages=Array.isArray(event?.messages)?[...event.messages]:[];
  },
  onAgentSettled(event:{aborted?:boolean}={},context?:unknown,scope?:ParentFallbackScope){
   if(!accepts(scope))return Promise.resolve(false);
   if(event.aborted){invalidate("aborted");return Promise.resolve(false);}
   if(inFlight)return Promise.resolve(false);
   if(bindingRequired&&!sameScope(lastScope,scope))return Promise.resolve(false);
   const messages=lastMessages,origin=lastScope;lastMessages=[];lastScope=undefined;
   if(messages.length===0)return Promise.resolve(false);
   const operation=epoch,pending=run(messages,event,context,operation,origin);inFlight=pending;
   return pending.finally(()=>{if(inFlight===pending)inFlight=undefined;});
  },
  clear(){invalidate("aborted");},
 });
}
