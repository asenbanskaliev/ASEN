/** Hechos mínimos y cerrados de un error 400/422 de un proveedor.
 * No se expone texto del modelo, cabeceras, mensajes de error ni credenciales. */
import {classifyAssistantError} from "../lifecycle/model-fallback-policy.js";

const fields=new Set([
 "model","messages","temperature","top_p","max_tokens","max_completion_tokens",
 "min_tokens","min_p","thinking","enable_thinking","reasoning_effort",
 "response_format","tools","tool_choice","parallel_tool_calls",
 "stream","stream_options","presence_penalty","frequency_penalty",
 "repetition_penalty","stop","seed","n","logprobs","top_logprobs",
 "chat_template_kwargs"
]);
export interface PiInvalidRequestFacts {
 readonly providerCategory:"invalid_request";
 readonly rejectedParameter:string;
 readonly httpStatus:number|null;
}
const object=(v:unknown):v is Record<string,unknown> =>
 v!==null&&typeof v==="object"&&!Array.isArray(v);
const known=(v:unknown):string =>
 typeof v==="string"&&fields.has(v) ? v : "unknown";
const http=(v:unknown):number|null =>
 (v===400||v===422)?v:null;
export function summarizePiInvalidRequest(message:unknown):PiInvalidRequestFacts|null{
 if(!object(message)||classifyAssistantError(message)!=="invalid_request")return null;
 let parameter="unknown",status:number|null=null;
 const diagnostics=Array.isArray(message.diagnostics)?message.diagnostics.slice(0,8):[];
 for(const item of diagnostics){
  if(!object(item))continue;
  const error=object(item.error)?item.error:item;
  if(parameter==="unknown")parameter=known(error.param??error.parameter??error.field);
  status??=http(error.status??item.status);
 }
 const raw=typeof message.errorMessage==="string"?message.errorMessage.slice(0,4096):"";
 if(parameter==="unknown"){
  const patterns=[
   /["']?param(?:eter)?["']?\s*[:=]\s*["']([a-z][a-z0-9_]*)["']/iu,
   /\b(?:invalid|unsupported|unknown)\s+(?:parameter|param|field)\s+["']?([a-z][a-z0-9_]*)/iu,
   /\b(?:parameter|param|field)\s+["']([a-z][a-z0-9_]*)["']/iu
  ];
  for(const pattern of patterns){
   const candidate=pattern.exec(raw)?.[1]?.toLowerCase();
   if(candidate){parameter=known(candidate);break;}
  }
 }
 if(status===null){
  const code=/(?:\bhttp\b|\bstatus(?:\s+code)?\b)\s*[:=]?\s*(400|422)\b/iu.exec(raw)?.[1];
  status=code?Number(code):null;
 }
 return Object.freeze({providerCategory:"invalid_request",rejectedParameter:parameter,httpStatus:status});
}
