import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,realpathSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {PiProcessRunner} from "../src/agents/pi-process-runner.js";
import {createT06ReadOnlyGitFixture} from "../src/runtime/agents/t06-read-only-git-fixture.js";
import {ALTERNATIVE,CONTINUATION,PRIMARY,startControlledFailure} from "../scripts/m2-controlled-failure.js";

const marker="ASEN_PI_NVIDIA_A_OK",prompt="Responde únicamente con "+marker+". No utilices herramientas.";
const secret="clave-ficticia-sin-red";
function simulatedProvider(calls:unknown[]):typeof fetch{
 return async(input,init)=>{
  assert.equal(input,"https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(init?.redirect,"error");
  assert.equal(new Headers(init?.headers).get("authorization"),"Bearer "+secret);
  const body=JSON.parse(String(init?.body));
  assert.equal(body.model,ALTERNATIVE);assert.equal(body.max_tokens,128);assert.equal(body.stream,false);
  assert.deepEqual(body.messages.filter((m:{role:string})=>m.role==="user").map((m:{content:string})=>m.content),[prompt,CONTINUATION]);
  calls.push(body);
  return Response.json({id:"respuesta-local-ficticia",model:ALTERNATIVE,choices:[{finish_reason:"stop",message:{role:"assistant",content:marker}}],usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28}});
 };
}
const requestLocal=(server:Awaited<ReturnType<typeof startControlledFailure>>,model:string,users:string[],key=server.localKey)=>fetch(server.baseUrl+"/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model,stream:true,messages:users.map(content=>({role:"user",content}))})});

test("M2 09: 429 local, continuación exacta, una única alternativa y SSE adaptado",async t=>{
 const calls:unknown[]=[];let consent=false;
 const server=await startControlledFailure({apiKey:secret,marker,prompt,authorized:()=>consent,request:simulatedProvider(calls)});t.after(()=>server.close());
 const first=await requestLocal(server,PRIMARY,[prompt]);assert.equal(first.status,429);await first.text();assert.equal(calls.length,0);
 consent=true;
 const next=await requestLocal(server,ALTERNATIVE,[prompt,CONTINUATION]);assert.equal(next.status,200);
 const text=await next.text();assert.match(text,/data: \[DONE\]/u);assert.ok(text.includes(marker));assert.ok(text.includes(ALTERNATIVE));assert.equal(calls.length,1);
 assert.deepEqual(server.receipt(),{local429:1,upstreamRequests:1,rejectedRequests:0,upstreamStatus:200,upstreamModel:ALTERNATIVE,contextPreserved:true,usage:{prompt_tokens:20,completion_tokens:8,total_tokens:28}});
 const repeat=await requestLocal(server,ALTERNATIVE,[prompt,CONTINUATION]);assert.equal(repeat.status,403);await repeat.text();assert.equal(calls.length,1);
});

test("M2 09: rechaza sin consentimiento, contexto, credencial local o modelo válidos",async t=>{
 for(const mode of ["sin-consentimiento","sin-contexto","clave-ajena","modelo-ajeno","reintento-primario"]){
  const calls:unknown[]=[];
  const server=await startControlledFailure({apiKey:secret,marker,prompt,authorized:()=>mode!=="sin-consentimiento",request:simulatedProvider(calls)});
  try{
   const first=await requestLocal(server,PRIMARY,[prompt]);assert.equal(first.status,429);await first.text();
   const result=await requestLocal(server,mode==="modelo-ajeno"?"otro/modelo":mode==="reintento-primario"?PRIMARY:ALTERNATIVE,mode==="sin-contexto"?[CONTINUATION]:[prompt,CONTINUATION],mode==="clave-ajena"?"otra":server.localKey);
   assert.ok(result.status>=400);await result.text();assert.equal(calls.length,0);assert.equal(server.receipt().upstreamRequests,0);
  }finally{await server.close();}
 }
});

test("M2 09: la puerta separada conserva autorización por SHA y no repite el sondeo",()=>{
 const workflow=readFileSync(resolve(".github/workflows/ci.yml"),"utf8").replace(/\r\n/gu,"\n");
 const start=workflow.indexOf("\n  t06-nvidia-09-controlled:"),end=workflow.indexOf("\n  t06-m2-authorization:",start);
 assert.ok(start>=0&&end>start);const job=workflow.slice(start,end);
 for(const value of ["needs: [t06-m2-authorization]","github.actor == 'asenbanskaliev'","github.event.label.name == 'asen-t06-nvidia-09-controlado'","pull_request.number == 161",'test "$GITHUB_RUN_ATTEMPT" = 1',"ASEN_M2_CONTROLLED_FAILURE=1","persist-credentials: false"])assert.ok(job.includes(value),value);
 assert.doesNotMatch(job,/t06-nvidia-free-api-probe\.mjs|contents: write|pull-requests: write/u);
 assert.ok(job.indexOf("tests/m2-controlled-failure.test.ts")<job.indexOf("secrets.NVIDIA_API_KEY"));
 assert.ok(workflow.includes("asen-t06-autorizar-09-controlado:$ASEN_EXPECTED_SHA:"+ALTERNATIVE));
});

test("M2 09: Pi nativo cambia de modelo ante 429 local y conserva el contexto, sin red externa",{timeout:120000},async t=>{
 const cli=resolve("node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
 const globalPi=process.env.ASEN_M2_NATIVE_OFFLINE==="1";
 if(!globalPi&&!existsSync(cli)){t.skip("Pi nativo no instalado");return;}
 const calls:unknown[]=[],config=realpathSync(mkdtempSync(join(tmpdir(),"asen-m2-local-"))),fixture=createT06ReadOnlyGitFixture();
 const previous=process.env.PI_CODING_AGENT_DIR;let approvals=0,changes=0;
 const server=await startControlledFailure({apiKey:secret,marker,prompt,authorized:()=>approvals===1&&changes===1,request:simulatedProvider(calls)});
 t.after(async()=>{await server.close();fixture.cleanup();rmSync(config,{recursive:true,force:true});if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;});
 process.env.PI_CODING_AGENT_DIR=config;
 writeFileSync(join(config,"settings.json"),JSON.stringify({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:"off"}));
 writeFileSync(join(config,"models.json"),JSON.stringify({providers:{nvidia:{baseUrl:server.baseUrl,apiKey:server.localKey}}}));
 const runner=new PiProcessRunner({...(globalPi?{command:"pi"}:{command:process.execPath,rpcArgs:[cli,"--mode","rpc"]}),policyRoot:process.cwd(),noTools:true,requireChildModelBeforePrompt:true,timeoutMs:process.platform==="win32"?90000:45000,
  authorizeModelFallback:attempt=>{assert.equal(attempt.to,ALTERNATIVE);assert.equal(server.receipt().local429,1);approvals++;return approvals===1;},
  onModelFallback:event=>{assert.equal(event.from,PRIMARY);assert.equal(event.to,ALTERNATIVE);assert.equal(event.category,"rate_limit");changes++;}
 });
 const result=await runner.run({id:"m2-local-native",role:"explorer",prompt,repository:realpathSync(fixture.children[0]),model:PRIMARY,modelFallback:{chain:[{model:ALTERNATIVE}]}});
 assert.equal(result.ok,true,JSON.stringify({output:result.output,proof:server.receipt()}));assert.equal(approvals,1);assert.equal(changes,1);assert.equal(calls.length,1);assert.equal(server.receipt().contextPreserved,true);assert.equal(server.receipt().rejectedRequests,0);assert.ok(result.output.includes(marker));
});
