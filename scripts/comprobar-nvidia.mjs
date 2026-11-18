/** Comprobación manual NVIDIA.
 * Consulta el catálogo y permite como máximo UN intento corto por modelo.
 * Nunca registra claves, prompts ni respuestas del proveedor. */
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";

export const MODELOS_NVIDIA_COMPROBACION=Object.freeze([
 "nvidia/nemotron-3-nano-30b-a3b",
 "nvidia/nemotron-3-super-120b-a12b"
]);
const URL_MODELOS="https://integrate.api.nvidia.com/v1/models";
const URL_CHAT="https://integrate.api.nvidia.com/v1/chat/completions";
const TIMEOUT_CATALOGO=20_000;
const TIMEOUT_MODELO=45_000;
const LIMITE_RESPUESTA=3_000_000;
const claveSegura=clave=>typeof clave==="string"&&clave.length>=16&&clave.length<=512&&
 !/[\r\n]/u.test(clave);
export function clasificarEstadoNvidia(status){
 if(status===401)return "clave-no-autorizada";
 if(status===403)return "acceso-denegado";
 if(status===404)return "modelo-o-ruta-no-disponible";
 if(status===408||status===504)return "tiempo-agotado-servidor";
 if(status===429)return "limite-de-peticiones";
 if(status===503)return "servicio-saturado";
 if(status>=500&&status<=599)return "fallo-del-servidor";
 if(status>=400&&status<=499)return "solicitud-rechazada";
 return "respuesta-no-esperada";
}
const motivoFallo=(error,signal)=>{
 if(signal?.aborted||error?.name==="AbortError"||error?.name==="TimeoutError")return "tiempo-agotado";
 return "fallo-de-conexion";
};
async function leerJsonLimitado(response){
 const declared=Number(response.headers.get("content-length"));
 if(Number.isFinite(declared)&&declared>LIMITE_RESPUESTA)throw Error("respuesta-demasiado-grande");
 if(!response.body)throw Error("respuesta-vacia");
 const reader=response.body.getReader();
 let count=0;
 const partes=[];
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   count+=value.byteLength;
   if(count>LIMITE_RESPUESTA)throw Error("respuesta-demasiado-grande");
   partes.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(count);let pos=0;
 for(const p of partes){bytes.set(p,pos);pos+=p.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
function catalogoValido(x){
 return x&&typeof x==="object"&&Array.isArray(x.data)&&
  x.data.length<=10_000&&x.data.every(m=>m&&typeof m.id==="string"&&m.id.length<=200);
}
function respuestaValida(x){
 return x&&typeof x==="object"&&Array.isArray(x.choices)&&x.choices.length>0&&
  x.choices[0]&&typeof x.choices[0]==="object";
}
function resumenError(motivo){
 return {estado:"no-comprobado",http:null,motivo,respondio:false};
}
/** El resultado contiene solo hechos técnicos, jamás texto de los modelos. */
export async function comprobarNvidia({clave,fetchImpl=fetch}){
 if(!claveSegura(clave))throw Error("Clave NVIDIA ausente o inválida");
 const resultado={
  esquema:"asen.nvidia.disponibilidad/v1",
  prueba:"catalogo-y-una-peticion-corta-por-modelo",
  autorizacionCosto:"explicita-en-la-ejecucion",
  reintentos:0,
  maxTokens:32,
  catalogo:{estado:"no-comprobado",http:null,motivo:null},
  modelos:MODELOS_NVIDIA_COMPROBACION.map(id=>({
   id,apareceEnCatalogo:false,...resumenError("catalogo-no-verificado")
  })),
  completo:false
 };
 const headers={Authorization:"Bearer "+clave};
 let catalogo;
 const ctrl=new AbortController();
 const reloj=setTimeout(()=>ctrl.abort(),TIMEOUT_CATALOGO);
 try{
  const response=await fetchImpl(URL_MODELOS,{
   method:"GET",headers:{...headers,Accept:"application/json"},
   redirect:"error",signal:ctrl.signal
  });
  resultado.catalogo.http=response.status;
  if(!response.ok){
   resultado.catalogo.estado="error-http";
   resultado.catalogo.motivo=clasificarEstadoNvidia(response.status);
   return resultado;
  }
  catalogo=await leerJsonLimitado(response);
  if(!catalogoValido(catalogo)){
   resultado.catalogo.estado="error-formato";
   resultado.catalogo.motivo="catalogo-invalido";
   return resultado;
  }
  resultado.catalogo.estado="correcto";
  resultado.catalogo.motivo=null;
 }catch(error){
  resultado.catalogo.estado="error-conexion";
  resultado.catalogo.motivo=error?.message==="respuesta-demasiado-grande"?
   "respuesta-demasiado-grande":motivoFallo(error,ctrl.signal);
  return resultado;
 }finally{clearTimeout(reloj);}

 const disponibles=new Set(catalogo.data.map(x=>x.id));
 for(let i=0;i<MODELOS_NVIDIA_COMPROBACION.length;i++){
  const id=MODELOS_NVIDIA_COMPROBACION[i];
  const modelo=resultado.modelos[i];
  modelo.apareceEnCatalogo=disponibles.has(id);
  if(!modelo.apareceEnCatalogo){
   modelo.motivo="modelo-no-listado";
   continue;
  }
  const abort=new AbortController();
  const temporizador=setTimeout(()=>abort.abort(),TIMEOUT_MODELO);
  try{
   const response=await fetchImpl(URL_CHAT,{
    method:"POST",redirect:"error",signal:abort.signal,
    headers:{...headers,Accept:"application/json","Content-Type":"application/json"},
    body:JSON.stringify({
     model:id,stream:false,max_tokens:32,
     messages:[{role:"user",content:"Responde solo OK."}]
    })
   });
   modelo.http=response.status;
   if(!response.ok){
    modelo.estado="error-http";
    modelo.motivo=clasificarEstadoNvidia(response.status);
    continue;
   }
   try{
    const data=await leerJsonLimitado(response);
    if(!respuestaValida(data)){
     modelo.estado="error-formato";
     modelo.motivo="respuesta-invalida";
    }else{
     modelo.estado="responde";
     modelo.motivo=null;
     modelo.respondio=true;
    }
   }catch{
    modelo.estado="error-formato";
    modelo.motivo="respuesta-invalida";
   }
  }catch(error){
   modelo.estado="error-conexion";
   modelo.motivo=motivoFallo(error,abort.signal);
  }finally{clearTimeout(temporizador);}
 }
 resultado.completo=resultado.modelos.every(m=>m.respondio===true);
 return resultado;
}
export function autorizarComprobacionNvidia(env){
 return env.GITHUB_ACTIONS==="true"&&
  env.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
  env.GITHUB_ACTOR==="asenbanskaliev"&&
  env.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  env.GITHUB_RUN_ATTEMPT==="1"&&
  /^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")&&
  env.GITHUB_SHA===env.ASEN_NVIDIA_EXPECTED_SHA&&
  env.ASEN_NVIDIA_COST_ACK==="true"&&
  claveSegura(env.NVIDIA_API_KEY);
}
export async function ejecutarComprobacionNvidia(env=process.env){
 if(!autorizarComprobacionNvidia(env))
  throw Error("La comprobación NVIDIA requiere autorización, SHA y primer intento exactos");
 const report=await comprobarNvidia({clave:env.NVIDIA_API_KEY});
 const dest=env.ASEN_NVIDIA_REPORT_PATH;
 if(typeof dest!=="string"||!isAbsolute(dest)||!dest.endsWith("/resultado-nvidia.json"))
  throw Error("Ruta del informe NVIDIA no autorizada");
 mkdirSync(dirname(dest),{recursive:true,mode:0o700});
 writeFileSync(dest,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({catalogo:report.catalogo,modelos:report.modelos,completo:report.completo}));
 if(!report.completo)process.exitCode=1;
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 ejecutarComprobacionNvidia().catch(()=>{
  console.error("Comprobación NVIDIA bloqueada: autorización o ejecución no válida");
  process.exitCode=1;
 });
}
