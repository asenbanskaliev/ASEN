import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 probeNvidiaFreeApi,persistNvidiaProbeReport,
 NVIDIA_FREE_MODEL,NVIDIA_FREE_URL,NVIDIA_MAX_TOKENS
} from "../scripts/t06-nvidia-free-api-probe.mjs";

function mockResponse(options,{status=200,model=NVIDIA_FREE_MODEL,content}={}){
 const body=JSON.parse(options.body);
 const marker=body.messages[1].content.includes("ASEN_NVIDIA_A_OK")?
  "ASEN_NVIDIA_A_OK":"ASEN_NVIDIA_B_OK";
 return {ok:status===200,status,json:async()=>({
  id:"chatcmpl-probe-"+marker,model,
  choices:[{message:{content:content??marker}}],
  usage:{prompt_tokens:15,completion_tokens:8,total_tokens:23}
 })};
}
test("T06 NVIDIA: dos solicitudes gratuitas empiezan a la vez y se identifican por separado",async()=>{
 let calls=0,release,entered;
 const gate=new Promise(r=>{release=r;});
 const both=new Promise(r=>{entered=r;});
 const request=async(url,options)=>{
  assert.equal(url,NVIDIA_FREE_URL);
  assert.equal(options.method,"POST");
  assert.equal(options.headers.Authorization,"Bearer nvapi-credential-only-for-test");
  const body=JSON.parse(options.body);
  assert.equal(body.model,NVIDIA_FREE_MODEL);
  assert.equal(body.max_tokens,NVIDIA_MAX_TOKENS);
  assert.equal(body.stream,false);
  assert.equal(body.messages.length,2);
  calls++;
  if(calls===2)entered();
  await gate;
  return mockResponse(options);
 };
 const p=probeNvidiaFreeApi({apiKey:"nvapi-credential-only-for-test",request,timeoutMs:900});
 await both;release();
 const report=await p;
 assert.equal(calls,2);
 assert.equal(report.status,"AUTHENTICATED_API_PARALLEL");
 assert.equal(report.overlappingRequests,true);
 assert.equal(report.executionProved,"HTTP_ONLY_NOT_PI_WORKERS");
 assert.deepEqual(report.results.map(r=>r.agent),["worker-a","worker-b"]);
 assert.equal(report.results.every(r=>r.modelReturned===NVIDIA_FREE_MODEL),true);
 assert.equal(report.results.every(r=>r.usage.totalTokens===23),true);
 assert.equal(report.retryCount,0);
 assert.equal(report.noWriterGrants,true);
 assert.equal(report.noAutoMerge,true);
 assert.doesNotMatch(JSON.stringify(report),/nvapi-credential-only-for-test/u);
});
test("T06 NVIDIA: respuesta 404, 429 o modelo distinto nunca se interpretan como éxito",async()=>{
 for(const status of [404,429,500]){
  const report=await probeNvidiaFreeApi({apiKey:"test-secret",
   request:async(_,options)=>mockResponse(options,{status}),timeoutMs:900});
  assert.equal(report.status,"BLOCKED");
  assert.equal(report.results.every(r=>r.errorCode==="HTTP_BLOCKED"),true);
  assert.equal(report.retryCount,0);
 }
 const mismatch=await probeNvidiaFreeApi({apiKey:"test-secret",
  request:async(_,options)=>mockResponse(options,{model:"otro/modelo"}),timeoutMs:900});
 assert.equal(mismatch.status,"BLOCKED");
 assert.equal(mismatch.results.every(r=>r.errorCode==="MODEL_MISMATCH"),true);
});
test("T06 NVIDIA: falta de clave o intento de otro modelo bloquean antes de la red",async()=>{
 let calls=0;
 const request=async()=>{calls++;throw Error("No debería ejecutarse");};
 await assert.rejects(()=>probeNvidiaFreeApi({apiKey:"",request}),/NVIDIA_API_KEY/u);
 await assert.rejects(()=>probeNvidiaFreeApi({apiKey:"test",request,model:"moonshotai/kimi-k3.1-pro"}),/fuera de la lista/u);
 await assert.rejects(()=>probeNvidiaFreeApi({apiKey:"test",request,timeoutMs:100_000}),/límite/u);
 assert.equal(calls,0);
});
test("T06 NVIDIA: respuesta vacía o errónea no inventa confirmación de modelo",async()=>{
 const report=await probeNvidiaFreeApi({apiKey:"test-secret",
  request:async(_,options)=>mockResponse(options,{content:"Otra respuesta"}),
  timeoutMs:900});
 assert.equal(report.status,"BLOCKED");
 assert.equal(report.results.every(r=>r.errorCode==="INVALID_REPLY"),true);
});
test("T06 NVIDIA: informe privado sin claves, prompts ni sobrescritura",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"asen-nvidia-evidence-"));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,"probe.json");
 const report=await probeNvidiaFreeApi({apiKey:"nvapi-secret",
  request:async(_,options)=>mockResponse(options),timeoutMs:900});
 persistNvidiaProbeReport(report,file);
 const saved=readFileSync(file,"utf8");
 assert.doesNotMatch(saved,/nvapi-secret|Authorization|Bearer|Responde exactamente/u);
 assert.match(saved,/AUTHENTICATED_API_PARALLEL/u);
 assert.throws(()=>persistNvidiaProbeReport(report,file),/EEXIST/u);
});
