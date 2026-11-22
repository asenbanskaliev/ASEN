import assert from "node:assert/strict";
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {Agent} from "@earendil-works/pi-agent-core";
import {createAssistantMessageEventStream,type AssistantMessage,type Model} from "@earendil-works/pi-ai";
import {AgentSession,DefaultResourceLoader,SessionManager,SettingsManager,type ExtensionUIContext} from "@earendil-works/pi-coding-agent";
import {createPiExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";

function interfazSinPermisos(confirm:ExtensionUIContext["confirm"],avisos:string[]):ExtensionUIContext{
 return {
  select:async()=>undefined,confirm,input:async()=>undefined,
  notify:(mensaje,nivel)=>{if(nivel==="error")avisos.push(mensaje);},
  onTerminalInput:()=>()=>{},setStatus:()=>{},setWorkingMessage:()=>{},
  setWorkingVisible:()=>{},setWorkingIndicator:()=>{},setHiddenThinkingLabel:()=>{},
  setWidget:()=>{},setFooter:()=>{},setHeader:()=>{},setTitle:()=>{},
  custom:async()=>{throw Error("No se permiten diálogos en esta prueba");},
  pasteToEditor:()=>{},setEditorText:()=>{},getEditorText:()=>"",
  editor:async()=>undefined,addAutocompleteProvider:()=>{},setEditorComponent:()=>{},
  getEditorComponent:()=>undefined,theme:{} as ExtensionUIContext["theme"],
  getAllThemes:()=>[],getTheme:()=>undefined,
  setTheme:()=>({success:false,error:"Fuera del alcance de la prueba"}),
  getToolsExpanded:()=>false,setToolsExpanded:()=>{},
 };
}

// T1 (S1, S6): Pi y la política de producción son reales; el flujo del modelo es simulado.
test("E1B/CTX-2: Pi nativo offline permite leer y deniega escribir sin un Writer autorizado",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-e1b-ctx2-"));
 t.after(async()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 const home=join(root,"home"),agentDir=join(root,"pi"),workspace=join(root,"proyecto");
 await Promise.all([home,agentDir,workspace].map(dir=>mkdir(dir)));
 const project=await realpath(workspace),name="documento.txt",fixture=join(project,name);
 const original=Buffer.from("Documento autorizado para lectura.\n","utf8");
 await writeFile(fixture,original);
 const profilesFile=join(home,"profiles.json");
 await writeProfilesFile(profilesFile,{schema:ASEN_PROFILES_SCHEMA,active:"delegado",
  profiles:[{name:"delegado",mode:"full-delegation",routes:{worker:{model:"local/modelo-ficticio"}}}]});

 let launches=0,confirmations=0,scriptedResponses=0;
 const avisos:string[]=[],extensionErrors:unknown[]=[];
 const fetchOffline=t.mock.method(globalThis,"fetch",async()=>{
  throw Error("Esta prueba no permite peticiones de red");
 });
 const production=createPiExtension({
  homeDir:()=>home,packageRoot:root,profilesFile,todoStoreFile:join(home,"todos.json"),
  agentStoreFile:join(home,"agents.json"),enableMemoryRuntime:false,enableWorkspaceRuntime:false,
  autoAdvancePlans:false,
  agentRunner:{run:async()=>{launches++;throw Error("No hay Writer autorizado");}},
 });
 const settings=SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false}});
 const previousHome=process.env.HOME,previousNoRegistry=process.env.ASEN_NO_SKILL_REGISTRY;
 process.env.HOME=home;
 // El registro de habilidades no forma parte de esta prueba ni necesita un Git de prueba.
 process.env.ASEN_NO_SKILL_REGISTRY="1";
 let session:AgentSession|undefined;
 try{
  const loader=new DefaultResourceLoader({
   cwd:project,agentDir,settingsManager:settings,
   extensionFactories:[{name:"asen-produccion",factory:production}],
   noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors,[],"Pi debe cargar la extensión de producción sin sustituir su API");
  const model:Model<"anthropic-messages">={
   id:"sin-red",name:"Modelo de prueba local",api:"anthropic-messages",
   provider:"asen-prueba-local",baseUrl:"http://127.0.0.1:0",reasoning:false,input:["text"],
   contextWindow:128000,maxTokens:1024,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},
  };
  const script:AssistantMessage["content"][]=[
   [{type:"toolCall",id:"lectura",name:"read",arguments:{path:name}}],
   [{type:"toolCall",id:"escritura",name:"write",arguments:{path:name,content:"Cambio no autorizado\n"}}],
   [{type:"text",text:"Fin del guion local"}],
  ];
  const agent=new Agent({
   initialState:{model,systemPrompt:"Prueba local de Pi",tools:[]},
   getApiKey:()=>"credencial-ficticia-local",
   streamFn:()=>{
    const content=script[scriptedResponses++];
    assert.ok(content,"Pi no debe solicitar respuestas fuera del guion local");
    const stopReason=content.some(item=>item.type==="toolCall")?"toolUse":"stop";
    const message:AssistantMessage={
     role:"assistant",content,api:model.api,provider:model.provider,model:model.id,stopReason,
     usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},timestamp:Date.now(),
    };
    const stream=createAssistantMessageEventStream();
    queueMicrotask(()=>stream.push({type:"done",reason:stopReason,message}));
    return stream;
   },
  });
  session=new AgentSession({
   agent,cwd:project,sessionManager:SessionManager.inMemory(project),
   settingsManager:settings,resourceLoader:loader,initialActiveToolNames:["read","write"],
   modelRuntime:{
    hasConfiguredAuth:(provider:string)=>provider===model.provider,
    checkAuth:async()=>({type:"api_key"}),getAuth:async()=>({auth:{apiKey:"credencial-ficticia-local"}}),
    isUsingOAuth:()=>false,getModel:()=>model,getPhysicalModel:()=>model,getAvailableSnapshot:()=>[model],
   } as never,
  });
  await session.bindExtensions({mode:"rpc",onError:error=>extensionErrors.push(error),
   uiContext:interfazSinPermisos(async()=>{confirmations++;return false;},avisos)});
  assert.deepEqual(avisos,[],"La extensión de producción debe iniciar sin errores");
  assert.ok(session.getActiveToolNames().includes("asen_plan_dispatch_next"),"El despachador Writer debe estar disponible");
  const active=session.getActiveToolNames();
  assert.ok(active.includes("read")&&active.includes("write"),"Ambas herramientas nativas deben estar activas");
  await session.prompt("Lee documento.txt; no se ha autorizado un Writer para este turno.",{source:"rpc"});

  const results=session.messages.filter(message=>message.role==="toolResult");
  assert.deepEqual(results.map(({toolCallId,toolName,isError})=>({toolCallId,toolName,isError})),[
   {toolCallId:"lectura",toolName:"read",isError:false},
   {toolCallId:"escritura",toolName:"write",isError:true},
  ]);
  assert.deepEqual(results[0]?.content,[{type:"text",text:original.toString("utf8")}]);
  assert.deepEqual(results[1]?.content,[{type:"text",
   text:"ASEN primary tool policy blocked full delegation: parent cannot modify files or run shell commands"}]);
  assert.deepEqual(await readFile(fixture),original,"La escritura denegada no debe cambiar ningún byte");
  assert.equal(confirmations,0,"No se solicitó ni se concedió autorización al Writer");
  assert.equal(launches,0,"Ningún Writer llegó al ejecutor");
  assert.equal(scriptedResponses,3,"Solo se consumieron las tres respuestas locales previstas");
  assert.equal(fetchOffline.mock.callCount(),0);
  assert.deepEqual(extensionErrors,[]);
 }finally{
  try{await session?.extensionRunner.emit({type:"session_shutdown",reason:"quit"});}
  finally{
   session?.dispose();
   if(previousHome===undefined)delete process.env.HOME;
   else process.env.HOME=previousHome;
   if(previousNoRegistry===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;
   else process.env.ASEN_NO_SKILL_REGISTRY=previousNoRegistry;
  }
 }
});
