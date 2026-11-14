/**
 * P30 fast-mode tier policy: the request-shaping half of the v4.8.0 `openai-fast-tier`
 * surface. Eligibility is a closed model-id set; the wire value is "priority" for the
 * fast tier and "default" for the standard tier. This module owns no session, profile,
 * or host-hook state - the caller supplies the effective tier it resolved elsewhere.
 */

export type ServiceTier="standard"|"fast";

const SERVICE_TIERS:ReadonlySet<string>=new Set(["standard","fast"]);
const WIRE_TIER={fast:"priority",standard:"default"} as const;

/** True only for the two closed tier names. */
export function isServiceTier(value:unknown):value is ServiceTier{
 return typeof value==="string"&&SERVICE_TIERS.has(value);
}

export interface FastModeConfig{
 /** Model ids that may carry a service tier. */
 readonly fastModels:ReadonlySet<string>;
 /** The frozen tier a session-starting caller falls back to when no binding exists. */
 readonly defaultTier:ServiceTier;
}

/**
 * A frozen read-only set view. Object.freeze cannot protect Set [[Data]] slots, so the
 * shipped default exposes an immutable view instead of a frozen Set that still accepts add().
 */
function readOnlySet(ids:readonly string[]):ReadonlySet<string>{
 const values=new Set(ids);
 const view:ReadonlySet<string>={
  has:value=>values.has(value),
  get size(){return values.size;},
  forEach(callback:(value:string,value2:string,set:ReadonlySet<string>)=>void,thisArg?:unknown){
   for(const value of values)callback.call(thisArg??view,value,value,view);
  },
  keys(){return values.keys();},
  values(){return values.values();},
  entries(){return values.entries();},
  [Symbol.iterator](){return values[Symbol.iterator]();},
 };
 return Object.freeze(view);
}

/** Mirrors the v4.8.0 FAST_MODELS catalog. */
export const DEFAULT_FAST_MODE_CONFIG:FastModeConfig=Object.freeze({
 fastModels:readOnlySet([
  "gpt-5.6-luna","gpt-5.6-sol","gpt-5.6-terra",
  "gpt-6-astra","gpt-6-sol","gpt-6-luna",
  "gpt-6.1-sol","gpt-6.1-terra",
 ]),
 defaultTier:"standard",
});

function checkedConfig(config:FastModeConfig|undefined):FastModeConfig{
 const candidate=config??DEFAULT_FAST_MODE_CONFIG;
 if(!candidate||typeof candidate!=="object")throw new TypeError("Fast-mode config must be an object");
 if(!isServiceTier(candidate.defaultTier))throw new TypeError("Fast-mode config requires a service tier default");
 // SAFETY: the declared element type is not checkable at this boundary, so the set shape
 // is probed as unknown before any membership read; a malformed config fails closed.
 const models=candidate.fastModels as unknown as {has?:unknown;size?:unknown};
 if(!models||typeof models.has!=="function"||typeof models.size!=="number")throw new TypeError("Fast-mode config requires a model-id set");
 return candidate;
}

/** True when the model id is present in the configured fast-model set. */
export function isFastModeEligible(modelId:string,config?:FastModeConfig):boolean{
 const checked=checkedConfig(config);
 if(typeof modelId!=="string"||modelId.length===0)return false;
 return checked.fastModels.has(modelId);
}

/**
 * The OpenAI `service_tier` wire value for one request, or undefined when no override
 * applies: no explicit tier was resolved, or the model is not fast-mode eligible.
 */
export function resolveServiceTier(modelId:string,tier:ServiceTier|undefined,config?:FastModeConfig):string|undefined{
 if(tier===undefined)return undefined;
 if(!isServiceTier(tier))throw new TypeError("Service tier must be standard or fast");
 return isFastModeEligible(modelId,config)?WIRE_TIER[tier]:undefined;
}

function isPlainObject(payload:Record<string,unknown>|undefined):payload is Record<string,unknown>{
 return typeof payload==="object"&&payload!==null&&!Array.isArray(payload);
}

/**
 * Copy-on-write request shaping: returns a new payload carrying `service_tier`, or
 * undefined when the caller's payload must be kept unchanged. The input is never mutated.
 */
export function applyServiceTier(
 payload:Record<string,unknown>|undefined,
 tier:ServiceTier|undefined,
 modelId:string,
 config?:FastModeConfig,
):Record<string,unknown>|undefined{
 const wire=resolveServiceTier(modelId,tier,config);
 if(wire===undefined||!isPlainObject(payload))return undefined;
 return {...payload,service_tier:wire};
}
