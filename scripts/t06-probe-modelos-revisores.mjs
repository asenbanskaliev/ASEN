/** Diagnóstico acotado: dos peticiones HTTP reales, cero reintentos.
 * No se imprimen claves, instrucciones del proveedor ni textos generados. */
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname} from "node:path";
const models=["nvidia/nemotron-3.5-bolt-e4b","nvidia/nemotron-3.5-super-vl-120b-a12b"];
const allowed=new Set(["model","messages","max_tokens","temperature","stream","chat_template_kwargs","thinking","reasoning_effort"]);
const key=process.env.NVIDIA_API_KEY;
if(typeof key!=="string"||key.length<16)throw Error("NVIDIA_API_KEY ausente");
const attempts=[];
for(const model of models){
 let status=null,successful=false,rejectedParameter="unknown",shape="unknown";
 try{
  const reply=await fetch("https://integrate.api.nvidia.com/v1/chat/completions",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(35000),
   headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
   body:JSON.stringify({model,stream:false,max_tokens:48,
    messages:[{role:"user",content:"Responde solo OK."}]})
  });
  status=reply.status;
  const text=await reply.text();
  if(text.length>16000)throw Error("respuesta demasiado grande");
  let json;try{json=JSON.parse(text);}catch{json=null;}
  successful=reply.ok&&typeof json?.choices?.[0]?.message?.content==="string"&&
   json.choices[0].message.content.trim().length>0;
  if(reply.ok&&!successful)shape="HTTP_OK_NO_TEXT";
  else if(successful)shape="HTTP_OK_TEXT";
  else{
   shape="HTTP_ERROR";
   const p=json?.error?.param??json?.error?.parameter;
   rejectedParameter=typeof p==="string"&&allowed.has(p)?p:"unknown";
  }
 }catch(error){shape=error?.name==="TimeoutError"?"TIMEOUT":"NETWORK_OR_FORMAT";}
 attempts.push({model,status,successful,rejectedParameter,shape});
}
const out={schema:"asen.t06.models-http-diagnostic/v1",maxRequests:2,
 requests:attempts.length,maxTokensPerRequest:48,retries:0,attempts,
 modelResponsesValid:attempts.every(x=>x.successful),globalFull:false};
const dest=process.env.ASEN_NVIDIA_DIAG_REPORT;
if(!dest?.startsWith("/"))throw Error("informe no configurado");
mkdirSync(dirname(dest),{recursive:true,mode:0o700});
writeFileSync(dest,JSON.stringify(out,null,2)+"\n",{mode:0o600,flag:"wx"});
process.stdout.write(JSON.stringify(out)+"\n");
if(!out.modelResponsesValid)process.exitCode=1;
