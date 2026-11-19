import type {ParentCatalogModel} from "./parent-model-fallback.js";
import type {RouteChoice,Thinking} from "./profiles.js";
import {isThinking} from "./profiles.js";

export type StartupModelOutcome =
 | "applied" | "already-selected" | "host-accepted-unverified"
 | "not-new" | "child" | "not-empty" | "unavailable"
 | "unknown-price" | "model-missing" | "invalid-model"
 | "credentials-refused" | "session-changed";

export interface StartupModelRequest{
 reason:unknown;
 isChild:boolean;
 entries?:()=>readonly unknown[]|undefined;
 choice?:RouteChoice;
 currentModel?:()=>ParentCatalogModel|undefined;
 findModel?:(provider:string,id:string)=>ParentCatalogModel|undefined;
 setModel?:(model:ParentCatalogModel)=>boolean|Promise<boolean>;
 setThinking?:(level:Thinking)=>void;
 stillOwned:()=>boolean;
}

/** Precios del catálogo: sin cuatro tarifas comprobadas no se presume gratuidad. */
export function catalogListsZeroCost(model:ParentCatalogModel|undefined):boolean{
 if(!model?.cost||typeof model.cost!=="object")return false;
 const fields=["input","output","cacheRead","cacheWrite"] as const;
 // Un campo nuevo o ausente representa un coste desconocido: no se presume cero.
 return Object.keys(model.cost).length===fields.length&&
  fields.every(field=>model.cost?.[field]===0);
}

/** Inicio propio de Pi: nunca cambia un modelo en una sesión reanudada, hija o con historial. */
export async function applyStartupOrchestratorModel(input:StartupModelRequest):Promise<StartupModelOutcome>{
 if(input.reason!=="new"&&input.reason!=="startup")return "not-new";
 if(input.isChild)return "child";
 if(!input.stillOwned())return "session-changed";
 let entries:readonly unknown[]|undefined;
 try{entries=input.entries?.();}catch{return "not-empty";}
 if(!Array.isArray(entries)||entries.length!==0)return "not-empty";
 const target=input.choice?.model;
 if(target===undefined)return "unavailable";
 if(typeof target!=="string"||target.trim()!==target||target.length>256||
    target.includes("\n")||target.includes("\r"))return "invalid-model";
 const sep=target.indexOf("/");
 if(sep<1||sep===target.length-1)return "invalid-model";
 const current=input.currentModel?.();
 if(current&&`${current.provider}/${current.id}`===target){
  if(input.choice?.thinking!==undefined&&isThinking(input.choice.thinking)&&input.stillOwned()){
   try{input.setThinking?.(input.choice.thinking);}catch{/* No se promete nivel de esfuerzo si el host lo rechaza. */}
  }
  return "already-selected";
 }
 const desired=input.findModel?.(target.slice(0,sep),target.slice(sep+1));
 if(!desired||`${desired.provider}/${desired.id}`!==target)return "model-missing";
 if(!catalogListsZeroCost(desired))return "unknown-price";
 if(!input.setModel)return "unavailable";
 if(!input.stillOwned())return "session-changed";
 let applied=false;
 try{applied=await input.setModel(desired)===true;}catch{return "credentials-refused";}
 if(!input.stillOwned())return "session-changed";
 if(!applied)return "credentials-refused";
 const observed=input.currentModel?.();
 if(!observed||`${observed.provider}/${observed.id}`!==target)return "host-accepted-unverified";
 if(input.choice?.thinking!==undefined&&isThinking(input.choice.thinking)){
  try{input.setThinking?.(input.choice.thinking);}catch{/* Pi puede limitar el esfuerzo del modelo elegido. */}
 }
 return "applied";
}
