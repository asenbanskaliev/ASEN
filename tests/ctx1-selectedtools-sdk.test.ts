import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {Agent} from "@earendil-works/pi-agent-core";
import {createAssistantMessageEventStream} from "@earendil-works/pi-ai";
import {
 AgentSession,DefaultResourceLoader,SessionManager,SettingsManager,
 type ExtensionUIContext
} from "@earendil-works/pi-coding-agent";

// Prueba la señal pública del SDK, no una lista inferida de herramientas.
// La conexión al proveedor nunca debe utilizarse para detectar capacidades.
function interfazSinDialogos():ExtensionUIContext{
 return {
  select:async()=>undefined,
  confirm:async()=>false,input:async()=>undefined,notify:()=>{},
  onTerminalInput:()=>()=>{},setStatus:()=>{},
  setWorkingMessage:()=>{},setWorkingVisible:()=>{},setWorkingIndicator:()=>{},
  setHiddenThinkingLabel:()=>{},setWidget:()=>{},setFooter:()=>{},
  setHeader:()=>{},setTitle:()=>{},
  custom:async()=>{throw Error("No se permiten diálogos en esta prueba");},
  pasteToEditor:()=>{},setEditorText:()=>{},getEditorText:()=>"",
  editor:async()=>undefined,addAutocompleteProvider:()=>{},
  setEditorComponent:()=>{},getEditorComponent:()=>undefined,
  theme:{} as ExtensionUIContext["theme"],
  getAllThemes:()=>[],getTheme:()=>undefined,
  setTheme:()=>({success:false,error:"Fuera del alcance de la prueba"}),
  getToolsExpanded:()=>false,setToolsExpanded:()=>{}
 };
}

test("CTX-1: la API real de Pi distingue registro y selección de herramientas, sin proveedor",async()=>{
 mkdirSync(path.resolve(".cache"),{recursive:true});
 const root=mkdtempSync(path.resolve(".cache","asen-ctx1-sdk-"));
 const previousHome=process.env.HOME;
 process.env.HOME=root;
 let providerAttempts=0,canRegister=false;
 const observed:unknown[]=[];
 let session:AgentSession|undefined;
 try{
  const settings=SettingsManager.inMemory({
   compaction:{enabled:false},retry:{enabled:false}
  });
  const loader=new DefaultResourceLoader({
   cwd:root,agentDir:root,settingsManager:settings,
   extensionFactories:[{
    name:"asen-ctx1-sdk-verificacion",
    factory:pi=>{
     canRegister=typeof pi.registerTool==="function";
     pi.on("before_agent_start",event=>{
      const options=(event as {systemPromptOptions?:{selectedTools?:unknown}}).systemPromptOptions;
      observed.push(options?.selectedTools);
     });
    }
   }],
   noExtensions:true,noPromptTemplates:true,noThemes:true,noContextFiles:true
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors,[]);
  const agent=new Agent({streamFn:(()=>{
   providerAttempts++;
   throw Error("Esta prueba no autoriza proveedor");
  }) as never});
  session=new AgentSession({
   agent,sessionManager:SessionManager.inMemory(root),
   settingsManager:settings,cwd:root,resourceLoader:loader,
   modelRuntime:Object.freeze({getApiKey:()=>{
    throw Error("Esta prueba no debe buscar credenciales");
   }}) as never,
   initialActiveToolNames:[]
  });
  await session.bindExtensions({mode:"rpc",uiContext:interfazSinDialogos()});
  const empty=session.getActiveToolNames();
  assert.deepEqual(empty,[],"Pi debe permitir sesión sin herramientas activas");
  await session.extensionRunner.emitBeforeAgentStart(
   {messageType:"user",prompt:"Consulta informativa"},
   {cwd:root,selectedTools:empty,sections:{},skills:loader.getSkills().skills}
  );
  await session.extensionRunner.emitBeforeAgentStart(
   {messageType:"user",prompt:"Consulta con lectura"},
   {cwd:root,selectedTools:["read"],sections:{},skills:loader.getSkills().skills}
  );
  assert.equal(canRegister,true,"La posibilidad de registrar no prueba selección activa");
  assert.deepEqual(observed,[[],["read"]],
   "before_agent_start debe exponer la selección exacta, incluso una lista vacía");
  assert.equal(providerAttempts,0);
 }finally{
  try{await session?.extensionRunner.emit({type:"session_shutdown",reason:"quit"});}
  finally{
   session?.dispose();
   if(previousHome===undefined)delete process.env.HOME;
   else process.env.HOME=previousHome;
   rmSync(root,{recursive:true,force:true});
  }
 }
});


test("CTX-1: el ciclo nativo de AgentSession.prompt transmite las herramientas activas sin red",async()=>{
 mkdirSync(path.resolve(".cache"),{recursive:true});
 const root=mkdtempSync(path.resolve(".cache","asen-ctx1-turno-"));
 const previousHome=process.env.HOME;
 process.env.HOME=root;
 const selected:unknown[]=[];
 let requestsFicticias=0;
 let session:AgentSession|undefined;
 try{
  // El modelo ficticio y su respuesta en memoria impiden cualquier petición a un proveedor.
  const model={
   id:"sin-red",name:"Modelo de prueba local",api:"anthropic-messages" as const,
   provider:"asen-prueba-local",baseUrl:"http://127.0.0.1:0",
   reasoning:false,input:["text"],contextWindow:128000,maxTokens:1024,
   cost:{input:0,output:0,cacheRead:0,cacheWrite:0}
  };
  const settings=SettingsManager.inMemory({
   compaction:{enabled:false},retry:{enabled:false}
  });
  const loader=new DefaultResourceLoader({
   cwd:root,agentDir:root,settingsManager:settings,
   extensionFactories:[{
    name:"asen-ctx1-turno-real",
    factory:pi=>{
     pi.on("before_agent_start",event=>{
      const herramientas=event.systemPromptOptions.selectedTools;
      // Conservar undefined: una señal ausente nunca equivale a una selección vacía.
      selected.push(Array.isArray(herramientas)?[...herramientas]:herramientas);
     });
    }
   }],
   noExtensions:true,noPromptTemplates:true,noThemes:true,noContextFiles:true
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors,[]);
  const agent=new Agent({
   initialState:{model:model as never,systemPrompt:"Prueba de Pi sin red",tools:[]},
   getApiKey:()=>"credencial-ficticia-local",
   streamFn:(()=>{
    requestsFicticias++;
    const stream=createAssistantMessageEventStream();
    queueMicrotask(()=>{
     const message={
      role:"assistant" as const,
      content:[{type:"text" as const,text:"Respuesta local"}],
      api:"anthropic-messages" as const,provider:model.provider,model:model.id,
      usage:{
       input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,
       cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}
      },
      stopReason:"stop" as const,timestamp:Date.now()
     };
     stream.push({type:"start",partial:{...message,content:[],stopReason:"pending"}});
     stream.push({type:"text_start",contentIndex:0,partial:{
      ...message,content:[{type:"text",text:""}],stopReason:"pending"
     }} as never);
     stream.push({type:"text_end",contentIndex:0,content:"Respuesta local",partial:{
      ...message,stopReason:"pending"
     }} as never);
     stream.push({type:"done",reason:"stop",message});
    });
    return stream;
   }) as never
  });
  session=new AgentSession({
   agent,sessionManager:SessionManager.inMemory(root),
   settingsManager:settings,cwd:root,resourceLoader:loader,
   modelRuntime:{
    hasConfiguredAuth:(provider:string)=>provider===model.provider,
    checkAuth:async()=>({type:"api_key"}),
    getAuth:async()=>({auth:{apiKey:"credencial-ficticia-local"}}),
    isUsingOAuth:()=>false,
    getModel:()=>model,
    getPhysicalModel:()=>model,
    getAvailableSnapshot:()=>[model]
   } as never,
   initialActiveToolNames:[]
  });
  await session.bindExtensions({mode:"rpc",uiContext:interfazSinDialogos()});
  assert.deepEqual(session.getActiveToolNames(),[]);
  await session.prompt("Consulta sin herramientas",{source:"rpc"});
  session.setActiveToolsByName(["read"]);
  assert.deepEqual(session.getActiveToolNames(),["read"]);
  await session.prompt("Consulta con lectura activa",{source:"rpc"});
  assert.deepEqual(selected,[[],["read"]],
   "Pi debe comunicar las herramientas activas en dos turnos nativos, no listas inyectadas al evento");
  assert.equal(requestsFicticias,2,"Dos respuestas locales, ninguna llamada real a proveedor");
 }finally{
  try{await session?.extensionRunner.emit({type:"session_shutdown",reason:"quit"});}
  finally{
   session?.dispose();
   if(previousHome===undefined)delete process.env.HOME;
   else process.env.HOME=previousHome;
   rmSync(root,{recursive:true,force:true});
  }
 }
});
