/**
 * T06 — Prueba limitada de concurrencia contra el punto de acceso gratuito de
 * NVIDIA. No envía código del repositorio, no realiza escritura, no hace
 * reintentos y no confunde dos respuestas API con un flujo ODD completo.
 *
 * Modelo permitido y punto de acceso definidos expresamente; nunca utiliza
 * servicios de pago, direcciones arbitrarias ni una selección automática.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const NVIDIA_FREE_MODEL="nvidia/nemotron-3.5-lightning-30b-a3b";
export const NVIDIA_FREE_URL="https://integrate.api.nvidia.com/v1/chat/completions";
export const NVIDIA_MAX_TOKENS=128;
const MAX_DURATION_MS=75_000;
const TARGETS=Object.freeze([
 Object.freeze({agent:"worker-a",marker:"ASEN_NVIDIA_A_OK"}),
 Object.freeze({agent:"worker-b",marker:"ASEN_NVIDIA_B_OK"})
]);

const requiredString=(value)=>typeof value==="string"&&value.trim().length>0&&value.length<=512;
const nonNegative=(value)=>Number.isSafeInteger(value)&&value>=0?value:null;
const secureMessage="No se han autorizado reintentos, escrituras, modelos alternativos ni proveedores de pago.";

export async function probeNvidiaFreeApi({
 apiKey,
 request=fetch,
 timeoutMs=MAX_DURATION_MS,
 model=NVIDIA_FREE_MODEL
}={}){
 if(model!==NVIDIA_FREE_MODEL)throw Error("Modelo NVIDIA fuera de la lista gratuita permitida");
 if(!requiredString(apiKey))throw Error("NVIDIA_API_KEY no configurada: prueba real BLOQUEADA");
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>MAX_DURATION_MS)
  throw Error("Tiempo de espera NVIDIA fuera del límite autorizado");
 const startedAt=new Date().toISOString();
 // Dos llamadas creadas antes del primer await: los intervalos del recibo
 // permiten verificar concurrencia de peticiones, no ejecuciones de Pi.
 const tasks=TARGETS.map(async ({agent,marker})=>{
  const started=performance.now();
  let httpStatus=null,reportedModel=null;
  try{
   const response=await request(NVIDIA_FREE_URL,{
    method:"POST",
    headers:{
     "Authorization":"Bearer "+apiKey,
     "Content-Type":"application/json",
     "Accept":"application/json"
    },
    body:JSON.stringify({
     model,stream:false,max_tokens:NVIDIA_MAX_TOKENS,
     temperature:0.1,
     messages:[
      {role:"system",content:"Sigue exactamente la instrucción breve. No uses herramientas ni razonamiento largo."},
      {role:"user",content:"Responde exactamente "+marker+". No añadas otros caracteres."}
     ],
     chat_template_kwargs:{enable_thinking:false}
    }),
    signal:AbortSignal.timeout(timeoutMs)
   });
   httpStatus=response.status;
   if(!response.ok)throw Error("Respuesta HTTP "+httpStatus+"; acceso o disponibilidad NO verificados");
   const data=await response.json();
   reportedModel=typeof data?.model==="string"&&data.model.length<256?data.model:null;
   const content=data?.choices?.[0]?.message?.content;
   if(!requiredString(data?.id)||typeof content!=="string"||content.trim()!==marker)
    throw Error("La respuesta no demuestra una contestación válida y distinta del agente");
   if(reportedModel!==model)
    throw Error("El modelo declarado en la respuesta no coincide con el autorizado");
   return Object.freeze({
    agent,started,finished:performance.now(),status:"api-confirmed",
    httpStatus,modelRequested:model,modelReturned:reportedModel,
    responseIdPresent:true,markerMatched:true,
    usage:{
     promptTokens:nonNegative(data?.usage?.prompt_tokens),
     completionTokens:nonNegative(data?.usage?.completion_tokens),
     totalTokens:nonNegative(data?.usage?.total_tokens)
    }
   });
  }catch(error){
   const message=error instanceof Error?error.message:"Error de solicitud desconocido";
   // No propagar cuerpo del proveedor, claves, prompts ni cabeceras al CI.
   const code=message.includes("HTTP")?"HTTP_BLOCKED":
    message.includes("modelo declarado")?"MODEL_MISMATCH":
    message.includes("respuesta")?"INVALID_REPLY":"NETWORK_OR_TIMEOUT";
   return Object.freeze({
    agent,started,finished:performance.now(),status:"blocked",
    httpStatus,modelRequested:model,modelReturned:reportedModel,
    errorCode:code
   });
  }
 });
 const results=await Promise.all(tasks);
 const [a,b]=results;
 const overlapped=!!a&&!!b&&Math.max(a.started,b.started)<Math.min(a.finished,b.finished);
 const completed=results.length===2&&results.every(x=>x.status==="api-confirmed");
 return Object.freeze({
  schema:"asen.t06.nvidia.free-api-probe/v1",
  status:completed&&overlapped?"AUTHENTICATED_API_PARALLEL":"BLOCKED",
  startedAt,finishedAt:new Date().toISOString(),
  endpoint:"NVIDIA_BUILD_TRIAL",modelRequested:model,freeEndpointOnly:true,
  maxTokensPerRequest:NVIDIA_MAX_TOKENS,requestCount:2,retryCount:0,
  overlappingRequests:overlapped,results:results.map(({started,finished,...safe})=>({
   ...safe,durationMs:Math.max(0,Math.round(finished-started))
  })),
  executionProved:"HTTP_ONLY_NOT_PI_WORKERS",
  noPaidModels:true,noAutoMerge:true,noWriterGrants:true,
  note:secureMessage
 });
}

export function persistNvidiaProbeReport(report,file){
 if(!file||typeof file!=="string")throw Error("Ruta de evidencias no configurada");
 const output=resolve(file);
 mkdirSync(dirname(output),{recursive:true,mode:0o700});
 writeFileSync(output,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
 return output;
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const reportFile=process.env.ASEN_NVIDIA_PROBE_REPORT;
 if(!reportFile)throw Error("ASEN_NVIDIA_PROBE_REPORT debe apuntar a un archivo temporal");
 try{
  const report=await probeNvidiaFreeApi({apiKey:process.env.NVIDIA_API_KEY});
  persistNvidiaProbeReport(report,reportFile);
  // Únicamente metadatos acotados, nunca respuestas crudas ni tokens secretos.
  process.stdout.write(JSON.stringify({
   status:report.status,model:report.modelRequested,
   concurrent:report.overlappingRequests,
   httpCodes:report.results.map(x=>x.httpStatus),
   tokenCounts:report.results.map(x=>x.usage?.totalTokens??null),
   reportFile
  })+"\n");
  if(report.status!=="AUTHENTICATED_API_PARALLEL")process.exitCode=1;
 }catch(error){
  const reason=error instanceof Error&&error.message.includes("NVIDIA_API_KEY")?
   "NVIDIA_API_KEY_MISSING":"PROBE_FAILED";
  process.stderr.write("T06 prueba NVIDIA BLOQUEADA: "+reason+"\n");
  process.exitCode=1;
 }
}
