import type {TerminalErrorCategory} from "./model-fallback-policy.js";

export const MODEL_FALLBACK_NOTICE_ENTRY="asen.model-fallback/v1" as const;
export interface ModelFallbackChange{agent:string;from:string;to:string;category:TerminalErrorCategory}
export interface ModelCatalogRates{input?:number;output?:number;cacheRead?:number;cacheWrite?:number}
export interface ModelFallbackCatalogPricing{from?:ModelCatalogRates;to?:ModelCatalogRates}

const REASON:Partial<Record<TerminalErrorCategory,string>>={
 quota:"a usage limit",auth:"an authentication error",rate_limit:"a rate limit",
 provider_unavailable:"provider unavailability",timeout:"a timeout",network:"a network error",
};
function bounded(value:string,max=256):string{
 const clean=value.replace(/[\u0000-\u001f\u007f-\u009f]/gu," ").replace(/\s+/gu," ").trim();
 return (clean||"unknown").slice(0,max);
}
function ratesTotal(rates:ModelCatalogRates|undefined):number|undefined{
 if(!rates)return undefined;
 const values=[rates.input,rates.output,rates.cacheRead,rates.cacheWrite].filter((value):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=0);
 return values.length?values.reduce((sum,value)=>sum+value,0):undefined;
}
function priceText(pricing:ModelFallbackCatalogPricing|undefined):string{
 const from=ratesTotal(pricing?.from),to=ratesTotal(pricing?.to);
 if(from===undefined||to===undefined)return "Catalog pricing is unavailable for one or both models; actual billing and subscription inclusion are unknown.";
 if(from===0||to===0)return "One or both catalog rate totals are listed as zero; actual billing and subscription inclusion are unknown.";
 const ratio=Math.round((to/from)*10)/10;
 return `The target model's listed catalog rate total is ${ratio.toFixed(1)}x the source model's; actual billing and subscription inclusion are unknown.`;
}

/** Human-facing post-switch notice. It never treats catalog rates as billing evidence. */
export function formatModelFallbackNotice(change:ModelFallbackChange,pricing?:ModelFallbackCatalogPricing):string{
 const agent=bounded(change.agent,64),from=bounded(change.from),to=bounded(change.to),reason=REASON[change.category]??bounded(change.category,64);
 return `${agent}: switched parent from ${from} to ${to} after ${reason}. ${priceText(pricing)}`.slice(0,768);
}

/** Structured continuation text; provider diagnostics are intentionally absent. */
export function formatModelFallbackContinuation(change:ModelFallbackChange):string{
 const from=bounded(change.from),to=bounded(change.to),category=bounded(change.category,64);
 return `ASEN switched the parent model from ${from} to ${to} after a provider failure (${category}). Continue the same task from the last completed step; do not repeat completed work.`.slice(0,768);
}

/** Bounded generic diagnostic; raw thrown/provider text is never included. */
export function formatModelFallbackFailureNotice():string{return "ASEN parent model fallback could not complete safely; the current task was not continued automatically.";}
