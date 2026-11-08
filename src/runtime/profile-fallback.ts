export const MAX_PROFILE_FALLBACK_MODELS=8;
export type FallbackCost="included"|"paid"|"unknown";
export interface ProfileFallbackCandidate{model:string}
export interface FallbackCooldowns{readonly [model:string]:number}
const validModel=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=256&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function checkedNow(value:number):void{if(!Number.isSafeInteger(value)||value<0)throw new Error("Invalid fallback clock");}
function checkedCooldowns(value:FallbackCooldowns|undefined):void{
 if(value===undefined)return;
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid fallback cooldown state");
 for(const [model,until] of Object.entries(value))if(!validModel(model)||!Number.isSafeInteger(until)||until<0)throw new Error("Invalid fallback cooldown state");
}
/** Pure, ordered route preparation. The primary plus all fallbacks may contain at most eight unique model ids. */
export function buildProfileFallbackChain(primary:string|undefined,fallbacks:readonly string[]):readonly ProfileFallbackCandidate[]{
 if(!Array.isArray(fallbacks))throw new Error("Invalid fallback model list");
 const models=[...(primary===undefined?[]:[primary]),...fallbacks];
 if(models.length>MAX_PROFILE_FALLBACK_MODELS)throw new Error("Fallback chain exceeds the eight-model limit");
 const seen=new Set<string>();
 for(const model of models){if(!validModel(model))throw new Error("Invalid fallback model");if(seen.has(model))throw new Error("duplicate fallback model");seen.add(model);}
 return Object.freeze(models.map(model=>Object.freeze({model})));
}
/** Returns a new cooldown map and never shortens an existing cooldown. */
export function recordProfileFallbackCooldown(cooldowns:FallbackCooldowns,model:string,until:number):FallbackCooldowns{
 if(!validModel(model))throw new Error("Invalid fallback model");checkedNow(until);checkedCooldowns(cooldowns);
 const current=Object.hasOwn(cooldowns,model)?cooldowns[model]!:0;
 return Object.freeze({...cooldowns,[model]:Math.max(current,until)});
}
export interface SelectProfileFallbackOptions{
 candidates:readonly ProfileFallbackCandidate[];
 /** Models already attempted in this task, including the model that just failed. */
 attemptedModels:readonly string[];
 cooldowns?:FallbackCooldowns;
 now:number;
 classifyCost:(model:string)=>FallbackCost;
 confirmHuman?:(model:string,cost:Exclude<FallbackCost,"included">)=>Promise<boolean>;
 isCurrent?:()=>boolean;
 signal?:AbortSignal;
}
export type ProfileFallbackSelection=
 |{status:"selected";model:string;cost:FallbackCost}
 |{status:"unavailable";reason:"empty"|"cooldown"|"exhausted"}
 |{status:"blocked";reason:"consent-required"|"consent-denied"|"stale"|"cancelled"|"cost-unknown"|"attempt-state-unknown"};
function current(options:SelectProfileFallbackOptions):boolean{
 if(options.signal?.aborted)return false;
 try{return options.isCurrent?.()!==false;}catch{return false;}
}
/** Selects a route only; it never invokes a provider or persists profile/configuration data. */
export async function selectProfileFallback(options:SelectProfileFallbackOptions):Promise<ProfileFallbackSelection>{
 checkedNow(options.now);checkedCooldowns(options.cooldowns);
 if(!Array.isArray(options.candidates)||options.candidates.length>MAX_PROFILE_FALLBACK_MODELS)throw new Error("Fallback chain exceeds the eight-model limit");
 if(!Array.isArray(options.attemptedModels)||options.attemptedModels.length>MAX_PROFILE_FALLBACK_MODELS)return {status:"blocked",reason:"attempt-state-unknown"};
 const attempted=new Set<string>();
 for(const model of options.attemptedModels){if(!validModel(model)||attempted.has(model))return {status:"blocked",reason:"attempt-state-unknown"};attempted.add(model);}
 const seen=new Set<string>();
 for(const candidate of options.candidates){
  if(!candidate||typeof candidate!=="object"||!validModel(candidate.model))throw new Error("Invalid fallback model");
  if(seen.has(candidate.model))throw new Error("duplicate fallback model");seen.add(candidate.model);
 }
 if(new Set([...attempted,...seen]).size>MAX_PROFILE_FALLBACK_MODELS)throw new Error("Fallback chain exceeds the eight-model limit");
 if(!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
 if(options.candidates.length===0)return {status:"unavailable",reason:attempted.size?"exhausted":"empty"};
 let cooled=false,alreadyAttempted=false;
 for(const candidate of options.candidates){
  if(attempted.has(candidate.model)){alreadyAttempted=true;continue;}
  if(options.cooldowns&&Object.hasOwn(options.cooldowns,candidate.model)&&options.cooldowns[candidate.model]!>options.now){cooled=true;continue;}
  let cost:FallbackCost;
  try{cost=options.classifyCost(candidate.model);}catch{return {status:"blocked",reason:"cost-unknown"};}
  if(cost!=="included"&&cost!=="paid"&&cost!=="unknown")return {status:"blocked",reason:"cost-unknown"};
  if(cost==="included")return current(options)?{status:"selected",model:candidate.model,cost}:{status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(typeof options.confirmHuman!=="function")return {status:"blocked",reason:"consent-required"};
  let approved=false;try{approved=await options.confirmHuman(candidate.model,cost)==true;}catch{return {status:"blocked",reason:"consent-denied"};}
  if(!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(!approved)return {status:"blocked",reason:"consent-denied"};
  return {status:"selected",model:candidate.model,cost};
 }
 return {status:"unavailable",reason:cooled?"cooldown":alreadyAttempted||attempted.size?"exhausted":"empty"};
}
