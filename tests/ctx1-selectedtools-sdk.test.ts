import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {Agent} from "@earendil-works/pi-agent-core";
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
