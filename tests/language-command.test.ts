import assert from "node:assert/strict";
import {describe,test,type TestContext} from "node:test";
import {mkdir,mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAsenExtension,createPiExtension} from "../extensions/asen.js";
import {languageConfigPath} from "../src/runtime/language.js";

const note="Use `/asen-language show`, `/asen-language en` or `/asen-language es`";
const usage={error:note};
const description="Show/switch ASEN language: /asen-language [show|status|en|es]";
type Language="en"|"es";
function expectedStatus(language:Language):string[]{
 return language==="es"?[
  "profile: language-fixture","agentes: 0 activos, 0 en cola, 0 interrumpidos, 0 fallidos",
  "cambios de workspace: 0","habilidades: habilitadas (2)","historial: deshabilitado (opt-in)",
  "telemetria: deshabilitada (opt-in)","resumen: todo en calma, listo para trabajar","accion: listo para empezar",
 ]:[
  "profile: language-fixture","agents: 0 running, 0 queued, 0 interrupted, 0 failed",
  "workspace changes: 0","skills: enabled (2)","history: disabled (opt-in)",
  "telemetry: disabled (opt-in)","summary: quiet office, ready for owned work","action: Ready to start work",
 ];
}

// Follow the command-palette fixture's public fake-host lifecycle, not its test module.
async function fixture(t:TestContext,production=false){
 const root=await mkdtemp(path.join(os.tmpdir(),"asen-language-"));
 const home=path.join(root,"home"),project=path.join(root,"project");
 const previous=new Map<string,string|undefined>();
 let shutdown=async()=>{},effects=0;
 t.after(async()=>{
  try{await shutdown();assert.equal(effects,0,"Language inspection must not select, dispatch, rebind, edit or reload");}
  finally{try{await rm(root,{recursive:true,force:true});}finally{
   for(const [key,value] of previous)if(value===undefined)delete process.env[key];else process.env[key]=value;
  }}
 });
 await mkdir(project);
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")};
 for(const [key,value] of Object.entries(env)){
  await mkdir(value,{recursive:true});previous.set(key,process.env[key]);process.env[key]=value;
 }
 for(const key of ["ASEN_LANG","ASEN_NO_SKILL_REGISTRY"])previous.set(key,process.env[key]);
 delete process.env.ASEN_LANG;process.env.ASEN_NO_SKILL_REGISTRY="1";
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[];
 const forbidden=()=>{effects++;assert.fail("Unexpected native/provider effect");};
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},registerShortcut(){},
  getCommands(){assert.equal(this,pi);return [...commands].map(([name,command])=>({name,description:command.description,source:"extension"}));},
  getAllTools(){return [];},getFlag(){return false;},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>"language-fixture"},reload:forbidden,
  ui:{notify(message:string){notices.push(message);},setStatus(){},setWidget(){},select:forbidden,setEditorText:forbidden}};
 (production?createPiExtension:createAsenExtension)({homeDir:()=>home,packageRoot:root,
  registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,
  enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false,
  // Existing public status input seam: the real command still reads language and renders every row.
  status:()=>({agents:[],changes:[],agentsAvailable:true,changesAvailable:true,skills:{enabled:true,count:2},
   profile:"language-fixture",historyEnabled:false,telemetryEnabled:false}),
 })(pi as any);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 shutdown=()=>emit("session_shutdown");
 await emit("session_start");notices.length=0;
 const call=async(name:string,args="",headless=false)=>{
  notices.length=0;return await commands.get(name).handler(args,headless?{...ctx,hasUI:false,ui:undefined}:ctx);
 };
 return {call,notices,registered:()=>pi.getCommands(),async seed(raw:string){
  // Arrangement only; all verification goes through registered public handlers.
  await mkdir(path.dirname(languageConfigPath(home)),{recursive:true});
  await writeFile(languageConfigPath(home),raw,"utf8");
 },async inspect(){
  return {show:await call("asen-language","language show"),
   status:await call("asen-language","anything status"),rows:await call("asen-status")};
 }};
}
function expectedInspection(language:Language){
 return {show:{language,note},status:{language,note},rows:expectedStatus(language)};
}

describe("existing language preference reader contracts",{concurrency:false},()=>{
 test("single-token actions round-trip through public inspection and translated status",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));
  for(const [args,language] of [["en","en"],["es","es"],["  En \t ","en"],["\t ES  ","es"]] as const){
   assert.deepEqual(await f.call("asen-language",args),{language},args);
   assert.deepEqual(await f.inspect(),expectedInspection(language),args);
  }
 });

 test("single-token show/status and bare whitespace inspect without selecting",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));
  for(const args of ["show","status","  ShOw \t","\t StAtUs  ",""," \t\n "]){
   assert.deepEqual(await f.call("asen-language",args),{language:"es",note},args);
   assert.deepEqual(await f.inspect(),expectedInspection("es"),args);
  }
 });

 test("registered description and manual help name the actual hyphenated command",async t=>{
  const f=await fixture(t);
  assert.equal(f.registered().find(command=>command.name==="asen-language")?.description,description);
  const help=await f.call("asen-help","asen-language");
  assert.ok(Array.isArray(help));
  assert.ok(help.some((line:string)=>line.includes("Type /asen-language manually")));
  assert.ok(help.some((line:string)=>line.includes("Show/switch ASEN language: /asen-language")));
  assert.ok(help.every((line:string)=>!line.includes("/asen language")));
 });

 test("legacy second-token actions, arbitrary prefixes and ignored trailing tokens remain compatible",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));
  for(const [args,language] of [["anything en","en"],["anything es","es"],
   [" \tArBiTrArY  En ignored es ","en"],["en es","es"]] as const){
   assert.deepEqual(await f.call("asen-language",args),{language},args);
   assert.deepEqual(await f.inspect(),expectedInspection(language),args);
  }
  for(const args of ["anything show","anything status"," arbitrary ShOw ignored en ","en status es"]){
   assert.deepEqual(await f.call("asen-language",args),{language:"es",note},args);
   assert.deepEqual(await f.inspect(),expectedInspection("es"),args);
  }
 });

 test("invalid first or second tokens return truthful usage without changing public state",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));
  const before=await f.inspect();assert.equal(before.show.language,"es");
  assert.deepEqual(before.rows,expectedStatus("es"));
  for(const args of ["unsupported"," en unsupported es ","anything unsupported en"]){
   assert.deepEqual(await f.call("asen-language",args),usage,args);
   assert.deepEqual(await f.inspect(),before,args);
  }
 });

 test("single-token actions retain ASEN_LANG precedence without changing the stored preference contract",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));process.env.ASEN_LANG=" ES-mx ";
  assert.deepEqual(await f.call("asen-language","en"),{language:"en"});
  assert.deepEqual(await f.inspect(),expectedInspection("es"),"Environment still controls public inspection/status");
  delete process.env.ASEN_LANG;
  assert.deepEqual(await f.inspect(),expectedInspection("en"),"Accepted action persisted below the environment override");
 });

 test("headless no-UI invocations remain actions and inspection, never a selector",async t=>{
  const f=await fixture(t);await f.seed(JSON.stringify("es"));
  for(const [args,language] of [["en","en"],["es","es"]] as const){
   assert.deepEqual(await f.call("asen-language",args,true),{language},args);
   assert.deepEqual(await f.inspect(),expectedInspection(language),args);
  }
  for(const args of [""," \t ","show","status"])
   assert.deepEqual(await f.call("asen-language",args,true),{language:"es",note},args);
  assert.deepEqual(await f.call("asen-language","unsupported",true),usage);
  assert.deepEqual(await f.inspect(),expectedInspection("es"));
 });

 test("legacy accepted writes round-trip through language inspection and status",async t=>{
  const f=await fixture(t);
  // Start with es so the following en action exercises the writer, not a default no-op.
  await f.seed(JSON.stringify("es"));
  assert.deepEqual(await f.call("asen-language","language en"),{language:"en"});
  assert.deepEqual(await f.inspect(),expectedInspection("en"));
  assert.deepEqual(await f.call("asen-language","language es"),{language:"es"});
  // One regression assertion collects both reader consumers before comparing.
  assert.deepEqual(await f.inspect(),expectedInspection("es"));
  assert.deepEqual(await f.call("asen-language","language unsupported"),usage);
  assert.deepEqual(await f.inspect(),expectedInspection("es"),"Rejected input must preserve the written preference");
  assert.deepEqual(await f.call("asen-language","language en"),{language:"en"});
  assert.deepEqual(await f.inspect(),expectedInspection("en"));
 });

 test("legacy JSON strings retain existing normalization",async t=>{
  const f=await fixture(t);
  for(const [stored,language] of [["es","es"],["en","en"],[" ES-mx ","es"],[" EN-us ","en"]] as const){
   await f.seed(JSON.stringify(stored));
   assert.deepEqual(await f.inspect(),expectedInspection(language),stored);
  }
 });

 test("missing, malformed, unsupported JSON and invalid values keep English fallback",async t=>{
  const f=await fixture(t);
  assert.deepEqual(await f.inspect(),expectedInspection("en"),"Missing preference");
  for(const raw of ["{",'"fr"','""',"null","false","42","[]","{}",'{"lang":"fr"}',
   '{"lang":null}','{"lang":42}']){
   await f.seed(raw);assert.deepEqual(await f.inspect(),expectedInspection("en"),raw);
  }
 });

 test("ASEN_LANG precedence, normalization and empty fallback stay unchanged",async t=>{
  const f=await fixture(t);
  for(const [stored,env,language] of [["en"," ES-mx ","es"],["es"," EN-us ","en"],
   ["es","unsupported","en"],["es","","es"]] as const){
   await f.seed(JSON.stringify(stored));process.env.ASEN_LANG=env;
   assert.deepEqual(await f.inspect(),expectedInspection(language),env);
  }
  await f.seed("{");process.env.ASEN_LANG="es";
  assert.deepEqual(await f.inspect(),expectedInspection("es"),"Environment also wins after parse failure");
  delete process.env.ASEN_LANG;await f.seed(JSON.stringify("es"));
  assert.deepEqual(await f.inspect(),expectedInspection("es"));
 });

 test("production wrappers publish language and status notifications, not return objects",async t=>{
  const f=await fixture(t,true);await f.seed(JSON.stringify("es"));
  for(const args of ["language show","anything status"]){
   await f.call("asen-language",args);
   assert.deepEqual(f.notices.map(message=>JSON.parse(message)),[{language:"es",note}]);
  }
  await f.call("asen-status");assert.deepEqual(f.notices,[expectedStatus("es").join("\n")]);
  await f.call("asen-language","language en");
  assert.deepEqual(f.notices.map(message=>JSON.parse(message)),[{language:"en"}]);
  await f.call("asen-status");assert.deepEqual(f.notices,[expectedStatus("en").join("\n")]);
 });
});
