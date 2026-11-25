import {isProxy} from "node:util/types";
export type PiModelIdentity=Readonly<{id:string;provider:string}>;
export const reviewProvider=/^[a-z0-9][a-z0-9._-]{0,63}$/u;
export const reviewModelId=/^[A-Za-z0-9][A-Za-z0-9_./:@-]{0,190}$/u;
/** Equivalencia conservadora respaldada por los recibos NVIDIA del ensayo E3.
 * No se equiparan familias, versiones, proveedores ni alias desconocidos. */
export function reviewModelIdentityKey(model:PiModelIdentity):string{
 let id=model.id;
 if(model.provider==="nvidia"){
  while(id.startsWith("nvidia/")&&id.length>7)id=id.slice(7);
 }
 return JSON.stringify([model.provider,id]);
}
export type PiReviewIdentity=Readonly<{
 requested:string;selected:string;declaredModel?:string;responseModel?:string;
 status:"declared-match"|"unknown";
}>;
export function inspectReviewIdentity(requested:PiModelIdentity,selected:PiModelIdentity,message:unknown):PiReviewIdentity{
 if(typeof message!=="object"||message===null||isProxy(message))throw Error("Independent review message is invalid");
 const read=(key:string):string|undefined=>{
  const d=Object.getOwnPropertyDescriptor(message,key);
  if(!d)return undefined;
  if(!("value" in d))throw Error("Independent reviewer identity is invalid");
  if(d.value===undefined)return undefined;
  if(typeof d.value!=="string"||!reviewModelId.test(d.value)||d.value.split("/").some((part:string)=>!part||part==="."||part===".."))
   throw Error("Independent reviewer identity is invalid");
  return d.value;
 };
 const provider=read("provider"),model=read("model"),responseModel=read("responseModel");
 const expected=reviewModelIdentityKey(selected);
 const matches=(id:string,isResponse:boolean)=>{
  const raw=isResponse&&selected.provider==="nvidia"&&id.startsWith("private/")?id.slice(8):id;
  return reviewModelIdentityKey({provider:selected.provider,id:raw})===expected;
 };
 if(provider!==undefined&&provider!==selected.provider||model!==undefined&&!matches(model,false)||
  responseModel!==undefined&&!matches(responseModel,true))throw Error("Independent reviewer model identity mismatch");
 return Object.freeze({requested:requested.provider+"/"+requested.id,selected:selected.provider+"/"+selected.id,
  ...(model!==undefined?{declaredModel:model}:{}),...(responseModel!==undefined?{responseModel}:{}),
  status:provider!==undefined&&model!==undefined?"declared-match":"unknown"});
}


/** Identidad de una ruta aprobada, sin equiparar proveedores ni inventar alias. */
export function splitPiModelIdentity(route:string|undefined):PiModelIdentity|undefined{
 if(typeof route!=="string")return;
 const slash=route.indexOf("/"),provider=route.slice(0,slash),id=route.slice(slash+1);
 if(slash<=0||!reviewProvider.test(provider)||!reviewModelId.test(id)||
  id.split("/").some(part=>!part||part==="."||part===".."))return;
 return Object.freeze({provider,id});
}
export type PiChildIdentityObservation=Readonly<{
 requested:string;selected?:string;status:"declared-match"|"unknown"|"incompatible";
 declaredModel?:string;responseModel?:string;
}>;
const childEvidence=new WeakMap<object,readonly PiChildIdentityObservation[]>();
export function bindPiChildIdentityEvidence(result:object,observations:readonly PiChildIdentityObservation[]):void{
 childEvidence.set(result,Object.freeze(observations.map(item=>Object.freeze({...item}))));
}
export function readPiChildIdentityEvidence(result:object):readonly PiChildIdentityObservation[]{
 return childEvidence.get(result)??Object.freeze([]);
}
