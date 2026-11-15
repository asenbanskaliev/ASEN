/**
 * P30 provider catalog registry: the data half of the v4.8.0 `nan-provider` surface.
 * This module owns no host integration - it never calls `pi.registerProvider`, never
 * reads credentials, and never observes requests. Registration is validated, cloned,
 * and frozen so a later caller mutation cannot alter an already-published catalog.
 */

export interface ThinkingLevelMap{readonly [level:string]:string|null}

export interface ProviderModel{
 readonly id:string;
 readonly name:string;
 readonly contextWindow:number;
 readonly maxTokens:number;
 readonly reasoning?:boolean;
 readonly thinkingLevelMap?:ThinkingLevelMap;
 readonly input?:readonly("text"|"image")[];
 readonly compat?:{readonly maxTokensField?:string};
}

export interface ProviderAuth{
 readonly type:"api_key"|"oauth"|"none";
 readonly name?:string;
}

export interface ProviderConfig{
 readonly id:string;
 readonly name:string;
 readonly baseUrl:string;
 readonly api:string;
 readonly auth:ProviderAuth;
 readonly models:readonly ProviderModel[];
}

export interface ProviderRegistry{
 register(config:ProviderConfig):void;
 unregister(id:string):boolean;
 get(id:string):ProviderConfig|undefined;
 list():readonly ProviderConfig[];
 findModel(providerId:string,modelId:string):(ProviderModel&{providerId:string;baseUrl:string})|undefined;
 getAllModels():ReadonlyArray<{provider:ProviderConfig;model:ProviderModel}>;
 has(id:string):boolean;
}

const AUTH_TYPES:ReadonlySet<string>=new Set(["api_key","oauth","none"]);
const INPUT_KINDS:ReadonlySet<string>=new Set(["text","image"]);

function checkedText(value:unknown,label:string):string{
 if(typeof value!=="string"||value.length===0||value!==value.trim())throw new TypeError(`Provider ${label} must be a non-empty string`);
 return value;
}
function checkedCount(value:unknown,label:string):number{
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<=0)throw new TypeError(`Provider ${label} must be a positive integer`);
 return value;
}

function cloneThinkingLevelMap(value:unknown):ThinkingLevelMap{
 if(!value||typeof value!=="object")throw new TypeError("Provider thinking level map must be an object");
 for(const [level,tier] of Object.entries(value as Record<string,unknown>)){
  checkedText(level,"thinking level");
  if(tier!==null&&typeof tier!=="string")throw new TypeError("Provider thinking tier must be a string or null");
 }
 // The catalog map is caller-owned structured data; deep-copy it before freezing.
 return Object.freeze(structuredClone(value) as ThinkingLevelMap);
}

function cloneInput(value:unknown):readonly("text"|"image")[]{
 if(!Array.isArray(value))throw new TypeError("Provider input kinds must be an array");
 const kinds:("text"|"image")[]=[];
 for(const kind of value){
  if(typeof kind!=="string"||!INPUT_KINDS.has(kind))throw new TypeError("Provider input kind must be text or image");
  const normalized=kind as"text"|"image";
  if(!kinds.includes(normalized))kinds.push(normalized);
 }
 return Object.freeze(kinds);
}

function cloneCompat(value:unknown):{readonly maxTokensField?:string}{
 if(!value||typeof value!=="object")throw new TypeError("Provider compatibility entry must be an object");
 const compat=value as {maxTokensField?:unknown};
 if(compat.maxTokensField===undefined)return Object.freeze({});
 return Object.freeze({maxTokensField:checkedText(compat.maxTokensField,"compatibility field")});
}

function cloneModel(value:unknown):ProviderModel{
 if(!value||typeof value!=="object")throw new TypeError("Provider model must be an object");
 const model=value as {id?:unknown;name?:unknown;contextWindow?:unknown;maxTokens?:unknown;reasoning?:unknown;thinkingLevelMap?:unknown;input?:unknown;compat?:unknown};
 const clone:Record<string,unknown>={
  id:checkedText(model.id,"model id"),
  name:checkedText(model.name,"model name"),
  contextWindow:checkedCount(model.contextWindow,"context window"),
  maxTokens:checkedCount(model.maxTokens,"maximum tokens"),
 };
 if(model.reasoning!==undefined){
  if(typeof model.reasoning!=="boolean")throw new TypeError("Provider reasoning flag must be a boolean");
  clone.reasoning=model.reasoning;
 }
 if(model.thinkingLevelMap!==undefined)clone.thinkingLevelMap=cloneThinkingLevelMap(model.thinkingLevelMap);
 if(model.input!==undefined)clone.input=cloneInput(model.input);
 if(model.compat!==undefined)clone.compat=cloneCompat(model.compat);
 // SAFETY: every required ProviderModel field above is assigned from a checked value,
 // so the frozen record already satisfies the interface even though its static type is wider.
 return Object.freeze(clone) as unknown as ProviderModel;
}

function cloneAuth(value:unknown):ProviderAuth{
 if(!value||typeof value!=="object")throw new TypeError("Provider auth must be an object");
 const auth=value as {type?:unknown;name?:unknown};
 if(typeof auth.type!=="string"||!AUTH_TYPES.has(auth.type))throw new TypeError("Provider auth type must be api_key, oauth, or none");
 if(auth.name===undefined)return Object.freeze({type:auth.type as ProviderAuth["type"]});
 return Object.freeze({type:auth.type as ProviderAuth["type"],name:checkedText(auth.name,"auth name")});
}

function cloneConfig(config:ProviderConfig):ProviderConfig{
 if(!config||typeof config!=="object")throw new TypeError("Provider configuration must be an object");
 if(!Array.isArray(config.models))throw new TypeError("Provider models must be an array");
 const models:ProviderModel[]=[];
 for(const model of config.models)models.push(cloneModel(model));
 if(models.length===0)throw new TypeError("Provider configuration requires at least one model");
 return Object.freeze({
  id:checkedText(config.id,"id"),
  name:checkedText(config.name,"name"),
  baseUrl:checkedText(config.baseUrl,"baseUrl"),
  api:checkedText(config.api,"api"),
  auth:cloneAuth(config.auth),
  models:Object.freeze(models),
 });
}

/** Process-local provider catalog. Registration replaces by id, so the last writer owns that slot. */
export function createProviderRegistry():ProviderRegistry{
 const providers=new Map<string,ProviderConfig>();
 const registry:ProviderRegistry={
  register(config){
   const clone=cloneConfig(config);
   providers.set(clone.id,clone);
  },
  unregister(id){return providers.delete(id);},
  get(id){return providers.get(id);},
  list(){return Object.freeze([...providers.values()]);},
  findModel(providerId,modelId){
   const provider=providers.get(providerId);
   if(!provider)return undefined;
   const model=provider.models.find(candidate=>candidate.id===modelId);
   if(!model)return undefined;
   return Object.freeze({...cloneModel(model),providerId:provider.id,baseUrl:provider.baseUrl});
  },
  getAllModels(){
   const pairs:{provider:ProviderConfig;model:ProviderModel}[]=[];
   for(const provider of providers.values())for(const model of provider.models)pairs.push(Object.freeze({provider,model}));
   return Object.freeze(pairs);
  },
  has(id){return providers.has(id);},
 };
 return Object.freeze(registry);
}
