/** Comprueba la petición REAL que prepara Pi 1.5.2, contra un servidor
 * local sin credenciales NVIDIA, sin llamadas remotas y sin reintentos. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {configuracionT06Nvidia} from "./t06-aislamiento-modelos-nvidia.mjs";
import {disablePiRetries} from "./t12-pi-retry-settings.mjs";

const modelo="nvidia/nemotron-3-super-120b-a12b";
const maxBytes=128_000;
const root=mkdtempSync(join(tmpdir(),"asen-t06-revision-pi-simulada-"));
let captured=null,requests=0,timedOut=false;
const server=createServer((request,response)=>{
 requests++;
 if(request.method!=="POST"||request.url!=="/v1/chat/completions"||requests>1){
  response.writeHead(404).end();return;
 }
 let total=0,body="";
 request.on("data",chunk=>{
  total+=chunk.length;
  if(total>maxBytes){request.destroy();return;}
  body+=chunk.toString("utf8");
 });
 request.on("end",()=>{
  if(total>maxBytes){response.writeHead(413).end();return;}
  try{captured=JSON.parse(body);}
  catch{response.writeHead(400).end();return;}
  // Solo simulación del protocolo: no realiza inferencia ni revisa contenido.
  const frame=(delta,finish_reason)=>"data: "+JSON.stringify({
   id:"chatcmpl-simulado",object:"chat.completion.chunk",created:1,model:modelo,
   choices:[{index:0,delta,finish_reason}]
  })+"\n\n";
  response.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache"});
  response.end(frame({role:"assistant",content:"OK"},null)+frame({},"stop")+"data: [DONE]\n\n");
 });
});
let child;
try{
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
 });
 const address=server.address();
 assert.ok(address&&typeof address==="object");
 const settings=configuracionT06Nvidia();
 assert.deepEqual(Object.keys(settings.providers.nvidia.modelOverrides),
  [modelo,"nvidia/nemotron-3.5-super-vl-120b-a12b"]);
 settings.providers.nvidia.baseUrl="http://127.0.0.1:"+address.port+"/v1";
 settings.providers.nvidia.apiKey="clave-ficticia-no-valida";
 writeFileSync(join(root,"models.json"),JSON.stringify(settings)+"\n",{mode:0o600,flag:"wx"});
 await disablePiRetries(root);
 assert.ok(!process.env.NVIDIA_API_KEY,
  "La prueba simulada no admite credenciales reales de NVIDIA");
 const env={
  PATH:process.env.PATH,HOME:process.env.HOME,USER:process.env.USER,
  TMPDIR:process.env.TMPDIR,PI_CODING_AGENT_DIR:root,
  NVIDIA_API_KEY:"clave-ficticia-no-valida",
  CI:"true",NO_COLOR:"1"
 };
 child=spawn("pi",[
  "--model",modelo,"--mode","text","--no-tools","--no-extensions",
  "--no-session","--thinking","off","-p","Responde OK"
 ],{env,stdio:["ignore","pipe","pipe"]});
 let outputBytes=0,stdout="";
 for(const channel of [child.stdout,child.stderr]){
  channel.on("data",chunk=>{
   outputBytes+=chunk.length;
   if(outputBytes>85_000){child.kill("SIGKILL");return;}
   if(channel===child.stdout)stdout+=chunk.toString("utf8");
  });
 }
 const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL");},45_000);
 let result;
 try{result=await new Promise((resolve,reject)=>{
  child.once("error",reject);
  child.once("close",(code,signal)=>resolve({code,signal}));
 });}finally{clearTimeout(timer);}
 assert.equal(timedOut,false,"Pi agotó el tiempo de simulación");
 assert.equal(requests,1,"Pi no realizó exactamente una petición al servidor local");
 assert.ok(captured&&typeof captured==="object"&&!Array.isArray(captured));
 assert.equal(captured.model,modelo,"El modelo enviado por Pi es incorrecto");
 assert.equal(captured.stream,true,"Pi no envió el flujo esperado");
 assert.ok(Array.isArray(captured.messages)&&captured.messages.length>0);
 assert.equal("chat_template_kwargs" in captured,false,"Se envían parámetros antiguos de Bolt");
 assert.equal(captured.reasoning_effort,"none","El razonamiento NVIDIA no está desactivado");
 assert.equal("max_completion_tokens" in captured,false,"El límite usa un campo incompatible");
 assert.equal("stream_options" in captured,false,"La compatibilidad NVIDIA no se aplicó");
 assert.equal(result.code,0,"Pi recibió respuesta simulada pero no terminó correctamente");
 assert.match(stdout,/\bOK\b/u,"Pi no procesó la respuesta simulada");
 process.stdout.write(JSON.stringify({
  resultado:"SIMULACION_PI_CORRECTA",modelo,peticiones:requests,
  parametros:Object.keys(captured).sort(),nvidiaReal:false,globalFull:false
 })+"\n");
}catch(error){
 console.error("La simulación de Pi no pasó: "+(
  error instanceof Error?error.message:"fallo no identificado"));
 process.exitCode=1;
}finally{
 if(child&&!child.killed&&child.exitCode===null)child.kill("SIGKILL");
 await new Promise(resolve=>server.close(resolve));
 rmSync(root,{recursive:true,force:true});
}
