/** Adapta exclusivamente solicitudes de revisión sin herramientas a NVIDIA.
 * No obtiene claves, no hace red, no transforma mensajes del asistente
 * ni modifica permisos; conserva intacto el identificador del modelo.
 */
import type {ExtensionAPI} from "@earendil-works/pi-coding-agent";

const modelos=new Set([
 "nvidia/nemotron-3.5-bolt-e4b",
 "nvidia/nemotron-3.5-super-vl-120b-a12b"
]);
const objeto=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==="object"&&!Array.isArray(v);
export function normalizarSolicitudNvidia(
 payload:unknown,provider:unknown,model:unknown
):boolean{
 if(provider!=="nvidia"||typeof model!=="string"||!modelos.has(model))
  return false;
 if(!objeto(payload)||payload.model!==model||!Array.isArray(payload.messages)||
  payload.messages.length<1||payload.messages.length>64)
  throw Error("NVIDIA: solicitud no verificable");
 for(const msg of payload.messages){
  if(!objeto(msg)||typeof msg.role!=="string")
   throw Error("NVIDIA: mensaje inesperado");
  if(Array.isArray(msg.content)){
   if(msg.content.length>64||!msg.content.every(c=>
    objeto(c)&&c.type==="text"&&typeof c.text==="string"&&c.text.length<=48_000))
    throw Error("NVIDIA: formato de contenido no autorizado");
   msg.content=msg.content.map(c=>(c as {text:string}).text).join("\n");
  }
  if(typeof msg.content!=="string")
   throw Error("NVIDIA: solo texto de revisión");
 }
 if(payload.tools!==undefined){
  if(!Array.isArray(payload.tools)||payload.tools.length>0)
   throw Error("NVIDIA: herramientas prohibidas para juez");
  delete payload.tools;
 }
 delete payload.tool_choice;
 delete payload.parallel_tool_calls;
 delete payload.reasoning_effort;
 delete payload.max_completion_tokens;
 delete payload.stream_options;
 if(payload.thinking!==undefined)delete payload.thinking;
 const existing=payload.max_tokens;
 if(existing!==undefined&&(typeof existing!=="number"||!Number.isFinite(existing)||existing<1))
  throw Error("NVIDIA: límite de tokens inválido");
 payload.max_tokens=Math.min(existing??1200,1200);
 return true;
}
export default function(pi:ExtensionAPI):void{
 pi.on("before_provider_request",(event,ctx)=>{
  const model=ctx.model;
  if(model?.provider!=="nvidia")return;
  normalizarSolicitudNvidia(event.payload,model.provider,model.id);
 });
}
