import {isThinking,type Thinking} from "./profiles.js";

export const TERMINAL_ERROR_CATEGORY={
 AUTH:"auth",RATE_LIMIT:"rate_limit",QUOTA:"quota",CONTEXT_LENGTH:"context_length",TIMEOUT:"timeout",NETWORK:"network",
 PROVIDER_UNAVAILABLE:"provider_unavailable",INVALID_REQUEST:"invalid_request",UNAVAILABLE:"unavailable",
} as const;
export type TerminalErrorCategory=(typeof TERMINAL_ERROR_CATEGORY)[keyof typeof TERMINAL_ERROR_CATEGORY];

const FALLBACK_CATEGORIES:ReadonlySet<TerminalErrorCategory>=new Set([
 TERMINAL_ERROR_CATEGORY.QUOTA,TERMINAL_ERROR_CATEGORY.AUTH,TERMINAL_ERROR_CATEGORY.RATE_LIMIT,
 TERMINAL_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,TERMINAL_ERROR_CATEGORY.TIMEOUT,TERMINAL_ERROR_CATEGORY.NETWORK,
]);
const EXHAUSTED_CATEGORIES:ReadonlySet<TerminalErrorCategory>=new Set([TERMINAL_ERROR_CATEGORY.QUOTA,TERMINAL_ERROR_CATEGORY.AUTH]);
export const COOLDOWN_MS={exhausted:30*60_000,transient:2*60_000} as const;
export const MAX_CONFIGURED_FALLBACKS=8;

export function shouldFallback(category:TerminalErrorCategory|undefined):boolean{return category!==undefined&&FALLBACK_CATEGORIES.has(category);}

const ERROR_SCAN_MAX=4096;
const ERROR_IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ERROR_KEYWORDS:ReadonlyArray<readonly [TerminalErrorCategory,RegExp]>=[
 [TERMINAL_ERROR_CATEGORY.CONTEXT_LENGTH,/context.?length|context.?window|maximum context|prompt is too long|too many tokens/i],
 [TERMINAL_ERROR_CATEGORY.QUOTA,/quota|billing|out of budget|usage.?limit|credit balance/i],
 [TERMINAL_ERROR_CATEGORY.AUTH,/unauthori[sz]ed|forbidden|authenticat|api.?key|permission.?denied/i],
 [TERMINAL_ERROR_CATEGORY.RATE_LIMIT,/rate.?limit|too many requests/i],
 [TERMINAL_ERROR_CATEGORY.TIMEOUT,/time.?out|timed out|deadline exceeded|ETIMEDOUT/i],
 [TERMINAL_ERROR_CATEGORY.NETWORK,/network|connection|websocket|ECONN(?:RESET|REFUSED|ABORTED)|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|other side closed/i],
 [TERMINAL_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,/overloaded|unavailable|server.?error|internal.?error|server_busy|capacity|high demand/i],
 [TERMINAL_ERROR_CATEGORY.INVALID_REQUEST,/invalid.?request|bad request/i],
];
const HTTP_STATUS=/(?:^\s*|\(|\b(?:status(?:\s+code)?|http)\s*:?\s*)([45]\d\d)(?=[\s):,{]|$)/i;
function statusCategory(status:number):TerminalErrorCategory{
 if(status===401||status===403)return TERMINAL_ERROR_CATEGORY.AUTH;
 if(status===429)return TERMINAL_ERROR_CATEGORY.RATE_LIMIT;
 if(status===408||status===504)return TERMINAL_ERROR_CATEGORY.TIMEOUT;
 return status>=500?TERMINAL_ERROR_CATEGORY.PROVIDER_UNAVAILABLE:TERMINAL_ERROR_CATEGORY.INVALID_REQUEST;
}
function diagnosticCodes(diagnostics:unknown):string[]{
 if(!Array.isArray(diagnostics))return [];
 return diagnostics.slice(0,8).map(entry=>{
  const code=(entry as {error?:{code?:unknown}}|null)?.error?.code;
  return typeof code==="number"?String(code):typeof code==="string"&&ERROR_IDENTIFIER.test(code)?code:"";
 });
}
function categoryFromSignals(message:{errorMessage?:unknown;rawStopReason?:unknown;diagnostics?:unknown}):TerminalErrorCategory{
 const signals=[
  typeof message.errorMessage==="string"?message.errorMessage.slice(0,ERROR_SCAN_MAX):"",
  typeof message.rawStopReason==="string"&&ERROR_IDENTIFIER.test(message.rawStopReason)?message.rawStopReason:"",
  ...diagnosticCodes(message.diagnostics),
 ].filter(signal=>signal.length>0);
 for(const [category,pattern] of ERROR_KEYWORDS)if(signals.some(signal=>pattern.test(signal)))return category;
 for(const signal of signals){const status=HTTP_STATUS.exec(signal)?.[1];if(status)return statusCategory(Number(status));}
 return TERMINAL_ERROR_CATEGORY.UNAVAILABLE;
}
/** Returns only a closed category; scanned provider text is never retained. */
export function classifyAssistantError(message:{stopReason?:unknown;errorMessage?:unknown;rawStopReason?:unknown;diagnostics?:unknown}|undefined):TerminalErrorCategory|undefined{
 return message&&typeof message.stopReason==="string"&&message.stopReason.toLowerCase()==="error"?categoryFromSignals(message):undefined;
}
/** The final assistant message alone decides whether a settled run failed. */
export function classifyLastAssistantFailure(messages:unknown):TerminalErrorCategory|undefined{
 if(!Array.isArray(messages))return undefined;
 for(let index=messages.length-1;index>=0;index-=1){
  const message=messages[index] as {role?:unknown;stopReason?:unknown;errorMessage?:unknown;rawStopReason?:unknown;diagnostics?:unknown}|undefined;
  if(message?.role==="assistant")return classifyAssistantError(message);
 }
 return undefined;
}

export type FallbackClock=()=>number;
function checkedTime(value:number):number{if(!Number.isSafeInteger(value)||value<0)throw new Error("Invalid fallback clock");return value;}
function validModel(value:unknown):value is string{return typeof value==="string"&&value.length>0&&value.length<=256&&value===value.trim()&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);}
export interface ModelFallbackStep{model:string;thinking?:Thinking}
function checkedChain(chain:readonly ModelFallbackStep[]):readonly ModelFallbackStep[]{
 if(!Array.isArray(chain)||chain.length>MAX_CONFIGURED_FALLBACKS)throw new Error("Fallback chain exceeds the eight-model limit");
 const seen=new Set<string>();
 return chain.map(step=>{
  if(!step||typeof step!=="object"||!validModel(step.model))throw new Error("Invalid fallback model");
  if(step.thinking!==undefined&&!isThinking(step.thinking))throw new Error("Invalid fallback thinking level");
  if(seen.has(step.model))throw new Error("duplicate fallback model");seen.add(step.model);
  return step.thinking===undefined?{model:step.model}:{model:step.model,thinking:step.thinking};
 });
}

/** Content-free, process-memory-only cooldown registry. */
export class ModelFallbackCooldown{
 private readonly until=new Map<string,number>();
 private readonly why=new Map<string,TerminalErrorCategory>();
 constructor(private readonly clock:FallbackClock=Date.now){}
 private time(now?:number):number{return checkedTime(now??this.clock());}
 mark(model:string,category:TerminalErrorCategory,now?:number):void{
  if(!validModel(model))throw new Error("Invalid fallback model");
  const at=this.time(now);if(!shouldFallback(category))return;
  const next=at+(EXHAUSTED_CATEGORIES.has(category)?COOLDOWN_MS.exhausted:COOLDOWN_MS.transient),current=this.until.get(model)??0;
  if(next>=current)this.why.set(model,category);
  this.until.set(model,Math.max(current,next));
 }
 available(model:string,now?:number):boolean{
  if(!validModel(model))throw new Error("Invalid fallback model");
  const at=this.time(now),until=this.until.get(model);
  if(until===undefined)return true;
  if(at<until)return false;
  this.until.delete(model);this.why.delete(model);return true;
 }
 reason(model:string,now?:number):TerminalErrorCategory|undefined{
  return this.available(model,now)?undefined:this.why.get(model)??TERMINAL_ERROR_CATEGORY.QUOTA;
 }
 remaining(model:string,now?:number):number{
  if(!validModel(model))throw new Error("Invalid fallback model");
  const at=this.time(now),until=this.until.get(model);
  if(until===undefined)return 0;
  if(at>=until){this.until.delete(model);this.why.delete(model);return 0;}
  return until-at;
 }
 clear(model:string):void{if(!validModel(model))throw new Error("Invalid fallback model");this.until.delete(model);this.why.delete(model);}
 snapshot(now?:number):Readonly<Record<string,{until:number;reason:TerminalErrorCategory}>>{
  const at=this.time(now),result:Record<string,{until:number;reason:TerminalErrorCategory}>={};
  for(const model of [...this.until.keys()].sort())if(!this.available(model,at))result[model]={until:this.until.get(model)!,reason:this.why.get(model)??TERMINAL_ERROR_CATEGORY.QUOTA};
  return Object.freeze(result);
 }
}

const PROCESS_COOLDOWN=Symbol.for("asen.model-fallback.cooldown");
/** One shared registry for parent and child orchestration in this process. */
export function getProcessModelFallbackCooldown():ModelFallbackCooldown{
 // SAFETY: the symbol-keyed slot is private to this module and is assigned only below.
 const host=globalThis as unknown as Record<symbol,ModelFallbackCooldown|undefined>;
 return(host[PROCESS_COOLDOWN]??=new ModelFallbackCooldown());
}

export type FallbackModelPick={model:string|undefined;thinking?:Thinking;fallback:boolean};
export interface PickFallbackModelState{cooldown:ModelFallbackCooldown;now?:number;tried?:ReadonlySet<string>}
/** Primary first, then the first configured step that is neither tried nor cooling. */
export function pickFallbackModel(primary:string|undefined,chain:readonly ModelFallbackStep[],state:PickFallbackModelState):FallbackModelPick|undefined{
 if(primary!==undefined&&!validModel(primary))throw new Error("Invalid fallback model");
 const steps=checkedChain(chain),at=state.now;
 const usable=(model:string)=>!state.tried?.has(model)&&state.cooldown.available(model,at);
 if(primary===undefined?!state.tried?.size:usable(primary))return {model:primary,fallback:false};
 for(const step of steps){if(step.model===primary||!usable(step.model))continue;return step.thinking===undefined?{model:step.model,fallback:true}:{model:step.model,thinking:step.thinking,fallback:true};}
 return undefined;
}

/** Per-run tried state with an immutable profile identity. */
export class ModelFallbackEpisode{
 readonly profile:string|undefined;
 readonly primary:string|undefined;
 readonly chain:readonly ModelFallbackStep[];
 private readonly tried=new Set<string>();
 private readonly cooldown:ModelFallbackCooldown;
 private readonly clock:FallbackClock|undefined;
 constructor(profile:string|undefined,primary:string|undefined,chain:readonly ModelFallbackStep[],options:{cooldown?:ModelFallbackCooldown;clock?:FallbackClock}={}){
  if(profile!==undefined&&(profile.length===0||profile.length>64||!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(profile)))throw new Error("Invalid fallback profile");
  if(primary!==undefined&&!validModel(primary))throw new Error("Invalid fallback model");
  this.profile=profile;this.primary=primary;this.chain=Object.freeze(checkedChain(chain).map(step=>Object.freeze({...step})));
  this.cooldown=options.cooldown??getProcessModelFallbackCooldown();this.clock=options.clock;
  Object.freeze(this);
 }
 pick():FallbackModelPick|undefined{return pickFallbackModel(this.primary,this.chain,{cooldown:this.cooldown,...(this.clock?{now:checkedTime(this.clock())}:{}),tried:this.tried});}
 markTried(model:string):void{if(!validModel(model))throw new Error("Invalid fallback model");this.tried.add(model);}
 triedModels():readonly string[]{return Object.freeze([...this.tried]);}
 clear(outcome:"success"|"aborted"):void{void outcome;this.tried.clear();}
}
