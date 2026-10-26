import assert from "node:assert/strict";
import {access,mkdir,readFile,realpath,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {Agent,runToolCall} from "@earendil-works/pi-agent-core";
import {
 AgentSession,
 DefaultResourceLoader,
 SessionManager,
 SettingsManager,
 type ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import {createPiExtension} from "../extensions/asen.js";

const skillDocument=(description:string)=>`---\nname: lifecycle-proof\ndescription: ${description}\n---\n\n# Lifecycle proof\n\nUse only owned fixture data.\n`;
const absent=async(file:string):Promise<boolean>=>{
 try{await access(file);return false;}catch(error){return (error as NodeJS.ErrnoException).code==="ENOENT";}
};

type Notice={message:string;level:string|undefined};
type SessionFixture={
 session:AgentSession;
 loader:DefaultResourceLoader;
 notices:Notice[];
 providerAttempts:()=>number;
 close:(reason?:"quit"|"reload")=>Promise<void>;
};

function fixtureRoot():string{
 const value=process.env.ASEN_T06_FIXTURE_ROOT;
 if(!value||!path.isAbsolute(value))throw new Error("ASEN_T06_FIXTURE_ROOT must be an absolute parent-owned fixture path");
 return path.resolve(value);
}

function ui(notices:Notice[],confirmations:{count:number}):ExtensionUIContext{
 return {
  select:async()=>undefined,
  confirm:async()=>{confirmations.count++;return true;},
  input:async()=>undefined,
  notify:(message,level)=>notices.push({message,level}),
  onTerminalInput:()=>()=>{},
  setStatus:()=>{},setWorkingMessage:()=>{},setWorkingVisible:()=>{},setWorkingIndicator:()=>{},
  setHiddenThinkingLabel:()=>{},setWidget:()=>{},setFooter:()=>{},setHeader:()=>{},setTitle:()=>{},
  custom:async()=>{throw new Error("custom UI is outside this fixture");},
  pasteToEditor:()=>{},setEditorText:()=>{},getEditorText:()=>"",editor:async()=>undefined,
  addAutocompleteProvider:()=>{},setEditorComponent:()=>{},getEditorComponent:()=>undefined,
  theme:{} as ExtensionUIContext["theme"],getAllThemes:()=>[],getTheme:()=>undefined,
  setTheme:()=>({success:false,error:"themes are outside this fixture"}),
  getToolsExpanded:()=>false,setToolsExpanded:()=>{},
 };
}

async function openSession(input:{project:string;agentDir:string;home:string;packageRoot:string;memoryFile:string}):Promise<SessionFixture>{
 const notices:Notice[]=[],confirmations={count:0},settings=SettingsManager.inMemory({
  compaction:{enabled:false},retry:{enabled:false},
 });
 let providerCalls=0;
 const loader=new DefaultResourceLoader({
  cwd:input.project,
  agentDir:input.agentDir,
  settingsManager:settings,
  additionalSkillPaths:[path.join(input.packageRoot,"skills")],
  extensionFactories:[{
   name:"asen-sdk-lifecycle-proof",
   factory:createPiExtension({
    homeDir:()=>input.home,
    packageRoot:input.packageRoot,
    memoryStoreFile:input.memoryFile,
    enableMemoryRuntime:true,
    enableAgentRuntime:false,
    enableTodoRuntime:false,
    enableWorkspaceRuntime:false,
    registryLifecycle:{watch:()=>({close(){}}),debounceMs:0},
   }),
  }],
  noExtensions:true,
  noPromptTemplates:true,
  noThemes:true,
  noContextFiles:true,
 });
 await loader.reload();
 assert.deepEqual(loader.getExtensions().errors,[]);
 const agent=new Agent({streamFn:(()=>{
  providerCalls++;
  throw new Error("provider transport must not be reached by the SDK lifecycle fixture");
 }) as never});
 const session=new AgentSession({
  agent,
  sessionManager:SessionManager.inMemory(input.project),
  settingsManager:settings,
  cwd:input.project,
  resourceLoader:loader,
  modelRuntime:Object.freeze({getApiKey:()=>{throw new Error("authentication lookup must not be reached");}}) as never,
  initialActiveToolNames:["write"],
 });
 await session.bindExtensions({mode:"rpc",uiContext:ui(notices,confirmations)});
 let closed=false;
 return {
  session,loader,notices,providerAttempts:()=>providerCalls,
  close:async(reason="quit")=>{
   if(closed)return;
   closed=true;
   try{await session.extensionRunner.emit({type:"session_shutdown",reason});}
   finally{session.dispose();}
  },
 };
}

function assistantMessage(){
 return {
  role:"assistant",content:[],api:"openai-completions",provider:"fixture",model:"no-transport",
  usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
  stopReason:"toolUse",timestamp:Date.now(),
 } as const;
}

async function executeThroughSdk(session:AgentSession,name:string,args:Record<string,string>,id:string){
 const tools=session.agent.state.tools??[],beforeToolCall=session.agent.beforeToolCall,afterToolCall=session.agent.afterToolCall;
 assert.ok(beforeToolCall,"AgentSession must install the public extension pre-execution pipeline");
 assert.ok(tools.some(tool=>tool.name===name),`${name} must be registered in the AgentSession tool set`);
 return runToolCall(
  {type:"toolCall",id,name,arguments:args},
  {tools,assistantMessage:assistantMessage() as never,context:{messages:[],tools},beforeToolCall,...(afterToolCall?{afterToolCall}:{})},
 );
}

async function memoryContext(session:AgentSession,project:string,query:string):Promise<string>{
 const result=await session.extensionRunner.emitBeforeAgentStart(
  {messageType:"user",prompt:query},
  {cwd:project,selectedTools:session.getActiveToolNames(),sections:{},skills:session.resourceLoader.getSkills().skills},
 );
 return result.systemPromptOptions.sections.asen_project_memory_context??"";
}

async function invokeCommand(session:AgentSession,notices:Notice[],command:string):Promise<string>{
 const registered=session.extensionRunner.getRegisteredCommands().map(item=>item.invocationName);
 const name=command.slice(1).split(/\s/u,1)[0]!;
 assert.ok(registered.includes(name),`/${name} must be registered before slash dispatch`);
 const start=notices.length;
 await session.prompt(command,{source:"rpc"});
 assert.equal(notices.length,start+1,`/${name} must be consumed by the extension command parser`);
 return notices.at(-1)!.message;
}

test("SDK 1.2 session lifecycle composes ASEN memory, skills, reload, isolation, and sensitive denial",async t=>{
 const opened:SessionFixture[]=[];
 t.after(async()=>{for(const fixture of [...opened].reverse())await fixture.close();});
 const trackedOpen=async(input:Parameters<typeof openSession>[0])=>{
  const fixture=await openSession(input);opened.push(fixture);return fixture;
 };
 const owned=fixtureRoot(),projectA=path.join(owned,"project-a"),projectB=path.join(owned,"project-b"),
  home=path.join(owned,"home"),agentDir=path.join(owned,"pi-agent"),packageRoot=path.join(owned,"package"),
  skillDirectory=path.join(packageRoot,"skills","lifecycle-proof"),skillFile=path.join(skillDirectory,"SKILL.md"),
  missingSkill=path.join(skillDirectory,"SKILL.missing.md"),memoryFile=path.join(home,".asen","memory.db");
 await Promise.all([projectA,projectB,home,agentDir,skillDirectory].map(directory=>mkdir(directory,{recursive:true})));
 await writeFile(skillFile,skillDocument("Initial public SDK resource."),"utf8");
 const canonicalA=await realpath(projectA),canonicalB=await realpath(projectB);

 const first=await trackedOpen({project:canonicalA,agentDir,home,packageRoot,memoryFile});
 assert.ok(first.session.getActiveToolNames().includes("asen_memory_save"));
 assert.ok(first.session.extensionRunner.getRegisteredCommands().some(command=>command.invocationName==="asen-memory"));
 assert.deepEqual(first.loader.getSkills().skills.map(skill=>skill.name),["lifecycle-proof"]);
 assert.match(first.notices.map(item=>item.message).join("\n"),/ASEN skill registry startup: skills=1/);

 const durable="Stored descriptions are context only; every scoped writer still needs fresh admission before changing files.";
 const saved=await executeThroughSdk(first.session,"asen_memory_save",{
  kind:"decision",title:"Fresh writer admission remains mandatory",content:durable,topic:"writer-admission-lifecycle",
 },"save-lifecycle-memory");
 assert.equal(saved.isError,false);
 const firstSearch=await invokeCommand(first.session,first.notices,"/asen-memory search writer admission lifecycle");
 assert.match(firstSearch,/Fresh writer admission remains mandatory/);
 assert.match(await memoryContext(first.session,canonicalA,"How is writer admission recovered?"),/every scoped writer still needs fresh admission/);

 const protectedFile=path.join(canonicalA,".env.lifecycle-denied");
 assert.equal(await absent(protectedFile),true);
 const denial=await executeThroughSdk(first.session,"write",{path:protectedFile,content:"must not be written"},"deny-sensitive-write");
 assert.equal(denial.isError,true);
 assert.match(denial.result.content.map(item=>"text" in item?item.text:"").join("\n"),/primary tool policy blocked sensitive path access/);
 assert.equal(await absent(protectedFile),true);
 assert.equal(first.providerAttempts(),0);
 await first.close();

 const reopened=await trackedOpen({project:canonicalA,agentDir,home,packageRoot,memoryFile});
 const resumed=await memoryContext(reopened.session,canonicalA,"What survives a restart about writer admission?");
 assert.match(resumed,/Latest Session Summary/);
 assert.match(resumed,/every scoped writer still needs fresh admission/);
 const resumedSearch=await invokeCommand(reopened.session,reopened.notices,"/asen-memory search writer admission lifecycle");
 assert.match(resumedSearch,/Fresh writer admission remains mandatory/);

 await rename(skillFile,missingSkill);
 await reopened.session.reload();
 assert.equal(reopened.loader.getSkills().skills.some(skill=>skill.name==="lifecycle-proof"),false);
 assert.match(await invokeCommand(reopened.session,reopened.notices,"/asen-skill-registry refresh"),/skills=0/);
 await writeFile(skillFile,skillDocument("Recreated through public SDK reload."),"utf8");
 await reopened.session.reload();
 const reloadedSkill=reopened.loader.getSkills().skills.find(skill=>skill.name==="lifecycle-proof");
 assert.ok(reloadedSkill);
 assert.match(reloadedSkill.description,/Recreated through public SDK reload/);
 assert.match(await readFile(path.join(canonicalA,".asen","skill-registry.md"),"utf8"),/Recreated through public SDK reload/);

 const id=/^([^ |]+)/u.exec(resumedSearch)?.[1];
 assert.ok(id,"public memory search must return the observation id");
 assert.match(await invokeCommand(reopened.session,reopened.notices,`/asen-memory forget ${id}`),/Recuerdo borrado/);
 assert.match(await invokeCommand(reopened.session,reopened.notices,"/asen-memory search writer admission lifecycle"),/No hay recuerdos relacionados/);
 assert.equal(reopened.providerAttempts(),0);
 await reopened.close();

 const isolated=await trackedOpen({project:canonicalB,agentDir,home,packageRoot,memoryFile});
 assert.match(await invokeCommand(isolated.session,isolated.notices,"/asen-memory search writer admission lifecycle"),/No hay recuerdos relacionados/);
 assert.doesNotMatch(await memoryContext(isolated.session,canonicalB,"writer admission lifecycle"),/every scoped writer still needs fresh admission/);
 assert.equal(isolated.providerAttempts(),0);
 await isolated.close();
});
