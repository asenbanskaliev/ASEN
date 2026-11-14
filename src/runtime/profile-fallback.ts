import {isThinking,type Thinking} from "./profiles.js";

export const MAX_PROFILE_FALLBACK_MODELS=8;
export type FallbackCost="included"|"paid"|"unknown";
export interface ProfileFallbackCandidate{model:string;thinking?:Thinking}
export interface FallbackCooldowns{readonly [model:string]:number}
const validModel=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=256&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
function checkedNow(value:number):void{if(!Number.isSafeInteger(value)||value<0)throw new Error("Invalid fallback clock");}
function checkedCooldowns(value:FallbackCooldowns|undefined):void{
 if(value===undefined)return;
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid fallback cooldown state");
 for(const [model,until] of Object.entries(value))if(!validModel(model)||!Number.isSafeInteger(until)||until<0)throw new Error("Invalid fallback cooldown state");
}
function normalizeCandidate(value:string|ProfileFallbackCandidate):ProfileFallbackCandidate{
 if(typeof value==="string"){if(!validModel(value))throw new Error("Invalid fallback model");return {model:value};}
 if(!value||typeof value!=="object"||!validModel(value.model))throw new Error("Invalid fallback model");
 if(value.thinking!==undefined&&!isThinking(value.thinking))throw new Error("Invalid fallback thinking level");
 return value.thinking===undefined?{model:value.model}:{model:value.model,thinking:value.thinking};
}
/**
 * Prepares the primary followed by the configured chain. The configured chain,
 * not the primary-plus-chain union, is bounded to eight entries.
 */
export function buildProfileFallbackChain(primary:string|undefined,fallbacks:readonly (string|ProfileFallbackCandidate)[]):readonly ProfileFallbackCandidate[]{
 if(!Array.isArray(fallbacks))throw new Error("Invalid fallback model list");
 if(fallbacks.length>MAX_PROFILE_FALLBACK_MODELS)throw new Error("Fallback chain exceeds the eight-model limit");
 if(primary!==undefined&&!validModel(primary))throw new Error("Invalid fallback model");
 const configured=fallbacks.map(normalizeCandidate),seen=new Set<string>();
 for(const candidate of configured){if(seen.has(candidate.model))throw new Error("duplicate fallback model");seen.add(candidate.model);}
 // The reference picker skips a configured step that is already the primary.
 const candidates=[...(primary===undefined?[]:[{model:primary}]),...configured.filter(candidate=>candidate.model!==primary)];
 return Object.freeze(candidates.map(candidate=>Object.freeze({...candidate})));
}
/** Returns a new cooldown map and never shortens an existing cooldown. */
export function recordProfileFallbackCooldown(cooldowns:FallbackCooldowns,model:string,until:number):FallbackCooldowns{
 if(!validModel(model))throw new Error("Invalid fallback model");checkedNow(until);checkedCooldowns(cooldowns);
 const current=Object.hasOwn(cooldowns,model)?cooldowns[model]!:0;
 return Object.freeze({...cooldowns,[model]:Math.max(current,until)});
}
export interface SelectProfileFallbackOptions{
 candidates:readonly ProfileFallbackCandidate[];
 /** Models already attempted in this episode, including the model that just failed. */
 attemptedModels:readonly string[];
 cooldowns?:FallbackCooldowns;
 now:number;
 /** Optional display-only catalog classification; it never gates a configured route. */
 classifyCost?:(model:string)=>FallbackCost;
 /** Retained for source compatibility only; configured fallbacks do not prompt per switch. */
 confirmHuman?:(model:string,cost:Exclude<FallbackCost,"included">)=>Promise<boolean>;
 isCurrent?:()=>boolean;
 signal?:AbortSignal;
}
export type ProfileFallbackSelection=
 |({status:"selected";model:string;cost:FallbackCost}&Partial<Pick<ProfileFallbackCandidate,"thinking">>)
 |{status:"unavailable";reason:"empty"|"cooldown"|"exhausted"}
 |{status:"blocked";reason:"stale"|"cancelled"|"attempt-state-unknown"};
function current(options:SelectProfileFallbackOptions):boolean{
 if(options.signal?.aborted)return false;
 try{return options.isCurrent===undefined||options.isCurrent()===true;}catch{return false;}
}
/** Selects a configured route only; it never invokes a provider or persists configuration. */
export async function selectProfileFallback(options:SelectProfileFallbackOptions):Promise<ProfileFallbackSelection>{
 checkedNow(options.now);checkedCooldowns(options.cooldowns);
 if(!Array.isArray(options.candidates)||options.candidates.length>MAX_PROFILE_FALLBACK_MODELS+1)throw new Error("Fallback chain exceeds the eight-model limit");
 if(!Array.isArray(options.attemptedModels)||options.attemptedModels.length>MAX_PROFILE_FALLBACK_MODELS+1)return {status:"blocked",reason:"attempt-state-unknown"};
 const attempted=new Set<string>();
 for(const model of options.attemptedModels){if(!validModel(model)||attempted.has(model))return {status:"blocked",reason:"attempt-state-unknown"};attempted.add(model);}
 const seen=new Set<string>(),candidates:ProfileFallbackCandidate[]=[];
 for(const value of options.candidates){const candidate=normalizeCandidate(value);if(seen.has(candidate.model))throw new Error("duplicate fallback model");seen.add(candidate.model);candidates.push(candidate);}
 const snapshotCandidates=candidates.map(candidate=>({...candidate}));
 const snapshotAttempts=[...options.attemptedModels];
 const snapshotCooldowns=Object.entries(options.cooldowns??{}).sort(([a],[b])=>a.localeCompare(b));
 const at=options.now,classify=options.classifyCost,isCurrent=options.isCurrent,signal=options.signal;
 const sameDecision=():boolean=>{
  try{
   if(options.now!==at||options.classifyCost!==classify||options.isCurrent!==isCurrent||options.signal!==signal)return false;
   if(options.candidates.length!==snapshotCandidates.length||options.candidates.some((candidate,index)=>candidate?.model!==snapshotCandidates[index]?.model||candidate?.thinking!==snapshotCandidates[index]?.thinking))return false;
   if(options.attemptedModels.length!==snapshotAttempts.length||options.attemptedModels.some((value,index)=>value!==snapshotAttempts[index]))return false;
   const remaining=Object.entries(options.cooldowns??{}).sort(([a],[b])=>a.localeCompare(b));
   return remaining.length===snapshotCooldowns.length&&remaining.every(([key,value],index)=>key===snapshotCooldowns[index]?.[0]&&value===snapshotCooldowns[index]?.[1]);
  }catch{return false;}
 };
 if(!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
 if(!sameDecision())return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
 if(candidates.length===0)return {status:"unavailable",reason:attempted.size?"exhausted":"empty"};
 let cooled=false,alreadyAttempted=false;
 for(const candidate of candidates){
  if(!sameDecision()||!current(options))return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(attempted.has(candidate.model)){alreadyAttempted=true;continue;}
  if(options.cooldowns&&Object.hasOwn(options.cooldowns,candidate.model)&&options.cooldowns[candidate.model]!>at){cooled=true;continue;}
  let cost:FallbackCost="unknown";
  try{const classified=classify?.(candidate.model);if(classified==="included"||classified==="paid"||classified==="unknown")cost=classified;}catch{/* Unknown catalog price remains eligible. */}
  if(!sameDecision())return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  const active=current(options);
  // The freshness authority is caller code and may mutate route state or abort
  // while returning true. Invoke it once, then validate its effects without
  // recursively calling it at this final selection boundary.
  if(!active||options.signal?.aborted)return {status:"blocked",reason:options.signal?.aborted?"cancelled":"stale"};
  if(!sameDecision())return {status:"blocked",reason:"stale"};
  return candidate.thinking===undefined?{status:"selected",model:candidate.model,cost}:{status:"selected",model:candidate.model,thinking:candidate.thinking,cost};
 }
 return {status:"unavailable",reason:cooled?"cooldown":alreadyAttempted||attempted.size?"exhausted":"empty"};
}
