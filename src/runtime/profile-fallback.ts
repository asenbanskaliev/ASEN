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
 const models:string[]=[];
 for(const candidate of options.candidates){
  if(!candidate||typeof candidate!=="object"||!validModel(candidate.model))throw new Error("Invalid fallback model");
  const model=candidate.model;
  if(seen.has(model))throw new Error("duplicate fallback model");seen.add(model);models.push(model);
 }
 if(new Set([...attempted,...seen]).size>MAX_PROFILE_FALLBACK_MODELS)throw new Error("Fallback chain exceeds the eight-model limit");
 // The caller owns these mutable objects. A consent granted while an await is pending
 // cannot authorize a changed route, retry history, cooldown, or decision callback.
 const tried=[...options.attemptedModels],cooldownEntries=Object.entries(options.cooldowns??{}).sort(([a],[b])=>a.localeCompare(b));
 const at=options.now, classify=options.classifyCost, confirm=options.confirmHuman, isCurrent=options.isCurrent, signal=options.signal;
 const sameDecision=():boolean=>{
  try{
   if(options.now!==at||options.classifyCost!==classify||options.confirmHuman!==confirm||options.isCurrent!==isCurrent||options.signal!==signal)return false;
   if(options.candidates.length!==models.length||options.candidates.some((candidate,index)=>candidate?.model!==models[index]))return false;
   if(options.attemptedModels.length!==tried.length||options.attemptedModels.some((value,index)=>value!==tried[index]))return false;
   const remaining=Object.entries(options.cooldowns??{}).sort(([a],[b])=>a.localeCompare(b));
   return remaining.length===cooldownEntries.length&&remaining.every(([key,value],index)=>key===cooldownEntries[index]?.[0]&&value===cooldownEntries[index]?.[1]);
  }catch{return false;}
 };
 if(!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
 if(options.candidates.length===0)return {status:"unavailable",reason:attempted.size?"exhausted":"empty"};
 let cooled=false,alreadyAttempted=false;
 for(const model of models){
  if(!sameDecision()||!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(attempted.has(model)){alreadyAttempted=true;continue;}
  if(options.cooldowns&&Object.hasOwn(options.cooldowns,model)&&options.cooldowns[model]!>at){cooled=true;continue;}
  let cost:FallbackCost;
  try{cost=classify(model);}catch{return {status:"blocked",reason:"cost-unknown"};}
  if(!sameDecision())return {status:"blocked",reason:"stale"};
  if(cost!=="included"&&cost!=="paid")return {status:"blocked",reason:"cost-unknown"};
  if(cost==="included")return current(options)?{status:"selected",model,cost}:{status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(typeof confirm!=="function")return {status:"blocked",reason:"consent-required"};
  let approved=false;try{approved=(await confirm(model,cost))===true;}catch{return {status:"blocked",reason:"consent-denied"};}
  if(!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(!sameDecision())return {status:"blocked",reason:"stale"};
  if(!approved)return {status:"blocked",reason:"consent-denied"};
  // Recheck trusted cost classification at the decision boundary; a changed
  // classification cannot inherit the prior consent.
  try{if(classify(model)!==cost)return {status:"blocked",reason:"cost-unknown"};}catch{return {status:"blocked",reason:"cost-unknown"};}
  return {status:"selected",model,cost};
 }
 return {status:"unavailable",reason:cooled?"cooldown":alreadyAttempted||attempted.size?"exhausted":"empty"};
}
