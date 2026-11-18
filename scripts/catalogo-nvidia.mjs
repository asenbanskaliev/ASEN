/** Consulta manual del catálogo NVIDIA.
 * ÚNICO método GET: no ejecuta inferencia ni el código de ningún modelo. */
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,isAbsolute,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const URL_CATALOGO="https://integrate.api.nvidia.com/v1/models";
const LIMITE_BYTES=2_000_000;
const LIMITE_MODELOS=5_000;
const LIMITE_TIEMPO_MS=20_000;
const ID_VALIDO=/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,191}$/u;
const claveValida=x=>typeof x==="string"&&x.length>=16&&x.length<=512&&!/[\r\n]/u.test(x);
const shaValido=x=>typeof x==="string"&&/^[a-f0-9]{40}$/u.test(x);

export function normalizarCatalogoNvidia(data){
 if(!data||typeof data!=="object"||!Array.isArray(data.data)||
  data.data.length>LIMITE_MODELOS)
  throw Error("catalogo-invalido");
 const ids=[];
 const vistos=new Set();
 for(const m of data.data){
  if(!m||typeof m!=="object"||typeof m.id!=="string"||
   !ID_VALIDO.test(m.id)||vistos.has(m.id))
   throw Error("catalogo-invalido");
  vistos.add(m.id);
  ids.push(m.id);
 }
 ids.sort((a,b)=>a<b?-1:a>b?1:0);
 return Object.freeze(ids);
}
function clasificarHTTP(status){
 if(status===401)return "clave-no-autorizada";
 if(status===403)return "acceso-denegado";
 if(status===429)return "limite-de-solicitudes";
 if(status===503)return "servicio-saturado";
 if(status>=500)return "fallo-del-servidor";
 return "respuesta-http-no-valida";
}
async function leerRespuestaLimitada(response){
 const declared=response.headers.get("content-length");
 if(declared!==null&&Number(declared)>LIMITE_BYTES)
  throw Error("respuesta-demasiado-grande");
 if(!response.body)throw Error("respuesta-vacia");
 const stream=response.body.getReader();
 const chunks=[];
 let length=0;
 try{
  for(;;){
   const {value,done}=await stream.read();
   if(done)break;
   length+=value.byteLength;
   if(length>LIMITE_BYTES)throw Error("respuesta-demasiado-grande");
   chunks.push(value);
  }
 }finally{await stream.cancel().catch(()=>{});}
 const buffer=new Uint8Array(length);
 let offset=0;
 for(const part of chunks){buffer.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer));}
 catch{throw Error("catalogo-invalido");}
}
function fallo(error,signal){
 if(signal.aborted||error?.name==="AbortError"||error?.name==="TimeoutError")
  return "tiempo-agotado";
 if(error?.message==="respuesta-demasiado-grande")return "respuesta-demasiado-grande";
 if(error?.message==="catalogo-invalido")return "catalogo-invalido";
 return "fallo-de-conexion";
}
function resultadoBase(){
 return {
  esquema:"asen.nvidia.catalogo-solo-lectura/v1",
  tipo:"catalogo-sin-inferencia",
  generacionSolicitudes:0,
  reintentos:0,
  consultaHttp:null,
  estado:"no-comprobado",
  motivo:null,
  totalModelos:0,
  modelos:[],
  modelosNemotron:[],
  modelosAnterioresPresentes:[],
  completo:false
 };
}
/** El único efecto de red permitido es un GET al catálogo fijo.
 * El modelo de datos no recoge cuerpo HTTP original, prompts ni claves. */
export async function consultarCatalogoNvidia({clave,fetchImpl=fetch}){
 if(!claveValida(clave))throw Error("clave-no-disponible");
 const report=resultadoBase();
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),LIMITE_TIEMPO_MS);
 try{
  const response=await fetchImpl(URL_CATALOGO,{
   method:"GET",
   redirect:"error",
   signal:abort.signal,
   headers:{Authorization:"Bearer "+clave,Accept:"application/json"}
  });
  report.consultaHttp=response.status;
  if(!response.ok){
   report.estado="fallo-http";
   report.motivo=clasificarHTTP(response.status);
   return report;
  }
  const body=await leerRespuestaLimitada(response);
  const modelos=normalizarCatalogoNvidia(body);
  report.modelos=[...modelos];
  report.modelosNemotron=modelos.filter(id=>/nemotron|bolt/iu.test(id));
  report.modelosAnterioresPresentes=[
   "nvidia/nemotron-3-nano-30b-a3b",
   "nvidia/nemotron-3-super-120b-a12b"
  ].filter(id=>modelos.includes(id));
  report.totalModelos=modelos.length;
  report.estado="correcto";
  report.completo=true;
  return report;
 }catch(error){
  report.estado="fallo-consulta";
  report.motivo=fallo(error,abort.signal);
  return report;
 }finally{clearTimeout(timer);}
}
export function autorizarConsultaCatalogoNvidia(env){
 return env.GITHUB_ACTIONS==="true"&&
  env.GITHUB_REPOSITORY==="asenbanskaliev/ASEN"&&
  env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
  env.GITHUB_ACTOR==="asenbanskaliev"&&
  env.GITHUB_REF==="refs/heads/feat/flujo-de-agentes-20261115"&&
  env.GITHUB_RUN_ATTEMPT==="1"&&
  shaValido(env.GITHUB_SHA)&&
  env.GITHUB_SHA===env.ASEN_NVIDIA_EXPECTED_SHA&&
  env.ASEN_NVIDIA_SOLO_CATALOGO==="1"&&
  claveValida(env.NVIDIA_API_KEY);
}
export async function ejecutarConsultaCatalogoNvidia(env=process.env){
 if(!autorizarConsultaCatalogoNvidia(env))
  throw Error("Consulta NVIDIA denegada: identidad, SHA o primer intento inválidos");
 const dest=env.ASEN_NVIDIA_CATALOGO_REPORT_PATH;
 if(typeof dest!=="string"||!isAbsolute(dest)||
  !dest.endsWith("/catalogo-nvidia.json"))
  throw Error("Ruta de informe no autorizada");
 const report=await consultarCatalogoNvidia({clave:env.NVIDIA_API_KEY});
 mkdirSync(dirname(dest),{recursive:true,mode:0o700});
 writeFileSync(dest,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 // Jamás imprimir los nombres arbitrarios ni contenido original del proveedor.
 console.log(JSON.stringify({
  estado:report.estado,totalModelos:report.totalModelos,
  modelosNemotron:report.modelosNemotron.length,
  solicitudesGeneracion:report.generacionSolicitudes,
  reintentos:report.reintentos,motivo:report.motivo
 }));
 if(!report.completo)process.exitCode=1;
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 ejecutarConsultaCatalogoNvidia().catch(()=>{
  console.error("Consulta del catálogo NVIDIA bloqueada: comprobar contexto o clave");
  process.exitCode=1;
 });
}
