/** Ensayo 09: error local reproducible y exactamente una llamada real a Nano Omni.
 * Solo sirve datos sintéticos del ensayo. La clave real nunca llega al hijo Pi.
 * La respuesta HTTP real no es una transmisión directa: se valida y adapta a SSE.
 */
import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {randomBytes} from "node:crypto";
import {once} from "node:events";

export const PRIMARY="nvidia/nemotron-3.5-lightning-30b-a3b";
export const ALTERNATIVE="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
export const CONTINUATION="Continue the same task using the existing conversation context.";
const ENDPOINT="https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_BYTES=96_000;
type Usage={prompt_tokens:number;completion_tokens:number;total_tokens:number};
type Report={local429:number;upstreamRequests:number;rejectedRequests:number;upstreamStatus:number|null;upstreamModel:string|null;contextPreserved:boolean;usage:Usage|null};
function reply(res:ServerResponse,status:number,message:string):void{
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify({error:{message,type:status===429?"rate_limit_error":"invalid_request_error",code:status===429?"rate_limit_exceeded":"trial_refused"}}));
}
async function boundedBody(req:IncomingMessage):Promise<string>{
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of req){const data=Buffer.from(chunk);bytes+=data.length;if(bytes>MAX_BYTES)throw Error("Solicitud demasiado grande");chunks.push(data);}
 return Buffer.concat(chunks).toString("utf8");
}
function normalize(model:unknown):string|null{
 return model===PRIMARY||model===PRIMARY.slice(7)?PRIMARY:model===ALTERNATIVE||model===ALTERNATIVE.slice(7)?ALTERNATIVE:null;
}
function messageText(content:unknown):string{
 if(typeof content==="string")return content;
 if(!Array.isArray(content))return "";
 return content.filter(x=>x&&x.type==="text"&&typeof x.text==="string").map(x=>x.text).join("");
}
const tokenCount=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=1_000_000;
export async function startControlledFailure(options:{apiKey:string;marker:string;prompt:string;authorized:()=>boolean;request?:typeof fetch}){
 if(!options.apiKey||!/^ASEN_PI_[A-Z0-9_]+_[AB]_OK$/u.test(options.marker)||options.prompt!=="Responde únicamente con "+options.marker+". No utilices herramientas.")throw Error("Ensayo 09 inválido");
 const localKey=randomBytes(32).toString("hex"),request=options.request??fetch;
 const report:Report={local429:0,upstreamRequests:0,rejectedRequests:0,upstreamStatus:null,upstreamModel:null,contextPreserved:false,usage:null};
 const abort=new AbortController();
 const server=createServer((req,res)=>{
  void (async()=>{
   if(req.method!=="POST"||req.url!=="/v1/chat/completions"||req.headers.authorization!=="Bearer "+localKey){report.rejectedRequests++;reply(res,403,"Ensayo local no autorizado");return;}
   const body=JSON.parse(await boundedBody(req));
   const model=normalize(body?.model);
   if(!model||body.stream!==true||!Array.isArray(body.messages)||body.messages.length>24||body.tools?.length||body.functions?.length){report.rejectedRequests++;reply(res,400,"Petición ajena al ensayo");return;}
   const users=body.messages.filter((m:{role?:unknown})=>m?.role==="user").map((m:{content?:unknown})=>messageText(m.content));
   if(model===PRIMARY&&report.local429===0&&report.upstreamRequests===0&&users.length===1&&users[0]===options.prompt){
    report.local429=1;reply(res,429,"429 rate limit (fallo local controlado ASEN)");return;
   }
   if(model!==ALTERNATIVE||report.local429!==1||report.upstreamRequests!==0||report.rejectedRequests!==0||!options.authorized()||users.length!==2||users[0]!==options.prompt||users[1]!==CONTINUATION){
    report.rejectedRequests++;reply(res,403,"Alternativa sin consentimiento o contexto exacto");return;
   }
   report.contextPreserved=true;report.upstreamRequests=1; // Reservar antes de cualquier await.
   const upstream=await request(ENDPOINT,{method:"POST",redirect:"error",headers:{Authorization:"Bearer "+options.apiKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({model:ALTERNATIVE,stream:false,max_tokens:128,temperature:0.1,reasoning_budget:0,messages:[{role:"system",content:"Responde exactamente según la instrucción breve. No uses herramientas ni razonamiento largo."},{role:"user",content:users[0]},{role:"user",content:users[1]}]}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(60_000)])});
   report.upstreamStatus=upstream.status;
   if(!upstream.ok){await upstream.body?.cancel();reply(res,502,"Proveedor no disponible");return;}
   const reader=upstream.body?.getReader();if(!reader)throw Error("Sin respuesta");
   const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>MAX_BYTES)throw Error("Respuesta demasiado grande");chunks.push(item.value);}}finally{await reader.cancel().catch(()=>{});}
   const data=JSON.parse(Buffer.concat(chunks).toString("utf8")),choice=data?.choices?.[0],usage=data?.usage;
   if(data?.model!==ALTERNATIVE||typeof data?.id!=="string"||!/^[A-Za-z0-9._:-]{1,200}$/u.test(data.id)||data.choices.length!==1||choice?.finish_reason!=="stop"||typeof choice?.message?.content!=="string"||choice.message.content.trim()!==options.marker||!tokenCount(usage?.prompt_tokens)||!tokenCount(usage?.completion_tokens)||!tokenCount(usage?.total_tokens)){reply(res,502,"Respuesta NVIDIA no acreditada");return;}
   report.upstreamModel=data.model;report.usage={prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens,total_tokens:usage.total_tokens};
   const common={id:data.id,object:"chat.completion.chunk",created:Math.floor(Date.now()/1000),model:data.model};
   res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-store"});
   for(const chunk of [{...common,choices:[{index:0,delta:{role:"assistant",content:choice.message.content},finish_reason:null}]},{...common,choices:[{index:0,delta:{},finish_reason:"stop"}]},{...common,choices:[],usage:report.usage}])res.write("data: "+JSON.stringify(chunk)+"\n\n");
   res.end("data: [DONE]\n\n");
  })().catch(()=>{if(!res.headersSent)reply(res,502,"Ensayo interrumpido");else res.destroy();});
 });
 server.requestTimeout=65_000;server.headersTimeout=10_000;
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const address=server.address();if(!address||typeof address==="string"){server.close();throw Error("Servidor local no disponible");}
 return {baseUrl:"http://127.0.0.1:"+address.port+"/v1",localKey,receipt:()=>({...report,usage:report.usage?{...report.usage}:null}),close:async()=>{abort.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
